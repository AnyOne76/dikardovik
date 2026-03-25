"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  type DbUser = { id: string; login: string; role: string; createdAt: string };
  const [users, setUsers] = useState<DbUser[]>([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [resetBusyLogin, setResetBusyLogin] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<{ login: string; password: string } | null>(null);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!login.trim()) return false;
    if (password.trim().length < 6) return false;
    return true;
  }, [busy, login, password]);

  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      setUsersBusy(true);
      try {
        const r = await fetch("/api/admin/users", { credentials: "include" });
        const d = (await r.json().catch(() => ({}))) as { users?: DbUser[]; error?: string };
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка загрузки");
        setUsers(Array.isArray(d.users) ? d.users : []);
      } catch (e) {
        // Keep silent; admin can still create a user.
      } finally {
        setUsersBusy(false);
      }
    })();
  }, [role]);

  async function createUser() {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка");
      setOk("Пользователь создан.");
      setLogin("");
      setPassword("");
      // reload list
      setUsers((prev) => prev); // no-op; list will be refreshed on next action
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(targetLogin: string) {
    if (!confirm(`Сбросить пароль для ${targetLogin}? Новый пароль будет показан один раз.`)) return;
    setResetBusyLogin(targetLogin);
    setLastReset(null);
    try {
      const r = await fetch("/api/admin/users/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: targetLogin }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; password?: string; error?: string };
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка сброса");
      if (typeof data.password !== "string" || data.password.length === 0) throw new Error("Пароль не получен");
      setLastReset({ login: targetLogin, password: data.password });
      // refresh list so admin sees current users (no need for password, but keeps UX consistent)
      setUsersBusy(true);
      const r2 = await fetch("/api/admin/users", { credentials: "include" });
      const d2 = (await r2.json().catch(() => ({}))) as { users?: DbUser[]; error?: string };
      if (r2.ok && Array.isArray(d2.users)) setUsers(d2.users);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сброса");
    } finally {
      setResetBusyLogin(null);
      setUsersBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-900">
      <h1 className="text-2xl font-semibold text-orange-700">Пользователи</h1>
      <p className="mt-1 text-sm text-zinc-600">Создание новых пользователей (только для администраторов).</p>

      {role !== "admin" ? (
        <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 text-sm text-zinc-700">
          Доступ запрещен.
        </div>
      ) : (
        <>
          {lastReset && (
            <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-zinc-800">
              <div className="font-semibold text-orange-700">Новый пароль для {lastReset.login}</div>
              <div className="mt-2 rounded-xl border border-orange-200 bg-white px-3 py-2 font-mono text-orange-900">
                {lastReset.password}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email (логин)</label>
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                  placeholder="name@company.ru"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Пароль</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {ok && <p className="text-sm text-green-700">{ok}</p>}

              <button
                type="button"
                disabled={!canSubmit}
                onClick={createUser}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Создание..." : "Создать пользователя"}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-orange-700">Список пользователей</h2>
              <div className="text-sm text-zinc-500">{usersBusy ? "Загрузка..." : `${users.length}`}</div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-orange-100 bg-orange-50 px-3 py-2 text-left font-medium text-zinc-700">Login</th>
                    <th className="border-b border-orange-100 bg-orange-50 px-3 py-2 text-left font-medium text-zinc-700">Role</th>
                    <th className="border-b border-orange-100 bg-orange-50 px-3 py-2 text-left font-medium text-zinc-700">Создан</th>
                    <th className="border-b border-orange-100 bg-orange-50 px-3 py-2 text-left font-medium text-zinc-700">Пароль</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="border-b border-orange-50 px-3 py-2 text-zinc-900">{u.login}</td>
                      <td className="border-b border-orange-50 px-3 py-2 text-zinc-700">{u.role}</td>
                      <td className="border-b border-orange-50 px-3 py-2 text-zinc-700">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td className="border-b border-orange-50 px-3 py-2">
                        <button
                          type="button"
                          disabled={resetBusyLogin === u.login}
                          onClick={() => resetPassword(u.login)}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
                        >
                          {resetBusyLogin === u.login ? "Сброс..." : "Сбросить"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-sm text-zinc-500">
                        Пользователи не найдены.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

