"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, Notice, Page, PageHeader } from "@/components/ui";

type DbUser = { id: string; login: string; role: string; createdAt: string };

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const [users, setUsers] = useState<DbUser[]>([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [resetBusyLogin, setResetBusyLogin] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<{ login: string; password: string } | null>(null);
  const [actionBusyLogin, setActionBusyLogin] = useState<string | null>(null);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const canSubmit = useMemo(
    () => !busy && login.trim().length > 0 && password.trim().length >= 6,
    [busy, login, password],
  );

  const reloadUsers = useCallback(async () => {
    setUsersBusy(true);
    try {
      const r = await fetch("/api/admin/users", { credentials: "include" });
      const d = (await r.json().catch(() => ({}))) as { users?: DbUser[]; error?: string };
      if (r.ok && Array.isArray(d.users)) setUsers(d.users);
    } finally {
      setUsersBusy(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "admin") return;
    void reloadUsers();
  }, [role, reloadUsers]);

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
      await reloadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(targetLogin: string) {
    const typed = prompt(
      `Сбросить пароль для ${targetLogin}.\nВведите новый пароль (минимум 6 символов). Оставьте пустым, чтобы сгенерировать.`,
      "",
    );
    if (typed === null) return;

    const trimmed = typed.trim();
    const question = trimmed
      ? `Установить новый пароль для ${targetLogin}?`
      : `Сгенерировать новый пароль для ${targetLogin} и показать один раз?`;
    if (!confirm(question)) return;

    setResetBusyLogin(targetLogin);
    setLastReset(null);
    try {
      const r = await fetch("/api/admin/users/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: targetLogin, ...(trimmed ? { newPassword: trimmed } : {}) }),
      });
      const data = (await r.json().catch(() => ({}))) as { password?: string; error?: string };
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка сброса");
      if (typeof data.password === "string" && data.password.length > 0) {
        setLastReset({ login: targetLogin, password: data.password });
      } else {
        alert("Пароль установлен.");
      }
      await reloadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сброса");
    } finally {
      setResetBusyLogin(null);
    }
  }

  async function deleteUser(targetLogin: string) {
    if (!confirm(`Удалить пользователя «${targetLogin}»?`)) return;
    setActionBusyLogin(targetLogin);
    try {
      const r = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: targetLogin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка удаления");
      setLastReset(null);
      await reloadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setActionBusyLogin(null);
    }
  }

  async function changeLogin(targetLogin: string) {
    const newLogin = prompt("Новый логин:", targetLogin);
    if (!newLogin) return;
    const trimmed = newLogin.trim();
    if (trimmed.length < 3) {
      alert("Логин слишком короткий");
      return;
    }
    if (!confirm(`Сменить логин «${targetLogin}» на «${trimmed}»?`)) return;

    setActionBusyLogin(targetLogin);
    try {
      const r = await fetch("/api/admin/users/change-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: targetLogin, newLogin: trimmed }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка смены логина");
      await reloadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка смены логина");
    } finally {
      setActionBusyLogin(null);
    }
  }

  if (role !== "admin") {
    return (
      <Page width="narrow">
        <PageHeader title="Пользователи" />
        <EmptyState>Доступ разрешён только администраторам.</EmptyState>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Пользователи" subtitle="Учётные записи сотрудников, работающих с генератором." />

      {lastReset && (
        <div className="mb-6">
          <Card className="border-[var(--accent)]/30 bg-[var(--accent-soft)]">
            <p className="text-sm font-medium text-[var(--accent-strong)]">
              Новый пароль для {lastReset.login} — покажется только один раз
            </p>
            <p className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm">
              {lastReset.password}
            </p>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardTitle>Новый пользователь</CardTitle>
          <div className="space-y-4">
            <Field label="Логин">
              <Input placeholder="name@company.ru" value={login} onChange={(e) => setLogin(e.target.value)} />
            </Field>
            <Field label="Пароль" hint="Минимум 6 символов.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            {error && <Notice tone="error">{error}</Notice>}
            {ok && <Notice tone="success">{ok}</Notice>}

            <Button variant="primary" className="w-full" disabled={!canSubmit} loading={busy} onClick={createUser}>
              Создать
            </Button>
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-5">
            <h2 className="text-base font-semibold">Список</h2>
            <span className="text-sm text-[var(--muted)]">{usersBusy ? "Обновление..." : `Всего: ${users.length}`}</span>
          </div>

          {users.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">Пользователи не найдены.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="border-b border-[var(--border)] px-5 py-2.5 font-medium">Логин</th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 font-medium">Роль</th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 font-medium">Создан</th>
                    <th className="border-b border-[var(--border)] px-5 py-2.5 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="align-middle">
                      <td className="border-b border-[var(--border)] px-5 py-3 font-medium">{u.login}</td>
                      <td className="border-b border-[var(--border)] px-3 py-3">
                        <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-3 whitespace-nowrap text-[var(--muted)]">
                        {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="border-b border-[var(--border)] px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            disabled={resetBusyLogin === u.login || actionBusyLogin === u.login}
                            loading={resetBusyLogin === u.login}
                            onClick={() => void resetPassword(u.login)}
                          >
                            Сбросить пароль
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actionBusyLogin === u.login}
                            onClick={() => void changeLogin(u.login)}
                          >
                            Сменить логин
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:text-red-700"
                            disabled={actionBusyLogin === u.login}
                            onClick={() => void deleteUser(u.login)}
                          >
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
