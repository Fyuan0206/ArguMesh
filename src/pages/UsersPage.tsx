import { Plus, Trash, UserCircle } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { createUser, deleteUser, listUsers, patchUser, type RemoteUser } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../state/auth";

/**
 * 用户管理页(仅 admin 路由可达,后端 /api/users 也会校验角色)。
 * 管理员在这里为其他成员创建登录账号、重置密码、调整角色或删除账号。
 */
export function UsersPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<RemoteUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setError("");
    try {
      const payload = await listUsers();
      setUsers(payload.users);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const role = String(form.get("role") ?? "researcher") as "admin" | "researcher";
    if (!name || password.length < 6) return;
    setCreating(true);
    setError("");
    try {
      await createUser({ name, password, role });
      (event.target as HTMLFormElement).reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建账号失败");
    } finally {
      setCreating(false);
    }
  }

  async function toggleRole(user: RemoteUser) {
    setError("");
    try {
      await patchUser(user.id, { role: user.role === "admin" ? "researcher" : "admin" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改角色失败");
    }
  }

  async function resetPassword(user: RemoteUser) {
    const password = window.prompt(`为用户「${user.name}」设置新密码(至少 6 位):`);
    if (password === null) return;
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    setError("");
    try {
      await patchUser(user.id, { password });
      window.alert(`用户「${user.name}」的密码已更新。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重置密码失败");
    }
  }

  async function removeUser(user: RemoteUser) {
    if (!window.confirm(`确定删除用户「${user.name}」?其项目、文献与证据数据将一并删除,不可恢复。`)) return;
    setError("");
    try {
      await deleteUser(user.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除用户失败");
    }
  }

  return (
    <div className="route-page users-page">
      <PageHeader eyebrow="管理员" title="用户管理" />
      {error ? <p className="settings-message">{error}</p> : null}
      <form className="surface-card user-create" onSubmit={submitCreate}>
        <div className="section-heading"><div><span className="eyebrow">新账号</span><h2>为用户创建登录账号</h2></div></div>
        <div className="user-create-row">
          <label className="field"><span>用户名</span><input name="name" placeholder="例如:zhang-san" required /></label>
          <label className="field"><span>密码(至少 6 位)</span><input name="password" type="password" minLength={6} required /></label>
          <label className="field"><span>角色</span><select name="role"><option value="researcher">研究者</option><option value="admin">管理员</option></select></label>
          <button className="primary" type="submit" disabled={creating}>{creating ? "创建中…" : <><Plus />创建账号</>}</button>
        </div>
      </form>
      <section className="surface-card user-list">
        <div className="section-heading"><div><span className="eyebrow">账号列表</span><h2>全部用户 · {users.length}</h2></div></div>
        {loading ? <p>加载中…</p> : null}
        {users.map((user) => (
          <article key={user.id} className="user-row">
            <span className="user-avatar"><UserCircle /></span>
            <div className="user-info">
              <strong>{user.name}</strong>
              <small>{user.role === "admin" ? "管理员" : "研究者"} · 创建于 {new Date(user.createdAt).toLocaleDateString("zh-CN")}</small>
            </div>
            <span className="user-actions">
              {user.id === auth.session?.accountId ? (
                <small className="user-self">当前账号</small>
              ) : (
                <>
                  <button className="secondary-button" onClick={() => void toggleRole(user)}>{user.role === "admin" ? "降为研究者" : "设为管理员"}</button>
                  <button className="secondary-button" onClick={() => void resetPassword(user)}>重置密码</button>
                  <button className="danger-button" onClick={() => void removeUser(user)}><Trash />删除</button>
                </>
              )}
            </span>
          </article>
        ))}
        {!loading && users.length === 0 ? <p>还没有其他用户。</p> : null}
      </section>
    </div>
  );
}
