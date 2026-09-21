// ArguMesh 桌面壳(最小可用版)。
//
// 职责只有三件事:
//   1. 首次启动把 template/argumesh.db(仅表结构)复制到用户数据目录;
//   2. 用 PORT=0 拉起 Node sidecar,从 stdout 拿到系统分配的真实端口;
//   3. 把窗口导航到 http://127.0.0.1:<port>/。
//
// 这里刻意不放任何业务逻辑:前端与 API 全在 server.mjs 里,壳只是宿主。
// 端口用 0(系统分配)而不是写死 8787 —— 用户机器上 8787 可能已被别的程序占用,
// 写死会让 ArguMesh 静默起不来。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;

/// sidecar 拉起后的等待上限。冷启动 + SQLite 打开通常 <2s,给到 90s 是留给
/// 杀毒软件首次扫描 node.exe 的情况。
const SIDECAR_BOOT_TIMEOUT: Duration = Duration::from_secs(90);

/// 壳退出时给 sidecar 的善后时间。
const SIDECAR_KILL_GRACE: Duration = Duration::from_secs(3);

struct SidecarProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(SidecarProcess(Mutex::new(Option::None)))
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("tauri.conf.json 里声明了 label 为 main 的窗口");

            match launch_sidecar(app.handle()) {
                Ok(port) => {
                    let url = format!("http://127.0.0.1:{port}/");
                    // 先加载的 assets/index.html 是启动占位页,这里整体替换掉。
                    if let Err(err) = window.eval(&format!("window.location.replace({url:?});")) {
                        show_error(
                            &window,
                            &format!("窗口跳转失败: {err}\n\n目标地址 {url}"),
                        );
                    }
                }
                Err(err) => show_error(&window, &err),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用失败")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                    stop_sidecar(&state);
                }
            }
        });
}

/// 在占位页上显示错误。用 eval 而不是改 DOM,避免和随后的跳转互相覆盖。
fn show_error(window: &tauri::WebviewWindow, message: &str) {
    let escaped = serde_json::to_string(message).unwrap_or_else(|_| "\"未知错误\"".into());
    let js = format!(
        "document.getElementById('status').textContent = '启动失败';\
         document.getElementById('detail').textContent = {escaped};\
         document.getElementById('spinner').style.display = 'none';"
    );
    let _ = window.eval(&js);
}

// ─────────────────────────── sidecar 生命周期 ───────────────────────────

fn launch_sidecar(app: &tauri::AppHandle) -> Result<u16, String> {
    let sidecar_dir = resolve_sidecar_dir(app)?;
    let data_dir = resolve_data_dir(app)?;

    let node_exe = sidecar_dir.join("node.exe");
    let server_mjs = sidecar_dir.join("server.mjs");
    for path in [&node_exe, &server_mjs] {
        if !path.is_file() {
            return Err(format!(
                "sidecar 不完整:找不到 {}。\n安装可能损坏,请重装。",
                path.display()
            ));
        }
    }

    // 首次运行:把仅含结构的空库复制过去。已存在则一律不动 —— 用户数据最大。
    let db_path = data_dir.join("data").join("argumesh.db");
    if !db_path.exists() {
        let template = sidecar_dir.join("template").join("argumesh.db");
        if !template.is_file() {
            return Err(format!(
                "找不到空库模板 {}。\n安装可能损坏,请重装。",
                template.display()
            ));
        }
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建数据目录 {} 失败: {e}", parent.display()))?;
        }
        fs::copy(&template, &db_path).map_err(|e| {
            format!(
                "初始化数据库失败:{} → {}: {e}",
                template.display(),
                db_path.display()
            )
        })?;
    }

    let log_path = data_dir.join("sidecar.log");
    log_line(
        &log_path,
        &format!(
            "── 启动 sidecar ──\n  sidecar_dir = {}\n  node_exe    = {}\n  server_mjs  = {}\n  db_path     = {}",
            sidecar_dir.display(),
            node_exe.display(),
            server_mjs.display(),
            db_path.display()
        ),
    );

    let mut command = Command::new(&node_exe);
    command
        .arg(&server_mjs)
        .current_dir(&sidecar_dir)
        // 见 server/node.ts:cwd 决定 serveStatic({root:"./dist"}) 能否找到前端
        .env("PORT", "0")
        .env("DATABASE_URL", format!("file:{}", db_path.display()))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 别弹黑色控制台窗口;同时让 node 别再自己找 .env(壳已经用环境变量给了全部配置)。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|e| {
        log_line(&log_path, &format!("spawn 失败: {e}"));
        format!("启动 Node 失败({}): {e}", node_exe.display())
    })?;
    log_line(&log_path, &format!("spawn 成功,子进程 PID = {}", child.id()));

    // stderr 必须从一开始就读。它承载 sidecar 的崩溃栈,是「起不来」时唯一的线索。
    // 早先这段代码放在拿到端口之后,于是失败时日志里一个字节都没有 —— 这次排查
    // 「服务进程提前退出」卡了这么久,直接原因就是看不到 stderr。
    if let Some(stderr) = child.stderr.take() {
        let log_path = log_path.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                log_line(&log_path, &format!("[stderr] {line}"));
            }
            log_line(&log_path, "[stderr] 流已关闭");
        });
    }

    let port = match read_sidecar_port(&mut child, &log_path) {
        Ok(port) => port,
        Err(err) => {
            // 失败路径也要收拾子进程:退出码是定位原因的第一手信息,
            // 不 kill 的话会留下一个没人管的孤儿 node.exe(之前实测会漏)。
            log_line(&log_path, &format!("读取端口失败: {err}"));
            let _ = child.kill();
            match child.wait() {
                Ok(status) => log_line(&log_path, &format!("子进程已退出,status = {status}")),
                Err(e) => log_line(&log_path, &format!("wait 子进程失败: {e}")),
            }
            return Err(err);
        }
    };

    if let Some(state) = app.try_state::<SidecarProcess>() {
        *state.0.lock().unwrap() = Some(child);
    }

    Ok(port)
}

/// 往 sidecar.log 追一行。写失败就静默跳过 —— 诊断信息不该成为让应用起不来的理由。
///
/// 故意每次重新打开而不是复用一个带缓冲的句柄:壳随时可能被 kill,
/// 缓冲里的内容会跟着一起消失,而排查启动故障时恰恰只剩最后几行。
///
/// 加锁 + 整行一次写出,两件事都是必须的:
///   - `writeln!` 走 `write_fmt`,会按格式串的片段分多次 `write_all`;
///   - stdout / stderr 两个读取线程并发调用这里。
/// 不处理的话两行日志会互相插队(实测 `[stderr] 流已关闭` 和
/// `[stdout] 流已关闭(...)` 被拼成了同一行),而日志串行恰恰发生在
/// 最需要读清它的启动失败场景里。
static LOG_LOCK: Mutex<()> = Mutex::new(());

fn log_line(path: &std::path::Path, message: &str) {
    // 锁被污染也照样拿句柄:日志写不进去不该连带把调用方一起 panic 掉。
    let _guard = LOG_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let mut line = String::with_capacity(message.len() + 1);
        line.push_str(message);
        line.push('\n');
        let _ = file.write_all(line.as_bytes());
    }
}

/// 从 stdout 里找 `ARGUMESH_PORT=<port>`。
///
/// 放在单独线程里读:否则 sidecar 若卡住不输出,主线程会一起挂死,连错误页都渲染不出来。
///
/// 两种失败的含意完全不同,错误文案必须能区分:
///   - 超时 → 子进程还活着但迟迟不上报(实测冷启动要 8~75 秒,杀毒软件首扫
///     13 MB 的 server.mjs 时会拖到上限);
///   - 断开 → 子进程已经退了,去日志里看它留下的 [stderr]。
fn read_sidecar_port(child: &mut Child, log_path: &std::path::Path) -> Result<u16, String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "拿不到 sidecar 的 stdout,无法读取分配的端口".to_string())?;

    let (tx, rx): (mpsc::Sender<u16>, Receiver<u16>) = mpsc::channel();
    let log_path = log_path.to_path_buf();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            log_line(&log_path, &format!("[stdout] {line}"));
            if let Some(value) = line.strip_prefix("ARGUMESH_PORT=") {
                if let Ok(port) = value.trim().parse::<u16>() {
                    let _ = tx.send(port);
                }
            }
        }
        log_line(&log_path, "[stdout] 流已关闭(子进程退出或关闭了 stdout)");
    });

    match rx.recv_timeout(SIDECAR_BOOT_TIMEOUT) {
        Ok(port) => Ok(port),
        Err(mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "等待服务启动超时({} 秒)。\n日志:{}",
            SIDECAR_BOOT_TIMEOUT.as_secs(),
            sidecar_log_hint()
        )),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(format!(
            "服务进程提前退出,没有上报端口。\n日志:{}",
            sidecar_log_hint()
        )),
    }
}

fn stop_sidecar(state: &SidecarProcess) {
    let Ok(mut guard) = state.0.lock() else { return };
    let Some(child) = guard.as_mut() else { return };

    // Windows 上没有信号可发,只能 kill;先 kill 再 wait,避免留下孤儿 node.exe。
    let _ = child.kill();
    let deadline = Instant::now() + SIDECAR_KILL_GRACE;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }
}

fn sidecar_log_hint() -> String {
    resolve_data_dir_fallback()
        .map(|d| d.join("sidecar.log").display().to_string())
        .unwrap_or_else(|| "用户数据目录下的 sidecar.log".into())
}

// ─────────────────────────── 路径解析 ───────────────────────────

/// 剥掉 Windows 的 `\\?\` 长路径前缀。
///
/// 为什么必须剥:`\\?\` 是 Win32 API 层的扩展路径语法,CreateProcess 认它,但
/// Node 不认 —— 把它当普通字符拼进 cwd 和模块路径后,node.exe 会在跑任何 JS
/// 之前就退出,而且 stdout/stderr 都不产出一行。壳只能看到「stdout 断开」,
/// 于是报「服务进程提前退出」,日志里却什么都没有,极难排查。
///
/// 来源不止一处:Tauri 的 `resource_dir()` 在 Windows 上就带这个前缀,
/// `canonicalize()` 的结果也带。所以每条候选路径都要过一遍,而不是只处理某一处。
///
/// UNC 形式 `\\?\UNC\server\share` 还原成 `\\server\share`,别把 `UNC\` 当成盘符。
fn strip_long_path_prefix(path: &std::path::Path) -> PathBuf {
    let text = path.as_os_str().to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => match rest.strip_prefix("UNC\\") {
            Some(unc) => PathBuf::from(format!(r"\\{unc}")),
            None => PathBuf::from(rest),
        },
        None => path.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn strips_win32_long_path_prefix() {
        // 这个函数是「安装后起不来」那场排查的落点:Tauri 的 resource_dir() 返回带
        // 前缀的路径,原样交给 node.exe 会让它启动即静默退出。回归测试钉住行为。
        assert_eq!(
            strip_long_path_prefix(Path::new(r"\\?\C:\Users\me\AppData\Local\ArguMesh")),
            PathBuf::from(r"C:\Users\me\AppData\Local\ArguMesh")
        );
    }

    #[test]
    fn restores_unc_form() {
        assert_eq!(
            strip_long_path_prefix(Path::new(r"\\?\UNC\server\share\ArguMesh")),
            PathBuf::from(r"\\server\share\ArguMesh")
        );
    }

    #[test]
    fn leaves_plain_paths_untouched() {
        for raw in [
            r"C:\Users\me\AppData\Local\ArguMesh",
            r"\\server\share\ArguMesh",
            "/home/me/argumesh",
            "",
        ] {
            assert_eq!(
                strip_long_path_prefix(Path::new(raw)),
                PathBuf::from(raw),
                "不应改动 {raw:?}"
            );
        }
    }

    #[test]
    fn keeps_paths_that_merely_start_with_two_backslashes() {
        // `\\?` 必须紧跟 UNC 或盘符才算前缀;`\\?abc` 只是普通(奇怪)路径,不能误剥。
        assert_eq!(
            strip_long_path_prefix(Path::new(r"\\?abc")),
            PathBuf::from(r"\\?abc")
        );
    }
}

/// sidecar 资源目录。
///
/// 依次尝试:环境变量覆盖(本地调试)→ 安装后的资源目录 → 可执行文件旁边。
///
/// tauri.conf.json 的 bundle.resources 用 map 形式把 ../build/sidecar/** 重定向到
/// sidecar/,所以安装后落在 <资源目录>/sidecar/。写成 map 而不是数组是必须的:
/// 数组形式会保留「相对 src-tauri/ 的原始路径」,而 sidecar 在 crate 目录之外,
/// `..` 会被 tauri 编码成字面量 `_up_` 目录 —— 文件确实装上了,但落在
/// <安装目录>/_up_/build/sidecar/,运行时并不剥离这个前缀,壳也就找不到。
/// `_up_` 那条候选留着兜底:配置万一被改回数组形式,壳照样能起来。
///
/// 每条候选都要过一遍 strip_long_path_prefix():Tauri 的 resource_dir() 在 Windows 上
/// 返回 `\\?\C:\...` 形式的长路径,而它排在候选第一位,不剥掉就会带着前缀去 spawn
/// node.exe —— 那种情况下 node 启动即静默退出,壳只能报「服务进程提前退出」。
fn resolve_sidecar_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("ARGUMESH_SIDECAR_DIR") {
        let dir = PathBuf::from(dir);
        if dir.is_dir() {
            return Ok(dir);
        }
        return Err(format!(
            "ARGUMESH_SIDECAR_DIR 指向的目录不存在: {}",
            dir.display()
        ));
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    // 资源目录的实际布局取决于 tauri.conf.json 的 resources 通配符怎么落地,
    // 多试几个候选比赌一个路径稳。
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_dir = strip_long_path_prefix(&resource_dir);
        candidates.push(resource_dir.join("sidecar"));
        candidates.push(resource_dir.join("_up_").join("build").join("sidecar"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = strip_long_path_prefix(&exe).parent().map(PathBuf::from) {
            candidates.push(exe_dir.join("sidecar"));
            // 本地直接跑 target/release/argumesh.exe 调试时,sidecar 还在仓库的 build/ 下。
            candidates.push(
                exe_dir
                    .join("..")
                    .join("..")
                    .join("..")
                    .join("build")
                    .join("sidecar"),
            );
        }
    }

    for candidate in &candidates {
        if candidate.join("server.mjs").is_file() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "找不到 sidecar 资源目录。已尝试:\n{}",
        candidates
            .iter()
            .map(|c| format!("  {}", c.display()))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

/// 用户数据目录。默认 %LOCALAPPDATA%\ArguMesh,可用 ARGUMESH_DATA_DIR 覆盖。
///
/// 刻意不用 Tauri 的 app_local_data_dir():那个目录名取自 bundle identifier
/// (com.argumesh.desktop),用户在自己机器上看到一串点分名字并不友好,而且
/// 备份/迁移时要拼错路径。数据库与日志都在这里,卸载程序不会动它。
fn resolve_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("ARGUMESH_DATA_DIR") {
        let dir = strip_long_path_prefix(&PathBuf::from(dir));
        fs::create_dir_all(&dir).map_err(|e| format!("创建 {} 失败: {e}", dir.display()))?;
        return Ok(dir);
    }

    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| app.path().app_local_data_dir().ok())
        .map(|p| strip_long_path_prefix(&p))
        .ok_or_else(|| "无法定位用户数据目录(LOCALAPPDATA 未设置)".to_string())?;

    let dir = base.join("ArguMesh");
    fs::create_dir_all(&dir).map_err(|e| format!("创建 {} 失败: {e}", dir.display()))?;
    Ok(dir)
}

/// 只用于错误文案里提示日志位置,失败也无所谓。
fn resolve_data_dir_fallback() -> Option<PathBuf> {
    let base = std::env::var_os("ARGUMESH_DATA_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(PathBuf::from))?;
    Some(base.join("ArguMesh"))
}
