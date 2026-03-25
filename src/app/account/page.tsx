"use client";

import { FormEvent, useMemo, useState } from "react";

export default function AccountPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState<string>("");

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (oldPassword.trim().length < 6) return false;
    if (newPassword.trim().length < 6) return false;
    return true;
  }, [oldPassword, newPassword, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка");
      setOk("Пароль успешно изменен.");
      setOldPassword("");
      setNewPassword("");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-900">
      <h1 className="text-2xl font-semibold text-orange-700">Сменить пароль</h1>
      <p className="mt-1 text-sm text-zinc-600">Используйте только для текущего пользователя.</p>

      <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Текущий пароль</label>
            <input
              type="password"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Новый пароль</label>
            <input
              type="password"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="text-sm text-green-700">{ok}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Сохранение..." : "Сменить пароль"}
          </button>
        </div>
      </form>
    </main>
  );
}

