"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { InstructionPayload } from "@/lib/di-contract";
import { getFinalNoteLines } from "@/lib/di-rules";

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-700">
      {items.map((item, idx) => (
        <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
      ))}
    </ol>
  );
}

function LabelRow({ label, items }: { label: string; items: string[] }) {
  return (
    <tr className="align-top">
      <td className="w-[34%] border border-orange-100 bg-orange-50/70 p-3 text-sm font-medium text-zinc-800">
        {label}
      </td>
      <td className="border border-orange-100 bg-white p-3">
        <NumberedList items={items} />
      </td>
    </tr>
  );
}

function SectionRow({ title }: { title: string }) {
  return (
    <tr>
      <td
        className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center font-bold text-zinc-800"
        colSpan={2}
      >
        {title}
      </td>
    </tr>
  );
}

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
  const [showPreview, setShowPreview] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
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

  async function regenerate(section: string) {
    if (!id || !payload) return;
    setRegenerating(section);
    setError(null);
    try {
      const r = await fetch(`/api/di/history/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка перегенерации");
      if (data.templateJson) setPayload(data.templateJson as InstructionPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка перегенерации");
    } finally {
      setRegenerating(null);
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
          {!showPreview && (
            <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-zinc-900">Параметры и текст</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowPreview((s) => !s)}
                  className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                >
                  {showPreview ? "Скрыть предпросмотр" : "Предпросмотр"}
                </button>
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

            <p className="mt-3 text-xs text-zinc-500">Одна строка в полях = один пункт.</p>
            {(
              [
                {
                  label: "Требуемая квалификация и стаж работы по данной должности",
                  value: payload.sections.general.requiredQualification,
                  section: "requiredQualification",
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
                  section: "subordination",
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
                  section: "hiringProcedure",
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
                  section: "substitutionProcedure",
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
                  section: "regulatoryDocuments",
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
                  section: "localRegulations",
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
                  section: "employeeMustKnow",
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-zinc-700">{block.label}</label>
                  <button
                    type="button"
                    disabled={saving || regenerating === block.section}
                    onClick={() => regenerate(block.section)}
                    className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
                  >
                    {regenerating === block.section ? "Перегенерируем..." : "Перегенерировать"}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={itemsToText(block.value)}
                  onChange={(e) => block.onChange(textToItems(e.target.value))}
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
                />
              </div>
            ))}

            <div className="mt-6 grid gap-4">
              {[
                { label: "Работник обязан", value: payload.sections.duties.items, section: "duties.items" as const, key: "duties.items" as const },
                { label: "Работник имеет право", value: payload.sections.rights.items, section: "rights.items" as const, key: "rights.items" as const },
                {
                  label: "Работник несет ответственность за",
                  value: payload.sections.responsibility.items,
                  section: "responsibility.items" as const,
                  key: "responsibility.items" as const,
                },
              ].map((block) => (
                <div key={block.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-zinc-700">{block.label}</label>
                    <button
                      type="button"
                      disabled={saving || regenerating === block.section}
                      onClick={() => regenerate(block.section)}
                      className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-medium text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
                    >
                      {regenerating === block.section ? "Перегенерируем..." : "Перегенерировать"}
                    </button>
                  </div>
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
                </div>
              ))}
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          </section>
          )}

          {showPreview && (
            <section className="rounded-3xl border border-orange-100 bg-white p-4 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
              <div className="overflow-x-auto rounded-xl border border-orange-100">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td
                        className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center text-base font-bold tracking-[0.3em] text-zinc-800"
                        colSpan={2}
                      >
                        ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ
                      </td>
                    </tr>
                    <tr className="align-top">
                      <td className="w-[34%] border border-orange-100 bg-orange-50/70 p-3 font-medium">
                        Название штатной должности
                      </td>
                      <td className="border border-orange-100 p-3">{payload.templateMeta.positionName}</td>
                    </tr>
                    <tr className="align-top">
                      <td className="border border-orange-100 bg-orange-50/70 p-3 font-medium">
                        Наименование структурного подразделения
                      </td>
                      <td className="border border-orange-100 p-3">{payload.templateMeta.departmentName}</td>
                    </tr>

                    <SectionRow title={payload.sections.general.heading} />
                    <LabelRow label="Требуемая квалификация и стаж работы по данной должности" items={payload.sections.general.requiredQualification} />
                    <LabelRow label="Подчиненность" items={payload.sections.general.subordination} />
                    <LabelRow label="Прием на работу" items={payload.sections.general.hiringProcedure} />
                    <LabelRow label="Замещение на время отсутствия" items={payload.sections.general.substitutionProcedure} />
                    <LabelRow
                      label="Нормативные документы, которыми руководствуется в своей деятельности"
                      items={payload.sections.general.regulatoryDocuments}
                    />
                    <LabelRow label="Локально-нормативные акты" items={payload.sections.general.localRegulations} />
                    <LabelRow label="Работник должен знать" items={payload.sections.general.employeeMustKnow} />

                    <SectionRow title={payload.sections.duties.heading} />
                    <LabelRow label="Работник обязан" items={payload.sections.duties.items} />

                    <SectionRow title={payload.sections.rights.heading} />
                    <LabelRow label="Работник имеет право" items={payload.sections.rights.items} />

                    <SectionRow title={payload.sections.responsibility.heading} />
                    <LabelRow label="Работник несет ответственность за" items={payload.sections.responsibility.items} />
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-zinc-700">
                {getFinalNoteLines(payload.templateMeta.positionName).map((line, idx) => (
                  <p key={`${idx}-${line.slice(0, 20)}`} className={idx > 0 ? "mt-2" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          )}
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

