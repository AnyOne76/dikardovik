"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function RegisterPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password, inviteCode }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Ошибка регистрации");
      setBusy(false);
      return;
    }
    const sign = await signIn("credentials", { login, password, redirect: true, callbackUrl: "/" });
    if (sign?.error) {
      setError("Не удалось войти после регистрации");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <h1 className="text-lg font-semibold tracking-tight">Регистрация</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Код приглашения выдаёт администратор.</p>

        <div className="mt-6 space-y-4">
          <Field label="Логин">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" />
          </Field>
          <Field label="Пароль">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Код приглашения">
            <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required autoComplete="off" />
          </Field>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Зарегистрироваться
          </Button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-[var(--accent-strong)] hover:underline">
          Войти
        </Link>
      </p>
    </main>
  );
}
