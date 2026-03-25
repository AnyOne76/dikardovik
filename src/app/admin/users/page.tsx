"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
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
      )}
    </main>
  );
}

