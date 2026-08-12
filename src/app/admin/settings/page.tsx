"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LEGAL_ENTITIES } from "@/lib/legal-entities";

type DirectorRecord = {
  id: string;
  legalEntityId: string;
  fullName: string;
  isCurrent: boolean;
};

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none";

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
    <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
      <h2 className="text-lg font-semibold text-orange-700">Генеральные директора</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ФИО действующего директора подставляется в блок «УТВЕРЖДАЮ» при выгрузке ДИ в DOCX. При смене
        руководителя добавьте нового — прежний останется в списке, к нему можно вернуться.
      </p>

      {loading ? (
        <div className="mt-4 text-sm text-zinc-500">Загрузка...</div>
      ) : (
        <div className="mt-4 space-y-5">
          {LEGAL_ENTITIES.map((entity) => {
            const forEntity = rows.filter((r) => r.legalEntityId === entity.id);
            const current = forEntity.find((r) => r.isCurrent);
            const previous = forEntity.filter((r) => !r.isCurrent);
            const draft = drafts[entity.id] ?? "";

            return (
              <div key={entity.id} className="rounded-xl border border-zinc-100 p-4">
                <div className="text-sm font-medium text-zinc-800">{entity.label}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Действующий:{" "}
                  <span className="font-medium text-zinc-900">{current?.fullName ?? "не задан"}</span>
                </div>

                {previous.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-xs text-zinc-500">Прежние директора</div>
                    {previous.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-700">{r.fullName}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send("PATCH", { id: r.id }, `Действующий директор: ${r.fullName}`)}
                          className="text-orange-700 underline underline-offset-2 disabled:opacity-50"
                        >
                          сделать текущим
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send("DELETE", { id: r.id }, "Директор удалён из списка")}
                          className="text-zinc-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                        >
                          удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputClass}
                    placeholder="Новый директор, например Иванов И.И."
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [entity.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy || draft.trim().length < 3}
                    onClick={async () => {
                      await send(
                        "POST",
                        { legalEntityId: entity.id, fullName: draft.trim(), makeCurrent: true },
                        `Действующий директор: ${draft.trim()}`,
                      );
                      setDrafts((prev) => ({ ...prev, [entity.id]: "" }));
                    }}
                    className="h-11 shrink-0 rounded-xl border border-orange-200 px-4 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                  >
                    Добавить и назначить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {ok && <p className="mt-3 text-sm text-green-700">{ok}</p>}
    </div>
  );
}

type SettingsResponse = {
  perplexityModel: string;
  openrouterModel: string;
  perplexityConfigured: boolean;
  perplexityKeyMask: string | null;
  openrouterConfigured: boolean;
  openrouterKeyMask: string | null;
};

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

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-900">
      <h1 className="text-2xl font-semibold text-orange-700">Настройки API</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Ключи Perplexity и DeepSeek хранятся в базе. Пустое поле ключа при сохранении не меняет уже сохранённый
        ключ. Если ключ не задан в базе, используются переменные окружения.
      </p>

      {role !== "admin" ? (
        <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 text-sm text-zinc-700">
          Доступ запрещён.
        </div>
      ) : loading ? (
        <div className="mt-6 text-sm text-zinc-500">Загрузка...</div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <h2 className="text-lg font-semibold text-orange-700">Perplexity</h2>
            {masks.px && (
              <p className="mt-2 text-sm text-zinc-600">
                Текущий ключ в БД: <span className="font-mono text-zinc-800">{masks.px}</span>
              </p>
            )}
            <label className="mb-1 mt-3 block text-sm font-medium text-zinc-700">Модель</label>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={perplexityModel}
              onChange={(e) => setPerplexityModel(e.target.value)}
            />
            <label className="mb-1 mt-3 block text-sm font-medium text-zinc-700">Новый API-ключ (оставьте пустым, чтобы не менять)</label>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={perplexityKey}
              onChange={(e) => setPerplexityKey(e.target.value)}
              disabled={clearPerplexityKey}
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={clearPerplexityKey}
                onChange={(e) => {
                  setClearPerplexityKey(e.target.checked);
                  if (e.target.checked) setPerplexityKey("");
                }}
              />
              Удалить ключ Perplexity из базы (будет использован .env при наличии)
            </label>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <h2 className="text-lg font-semibold text-orange-700">DeepSeek</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ключ с сайта api-docs.deepseek.com. Модель: например «deepseek-v4-flash» (быстрее) или «deepseek-v4-pro» (точнее).
            </p>
            {masks.or && (
              <p className="mt-2 text-sm text-zinc-600">
                Текущий ключ в БД: <span className="font-mono text-zinc-800">{masks.or}</span>
              </p>
            )}
            <label className="mb-1 mt-3 block text-sm font-medium text-zinc-700">Модель</label>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={openrouterModel}
              onChange={(e) => setOpenrouterModel(e.target.value)}
            />
            <label className="mb-1 mt-3 block text-sm font-medium text-zinc-700">Новый API-ключ (оставьте пустым, чтобы не менять)</label>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              disabled={clearOpenrouterKey}
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={clearOpenrouterKey}
                onChange={(e) => {
                  setClearOpenrouterKey(e.target.checked);
                  if (e.target.checked) setOpenrouterKey("");
                }}
              />
              Удалить ключ DeepSeek из базы (будет использован .env при наличии)
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="text-sm text-green-700">{ok}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 font-medium text-white transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Сохранение..." : "Сохранить"}
          </button>

          <DirectorsCard />
        </div>
      )}
    </main>
  );
}
