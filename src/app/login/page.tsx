"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await signIn("credentials", { login, password, redirect: true, callbackUrl: "/" });
    if (res?.error) {
      setError("Неверный логин или пароль");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <h1 className="text-lg font-semibold tracking-tight">Вход в систему</h1>
        <p className="mt-1 text-sm text-zinc-500">Генератор должностных инструкций</p>

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
              autoComplete="current-password"
            />
          </Field>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Войти
          </Button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-orange-700 hover:underline">
          Регистрация
        </Link>
      </p>
    </main>
  );
}
