import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeSlash, IdentificationCard, Key, Spinner, WarningCircle } from "@phosphor-icons/react";
import { useAuth } from "../state/auth";
import { BrandMark } from "./BrandMark";

interface AccessGateProps {
  errorMessage?: string | null;
}

/**
 * 双字段登录表单:用户名 + 密码。
 * 校验数据库中的账户(PBKDF2 口令哈希);登录后由 AuthProvider 维护 sessionStorage 会话。
 *
 * 设计要点(2026-08-13):
 *  - 单列居中,大标题 + 留白,主 CTA 占满卡片宽度
 *  - 输入框左侧带语义图标,高度 48px 满足触摸目标
 *  - 错误提示带左侧色条 + 图标,字号 14px,行高 1.5
 *  - 弱化账户提示(只显示姓名,不显示密码),帮首次使用者快速识别
 *  - 提交按钮在 loading 时显示内嵌 Spinner,避免布局跳动
 */
export function AccessGate({ errorMessage }: AccessGateProps) {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage ?? null);
  const [submitting, setSubmitting] = useState(false);
  const nameId = useId();
  const passwordId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextName = name.trim();
    if (!nextName) {
      setError("请输入用户名");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await auth.signIn(nextName, password);
    if (result) {
      setError(result.message);
      setSubmitting(false);
      if (result.code === "INVALID_CREDENTIALS") setPassword("");
    }
    // 成功:AuthProvider 已切换 session,AccessGate 会自动卸载,无需 setSubmitting(false)。
  }

  return (
    <main className="access-screen" aria-labelledby={`${nameId}-title`}>
      <form className="access-card" onSubmit={onSubmit} noValidate aria-describedby={`${nameId}-desc`}>
        <header className="access-header">
          <div className="access-brand">
            <BrandMark />
          </div>
          <span className="eyebrow">ArguMesh · 论脉</span>
          <h1 id={`${nameId}-title`}>登录论文工作台</h1>
          <p id={`${nameId}-desc`}>
            把证据连成研究脉络。首次使用请用默认管理员登录,再由管理员为其他成员创建账号。
          </p>
        </header>

        {error ? (
          <div className="access-error" role="alert">
            <WarningCircle weight="fill" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="access-field">
          <label htmlFor={nameId}>用户名</label>
          <div className="access-input">
            <IdentificationCard aria-hidden />
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              autoComplete="username"
              autoFocus
              placeholder="例如:admin"
              spellCheck={false}
              required
            />
          </div>
        </div>

        <div className="access-field">
          <label htmlFor={passwordId}>密码</label>
          <div className="access-input">
            <Key aria-hidden />
            <input
              id={passwordId}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              autoComplete="current-password"
              placeholder="8 位密码"
              required
            />
            <button
              type="button"
              className="access-input-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              aria-pressed={showPassword}
              tabIndex={-1}
            >
              {showPassword ? <EyeSlash /> : <Eye />}
            </button>
          </div>
        </div>

        <button className="access-submit" type="submit" disabled={submitting || !name.trim() || !password}>
          {submitting ? (
            <>
              <Spinner className="access-spinner" /> 正在登录…
            </>
          ) : (
            <>
              进入工作台 <ArrowRight />
            </>
          )}
        </button>

        <footer className="access-foot">
          <span>默认管理员账号</span>
          <ul>
            <li>admin / admin123</li>
          </ul>
        </footer>
      </form>
    </main>
  );
}
