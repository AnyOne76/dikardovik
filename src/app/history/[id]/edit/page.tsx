"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { InstructionPayload } from "@/lib/di-contract";
import { FIXED_SUBORDINATION_LINES, getFinalNoteLines } from "@/lib/di-rules";
import { Badge, Button, Card, Field, Input, Notice, Page, PageHeader, Textarea } from "@/components/ui";

function PreviewRow({ label, items }: { label: string; items: string[] }) {
  return (
    <tr className="align-top">
      <th
        scope="row"
        className="w-64 border-b border-zinc-200 bg-zinc-50 px-5 py-4 text-left align-top font-medium text-zinc-700"
      >
        {label}
      </th>
      <td className="border-b border-zinc-200 px-5 py-4">
        <ol className="list-decimal space-y-2 pl-5 font-normal text-zinc-900">
          {items.map((item, idx) => (
            <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
          ))}
        </ol>
      </td>
    </tr>
  );
}

function PreviewSection({ title }: { title: string }) {
  return (
    <tr>
      <td
        colSpan={2}
        className="border-y border-zinc-200 bg-orange-50 px-4 py-2.5 text-center text-sm font-semibold text-orange-700"
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

/** Редактируемый раздел: подпись, кнопка перегенерации и поле «строка = пункт». */
function SectionEditor({
  label,
  value,
  rows,
  fixed,
  busy,
  regenerating,
  onRegenerate,
  onChange,
}: {
  label: string;
  value: string[];
  rows: number;
  fixed?: boolean;
  busy: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        <Button size="sm" disabled={busy || fixed} loading={regenerating} onClick={onRegenerate}>
          {fixed ? "Зафиксировано" : "Перегенерировать"}
        </Button>
      </div>
      <Textarea
        rows={rows}
        value={itemsToText(value)}
        readOnly={fixed}
        onChange={(e) => onChange(textToItems(e.target.value))}
        className={fixed ? "resize-y bg-zinc-50 text-zinc-500" : "resize-y"}
      />
    </div>
  );
}

export default function EditHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");

  const [baseId, setBaseId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [payload, setPayload] = useState<InstructionPayload | null>(null);

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
        setPayload({
          ...data.templateJson,
          sections: {
            ...data.templateJson.sections,
            general: { ...data.templateJson.sections.general, subordination: FIXED_SUBORDINATION_LINES },
          },
        });
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
    setSaved("");
    try {
      const payloadToSave: InstructionPayload = {
        ...payload,
        sections: {
          ...payload.sections,
          general: { ...payload.sections.general, subordination: FIXED_SUBORDINATION_LINES },
        },
      };
      const r = await fetch(`/api/di/history/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateJson: payloadToSave }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка сохранения");
      setSavedId(data.id);
      setVersion(data.version);
      setSaved(`Сохранено как версия ${data.version}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function exportDocx() {
    const exportId = savedId ?? baseId;
    if (!exportId) {
      setError("Сначала дождитесь загрузки документа.");
      return;
    }

    setExporting(true);
    setError(null);
    try {
      const r = await fetch(`/api/di/export/${exportId}`, { credentials: "include" });
      if (!r.ok) {
        const contentType = r.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const data = await r.json().catch(() => ({}));
          throw new Error(
            typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
                ? data.error
                : `Ошибка экспорта ${r.status}`,
          );
        }
        throw new Error(`Ошибка экспорта ${r.status}`);
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${payload?.templateMeta.positionName ?? "instruction"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
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
        body: JSON.stringify({ section, templateJson: payload }),
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

  const generalBlocks = payload
    ? ([
        {
          label: "Требуемая квалификация и стаж работы по данной должности",
          value: payload.sections.general.requiredQualification,
          section: "requiredQualification",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, requiredQualification: next } },
          }),
        },
        {
          label: "Подчиненность (только кому подчиняется)",
          value: FIXED_SUBORDINATION_LINES,
          section: "subordination",
          fixed: true,
          apply: (p: InstructionPayload) => p,
        },
        {
          label: "Прием на работу",
          value: payload.sections.general.hiringProcedure,
          section: "hiringProcedure",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, hiringProcedure: next } },
          }),
        },
        {
          label: "Замещение на время отсутствия",
          value: payload.sections.general.substitutionProcedure,
          section: "substitutionProcedure",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, substitutionProcedure: next } },
          }),
        },
        {
          label: "Нормативные документы, которыми руководствуется в своей деятельности",
          value: payload.sections.general.regulatoryDocuments,
          section: "regulatoryDocuments",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, regulatoryDocuments: next } },
          }),
        },
        {
          label: "Локально-нормативные акты",
          value: payload.sections.general.localRegulations,
          section: "localRegulations",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, localRegulations: next } },
          }),
        },
        {
          label: "Работник должен знать",
          value: payload.sections.general.employeeMustKnow,
          section: "employeeMustKnow",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, general: { ...p.sections.general, employeeMustKnow: next } },
          }),
        },
      ] as const)
    : [];

  const listBlocks = payload
    ? ([
        {
          label: "Работник обязан",
          value: payload.sections.duties.items,
          section: "duties.items",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, duties: { ...p.sections.duties, items: next } },
          }),
        },
        {
          label: "Работник имеет право",
          value: payload.sections.rights.items,
          section: "rights.items",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, rights: { ...p.sections.rights, items: next } },
          }),
        },
        {
          label: "Работник несет ответственность за",
          value: payload.sections.responsibility.items,
          section: "responsibility.items",
          apply: (p: InstructionPayload, next: string[]) => ({
            ...p,
            sections: { ...p.sections, responsibility: { ...p.sections.responsibility, items: next } },
          }),
        },
      ] as const)
    : [];

  return (
    <Page width="full">
      <PageHeader
        title="Редактирование"
        subtitle={
          <span className="inline-flex items-center gap-2">
            {payload?.templateMeta.positionName ?? "Загрузка..."}
            {version !== null && <Badge tone="accent">версия {version}</Badge>}
          </span>
        }
        actions={
          <>
            <Button onClick={() => (showPreview ? setShowPreview(false) : router.push("/history"))}>Назад</Button>
            <Button onClick={() => setShowPreview((s) => !s)} disabled={!payload}>
              {showPreview ? "К редактированию" : "Предпросмотр"}
            </Button>
            <Button loading={exporting} disabled={!payload} onClick={exportDocx}>
              Скачать DOCX
            </Button>
            <Button variant="primary" loading={saving} disabled={!payload} onClick={save}>
              Сохранить версию
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {saved && !error && (
        <div className="mb-4">
          <Notice tone="success">{saved}</Notice>
        </div>
      )}

      {loading && <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white" />}

      {!loading && !payload && <Notice tone="error">Не удалось загрузить документ.</Notice>}

      {!loading && payload && !showPreview && (
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Должность">
              <Input readOnly value={payload.templateMeta.positionName} className="bg-zinc-50" />
            </Field>
            <Field label="Подразделение">
              <Input
                value={payload.templateMeta.departmentName}
                onChange={(e) =>
                  setPayload((p) =>
                    p ? { ...p, templateMeta: { ...p.templateMeta, departmentName: e.target.value } } : p,
                  )
                }
              />
            </Field>
          </div>

          <p className="mt-4 text-xs text-zinc-500">Одна строка в поле — один пункт документа.</p>

          <div className="mt-4 space-y-5">
            {generalBlocks.map((block) => (
              <SectionEditor
                key={block.section}
                label={block.label}
                value={block.value}
                rows={4}
                fixed={"fixed" in block && block.fixed}
                busy={saving || regenerating !== null}
                regenerating={regenerating === block.section}
                onRegenerate={() => void regenerate(block.section)}
                onChange={(next) => setPayload((p) => (p ? block.apply(p, next) : p))}
              />
            ))}
            {listBlocks.map((block) => (
              <SectionEditor
                key={block.section}
                label={block.label}
                value={block.value}
                rows={8}
                busy={saving || regenerating !== null}
                regenerating={regenerating === block.section}
                onRegenerate={() => void regenerate(block.section)}
                onChange={(next) => setPayload((p) => (p ? block.apply(p, next) : p))}
              />
            ))}
          </div>
        </Card>
      )}

      {!loading && payload && showPreview && (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[15px] leading-relaxed">
              <caption className="border-b border-zinc-200 px-5 py-4 text-center text-sm font-semibold tracking-[0.2em]">
                ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ
              </caption>
              <tbody>
                <tr className="align-top">
                  <th
                    scope="row"
                    className="w-64 border-b border-zinc-200 bg-zinc-50 px-5 py-4 text-left align-top font-medium text-zinc-700"
                  >
                    Название штатной должности
                  </th>
                  <td className="border-b border-zinc-200 px-5 py-4">{payload.templateMeta.positionName}</td>
                </tr>
                <tr className="align-top">
                  <th
                    scope="row"
                    className="border-b border-zinc-200 bg-zinc-50 px-5 py-4 text-left align-top font-medium text-zinc-700"
                  >
                    Наименование структурного подразделения
                  </th>
                  <td className="border-b border-zinc-200 px-5 py-4">{payload.templateMeta.departmentName}</td>
                </tr>

                <PreviewSection title={payload.sections.general.heading} />
                <PreviewRow
                  label="Требуемая квалификация и стаж работы по данной должности"
                  items={payload.sections.general.requiredQualification}
                />
                <PreviewRow label="Подчиненность" items={payload.sections.general.subordination} />
                <PreviewRow label="Прием на работу" items={payload.sections.general.hiringProcedure} />
                <PreviewRow
                  label="Замещение на время отсутствия"
                  items={payload.sections.general.substitutionProcedure}
                />
                <PreviewRow
                  label="Нормативные документы, которыми руководствуется в своей деятельности"
                  items={payload.sections.general.regulatoryDocuments}
                />
                <PreviewRow label="Локально-нормативные акты" items={payload.sections.general.localRegulations} />
                <PreviewRow label="Работник должен знать" items={payload.sections.general.employeeMustKnow} />

                <PreviewSection title={payload.sections.duties.heading} />
                <PreviewRow label="Работник обязан" items={payload.sections.duties.items} />

                <PreviewSection title={payload.sections.rights.heading} />
                <PreviewRow label="Работник имеет право" items={payload.sections.rights.items} />

                <PreviewSection title={payload.sections.responsibility.heading} />
                <PreviewRow
                  label="Работник несет ответственность за"
                  items={payload.sections.responsibility.items}
                />
              </tbody>
            </table>
          </div>

          <div className="border-t border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500">
            {getFinalNoteLines(payload.templateMeta.positionName).map((line, idx) => (
              <p key={`${idx}-${line.slice(0, 20)}`} className={idx > 0 ? "mt-2" : ""}>
                {line}
              </p>
            ))}
          </div>
        </Card>
      )}
    </Page>
  );
}
