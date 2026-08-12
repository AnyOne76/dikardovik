"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LEGAL_ENTITIES } from "@/lib/legal-entities";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui";

type DirectorRecord = {
  id: string;
  legalEntityId: string;
  fullName: string;
  isCurrent: boolean;
};

type SettingsResponse = {
  perplexityModel: string;
  openrouterModel: string;
  perplexityConfigured: boolean;
  perplexityKeyMask: string | null;
  openrouterConfigured: boolean;
  openrouterKeyMask: string | null;
};

/**
 * Справочник генеральных директоров: по каждому юрлицу можно добавить нового
 * и назначить действующим. Его ФИО попадает в блок "УТВЕРЖДАЮ" при экспорте ДИ.
 */
function DirectorsCard() {
  const [rows, setRows] = useState<DirectorRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/directors", { credentials: "include" });
      const d = (await r.json()) as { directors?: DirectorRecord[]; error?: string };
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка загрузки");
      setRows(d.directors ?? []);
    } catch {
      setError("Не удалось загрузить список директоров");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await fetch("/api/admin/directors", {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка сохранения");
      await load();
      setOk(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle hint="ФИО действующего директора подставляется в блок «УТВЕРЖДАЮ» при выгрузке в DOCX. При смене руководителя добавьте нового — прежний останется в списке.">
        Генеральные директора
      </CardTitle>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-zinc-200" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {LEGAL_ENTITIES.map((entity) => {
            const forEntity = rows.filter((r) => r.legalEntityId === entity.id);
            const current = forEntity.find((r) => r.isCurrent);
            const previous = forEntity.filter((r) => !r.isCurrent);
            const draft = drafts[entity.id] ?? "";

            return (
              <div key={entity.id} className="rounded-lg border border-zinc-200 p-4">
                <p className="text-sm font-medium">{entity.label}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Действующий: <span className="font-medium text-zinc-900">{current?.fullName ?? "не задан"}</span>
                </p>

                {previous.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3">
                    {previous.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-zinc-500">{r.fullName}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send("PATCH", { id: r.id }, `Действующий директор: ${r.fullName}`)}
                          className="text-orange-700 underline underline-offset-2 disabled:opacity-50"
                        >
                          назначить текущим
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send("DELETE", { id: r.id }, "Директор удалён из списка")}
                          className="text-zinc-500 underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
                        >
                          удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Новый директор — Иванов И.И."
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [entity.id]: e.target.value }))}
                  />
                  <Button
                    className="shrink-0"
                    disabled={busy || draft.trim().length < 3}
                    onClick={async () => {
                      await send(
                        "POST",
                        { legalEntityId: entity.id, fullName: draft.trim(), makeCurrent: true },
                        `Действующий директор: ${draft.trim()}`,
                      );
                      setDrafts((prev) => ({ ...prev, [entity.id]: "" }));
                    }}
                  >
                    Добавить и назначить
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {ok && (
        <div className="mt-4">
          <Notice tone="success">{ok}</Notice>
        </div>
      )}
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const [loading, setLoading] = useState(true);
  const [perplexityModel, setPerplexityModel] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [clearPerplexityKey, setClearPerplexityKey] = useState(false);
  const [clearOpenrouterKey, setClearOpenrouterKey] = useState(false);
  const [masks, setMasks] = useState<{ px: string | null; or: string | null }>({ px: null, or: null });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch("/api/admin/settings", { credentials: "include" });
        const d = (await r.json()) as SettingsResponse & { error?: string };
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка загрузки");
        setPerplexityModel(d.perplexityModel);
        setOpenrouterModel(d.openrouterModel);
        setMasks({ px: d.perplexityKeyMask, or: d.openrouterKeyMask });
      } catch {
        setError("Не удалось загрузить настройки");
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

  async function save() {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const body: Record<string, unknown> = {
        perplexityModel: perplexityModel.trim(),
        openrouterModel: openrouterModel.trim(),
      };
      if (clearPerplexityKey) body.clearPerplexityKey = true;
      else if (perplexityKey.trim().length > 0) body.perplexityApiKey = perplexityKey.trim();

      if (clearOpenrouterKey) body.clearOpenrouterKey = true;
      else if (openrouterKey.trim().length > 0) body.openrouterApiKey = openrouterKey.trim();

      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Ошибка сохранения");
      setOk("Сохранено. Ключи в базе переживут перезапуск сервера.");
      setPerplexityKey("");
      setOpenrouterKey("");
      setClearPerplexityKey(false);
      setClearOpenrouterKey(false);
      const gr = await fetch("/api/admin/settings", { credentials: "include" });
      if (gr.ok) {
        const gd = (await gr.json()) as SettingsResponse;
        setMasks({ px: gd.perplexityKeyMask, or: gd.openrouterKeyMask });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (role !== "admin") {
    return (
      <Page width="narrow">
        <PageHeader title="Настройки" />
        <EmptyState>Доступ разрешён только администраторам.</EmptyState>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title="Настройки"
        subtitle="Ключи хранятся в базе и имеют приоритет над переменными окружения. Пустое поле ключа при сохранении оставляет прежний."
      />

      {loading ? (
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl border border-zinc-200 bg-white" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardTitle hint="Ключ с сайта api-docs.deepseek.com. Модель: «deepseek-v4-flash» — быстрее, «deepseek-v4-pro» — точнее.">
              DeepSeek
            </CardTitle>
            <div className="space-y-4">
              {masks.or && (
                <p className="text-sm text-zinc-500">
                  Текущий ключ: <span className="font-mono text-zinc-900">{masks.or}</span>
                </p>
              )}
              <Field label="Модель">
                <Input value={openrouterModel} onChange={(e) => setOpenrouterModel(e.target.value)} />
              </Field>
              <Field label="Новый ключ" hint="Оставьте пустым, чтобы не менять.">
                <Input
                  type="password"
                  autoComplete="off"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  disabled={clearOpenrouterKey}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-zinc-500">
                <input
                  type="checkbox"
                  className="size-4 rounded border-zinc-300 accent-orange-600"
                  checked={clearOpenrouterKey}
                  onChange={(e) => {
                    setClearOpenrouterKey(e.target.checked);
                    if (e.target.checked) setOpenrouterKey("");
                  }}
                />
                Удалить ключ из базы (будет использован .env)
              </label>
            </div>
          </Card>

          <Card>
            <CardTitle hint="Используется для подбора нормативных выдержек при проверке ДИ.">Perplexity</CardTitle>
            <div className="space-y-4">
              {masks.px && (
                <p className="text-sm text-zinc-500">
                  Текущий ключ: <span className="font-mono text-zinc-900">{masks.px}</span>
                </p>
              )}
              <Field label="Модель">
                <Input value={perplexityModel} onChange={(e) => setPerplexityModel(e.target.value)} />
              </Field>
              <Field label="Новый ключ" hint="Оставьте пустым, чтобы не менять.">
                <Input
                  type="password"
                  autoComplete="off"
                  value={perplexityKey}
                  onChange={(e) => setPerplexityKey(e.target.value)}
                  disabled={clearPerplexityKey}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-zinc-500">
                <input
                  type="checkbox"
                  className="size-4 rounded border-zinc-300 accent-orange-600"
                  checked={clearPerplexityKey}
                  onChange={(e) => {
                    setClearPerplexityKey(e.target.checked);
                    if (e.target.checked) setPerplexityKey("");
                  }}
                />
                Удалить ключ из базы (будет использован .env)
              </label>
            </div>
          </Card>

          {error && <Notice tone="error">{error}</Notice>}
          {ok && <Notice tone="success">{ok}</Notice>}

          <div>
            <Button variant="primary" loading={busy} onClick={save}>
              Сохранить ключи
            </Button>
          </div>

          <DirectorsCard />
        </div>
      )}
    </Page>
  );
}
