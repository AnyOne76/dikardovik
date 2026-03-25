"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await signIn("credentials", {
      login,
      password,
      redirect: true,
      callbackUrl: "/",
    });
    if (res?.error) setError("Неверный логин или пароль");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 text-zinc-900">
      <form
        onSubmit={onSubmit}
        className="w-full space-y-4 rounded-2xl border border-orange-100 bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
      >
        <div>
        <p className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
            DI Authorization
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">Вход в систему DI</h1>
        </div>
        <input
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
          placeholder="Email"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2 font-medium text-white transition hover:brightness-105" type="submit">
          Войти
        </button>
      </form>
    </main>
  );
}
