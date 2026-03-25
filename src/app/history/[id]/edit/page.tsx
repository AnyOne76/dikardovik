"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { InstructionPayload } from "@/lib/di-contract";

function itemsToText(items: string[]) {
  return (items ?? []).join("\n");
}

function textToItems(text: string) {
  return (text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EditHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseId, setBaseId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [payload, setPayload] = useState<InstructionPayload | null>(null);

  const exportHref = useMemo(() => {
    const exportId = savedId ?? baseId;
    return exportId ? `/api/di/export/${exportId}` : "#";
  }, [savedId, baseId]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/di/history/${id}`, { credentials: "include" });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка загрузки");
        if (!mounted) return;
        setBaseId(data.id);
        setVersion(data.version);
        setPayload(data.templateJson);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  async function save() {
    if (!id || !payload) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/di/history/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateJson: payload }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка сохранения");
      setSavedId(data.id);
      setVersion(data.version);
      alert("Сохранено как новая версия.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 text-zinc-900">
      <section className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
              Edit
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">Редактирование DI</h1>
            <p className="mt-2 text-sm text-zinc-600">
              История • версия {version ?? "—"} • можно сохранить как новую версию
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/history")}
              className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
            >
              Назад
            </button>
            <a
              href={exportHref}
              className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-800 transition hover:bg-orange-100"
            >
              Экспорт DOCX
            </a>
          </div>
        </div>
      </section>

      {loading && (
        <p className="mt-4 rounded-2xl border border-orange-100 bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
          Загружаем документ...
        </p>
      )}

      {!loading && payload && (
        <div className="mt-4 grid gap-4">
          <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-zinc-900">Параметры и текст</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Сохраняем..." : "Сохранить как новую версию"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">Должность</label>
                <input
                  readOnly
                  value={payload.templateMeta.positionName}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-700"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">Подразделение</label>
                <input
                  value={payload.templateMeta.departmentName}
                  onChange={(e) =>
                    setPayload((p) =>
                      p ? { ...p, templateMeta: { ...p.templateMeta, departmentName: e.target.value } } : p,
                    )
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                />
              </div>
            </div>

            {(
              [
                {
                  label: "Требуемая квалификация и стаж работы по данной должности",
                  value: payload.sections.general.requiredQualification,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, requiredQualification: next },
                            },
                          }
                        : p,
                    ),
                },
                {
                  label: "Подчиненность (только кому подчиняется)",
                  value: payload.sections.general.subordination,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: { ...p.sections, general: { ...p.sections.general, subordination: next } },
                          }
                        : p,
                    ),
                },
                {
                  label: "Прием на работу",
                  value: payload.sections.general.hiringProcedure,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, hiringProcedure: next },
                            },
                          }
                        : p,
                    ),
                },
                {
                  label: "Замещение на время отсутствия",
                  value: payload.sections.general.substitutionProcedure,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, substitutionProcedure: next },
                            },
                          }
                        : p,
                    ),
                },
                {
                  label: "Нормативные документы, которыми руководствуется в своей деятельности",
                  value: payload.sections.general.regulatoryDocuments,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, regulatoryDocuments: next },
                            },
                          }
                        : p,
                    ),
                },
                {
                  label: "Локально-нормативные акты",
                  value: payload.sections.general.localRegulations,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, localRegulations: next },
                            },
                          }
                        : p,
                    ),
                },
                {
                  label: "Работник должен знать",
                  value: payload.sections.general.employeeMustKnow,
                  onChange: (next: string[]) =>
                    setPayload((p) =>
                      p
                        ? {
                            ...p,
                            sections: {
                              ...p.sections,
                              general: { ...p.sections.general, employeeMustKnow: next },
                            },
                          }
                        : p,
                    ),
                },
              ] as const
            ).map((block) => (
              <div key={block.label} className="mt-4">
                <label className="mb-2 block text-sm font-medium text-zinc-700">{block.label}</label>
                <textarea
                  rows={4}
                  value={itemsToText(block.value)}
                  onChange={(e) => block.onChange(textToItems(e.target.value))}
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-500">Одна строка = один пункт.</p>
              </div>
            ))}

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: "Работник обязан", value: payload.sections.duties.items, key: "duties.items" as const },
                { label: "Работник имеет право", value: payload.sections.rights.items, key: "rights.items" as const },
                {
                  label: "Работник несет ответственность за",
                  value: payload.sections.responsibility.items,
                  key: "responsibility.items" as const,
                },
              ].map((block) => (
                <div key={block.key} className="col-span-1">
                  <label className="mb-2 block text-sm font-medium text-zinc-700">{block.label}</label>
                  <textarea
                    rows={6}
                    value={itemsToText(block.value)}
                    onChange={(e) => {
                      const next = textToItems(e.target.value);
                      setPayload((p) => {
                        if (!p) return p;
                        if (block.key === "duties.items") {
                          return { ...p, sections: { ...p.sections, duties: { ...p.sections.duties, items: next } } };
                        }
                        if (block.key === "rights.items") {
                          return { ...p, sections: { ...p.sections, rights: { ...p.sections.rights, items: next } } };
                        }
                        return {
                          ...p,
                          sections: {
                            ...p.sections,
                            responsibility: { ...p.sections.responsibility, items: next },
                          },
                        };
                      });
                    }}
                    className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-zinc-500">Одна строка = один пункт.</p>
                </div>
              ))}
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          </section>
        </div>
      )}

      {!loading && !payload && (
        <p className="mt-4 rounded-2xl border border-red-100 bg-white p-6 text-center text-sm text-red-700 shadow-sm">
          Не удалось загрузить документ.
        </p>
      )}
    </main>
  );
}

