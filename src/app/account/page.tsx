"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button, Card, Field, Input, Notice, Page, PageHeader } from "@/components/ui";

export default function AccountPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const canSubmit = useMemo(() => {
    if (busy) return false;
    return oldPassword.trim().length >= 6 && newPassword.trim().length >= 6;
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
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка");
      setOk("Пароль изменён.");
      setOldPassword("");
      setNewPassword("");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <PageHeader title="Смена пароля" subtitle="Пароль меняется только для вашей учётной записи." />
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Текущий пароль">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Field label="Новый пароль" hint="Не короче шести символов.">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>

          {error && <Notice tone="error">{error}</Notice>}
          {ok && <Notice tone="success">{ok}</Notice>}

          <Button type="submit" variant="primary" disabled={!canSubmit} loading={busy}>
            Сменить пароль
          </Button>
        </form>
      </Card>
    </Page>
  );
}
