"use client";

import { useMemo, useState } from "react";
import { getFinalNoteLines } from "@/lib/di-rules";
import { DEFAULT_LEGAL_ENTITY_ID, LEGAL_ENTITIES, getLegalEntity } from "@/lib/legal-entities";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DocumentIcon,
  Field,
  Input,
  LinkButton,
  Notice,
  Page,
  PageHeader,
  Select,
  TimedProgress,
} from "@/components/ui";

type GenerateResponse = {
  id: string;
  version: number;
  finalText: string;
  payload: {
    templateMeta: {
      positionName: string;
      departmentName: string;
      legalEntityId?: string;
    };
    sections: {
      general: {
        heading: string;
        requiredQualification: string[];
        subordination: string[];
        hiringProcedure: string[];
        substitutionProcedure: string[];
        regulatoryDocuments: string[];
        localRegulations: string[];
        employeeMustKnow: string[];
      };
      duties: { heading: string; items: string[] };
      rights: { heading: string; items: string[] };
      responsibility: { heading: string; items: string[] };
    };
  };
};

const GENERATION_STAGES = [
  { until: 12, label: "Подбираем нормативную базу" },
  { until: 35, label: "Собираем разделы документа" },
  { until: 70, label: "Проверяем формулировки" },
  { until: Infinity, label: "Финальная вычитка текста" },
];

function DocRow({ label, items }: { label: string; items: string[] }) {
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
            <li key={`${idx}-${item.slice(0, 20)}`} className="pl-1">
              {item}
            </li>
          ))}
        </ol>
      </td>
    </tr>
  );
}

function DocSection({ title }: { title: string }) {
  return (
    <tr>
      <td
        colSpan={2}
        className="border-y border-zinc-200 bg-orange-50 px-5 py-3 text-center text-sm font-semibold tracking-wide text-orange-700"
      >
        {title}
      </td>
    </tr>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="align-top">
      <th
        scope="row"
        className="w-64 border-b border-zinc-200 bg-zinc-50 px-5 py-4 text-left align-top font-medium text-zinc-700"
      >
        {label}
      </th>
      <td className="border-b border-zinc-200 px-5 py-4 font-normal text-zinc-900">{value}</td>
    </tr>
  );
}

export default function HomePage() {
  const [jobTitle, setJobTitle] = useState("");
  const [legalEntityId, setLegalEntityId] = useState(DEFAULT_LEGAL_ENTITY_ID);
  const entity = getLegalEntity(legalEntityId);
  const [department, setDepartment] = useState(entity.departments[0]);
  const [customDepartment, setCustomDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (jobTitle.trim().length <= 1) return false;
    if (department === "__custom__" && customDepartment.trim().length <= 2) return false;
    return true;
  }, [jobTitle, loading, department, customDepartment]);

  const selectedDepartment = department === "__custom__" ? customDepartment.trim() : department;

  function handleLegalEntityChange(nextId: string) {
    const nextEntity = getLegalEntity(nextId);
    setLegalEntityId(nextEntity.id);
    setDepartment(nextEntity.departments[0]);
    setCustomDepartment("");
  }

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const resp = await fetch("/api/di/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, department: selectedDepartment, legalEntity: legalEntityId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page width="full">
      <PageHeader
        title="Должностная инструкция"
        subtitle="Заполните три поля — документ будет собран по корпоративному шаблону."
      />

      {/* Форма узкая и фиксированная, документ занимает всё остальное:
          в тесной колонке текст ДИ рвётся на нечитаемые обрывки. */}
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardTitle hint="Шаблон и структура разделов фиксированы.">Параметры</CardTitle>

          <div className="space-y-4">
            <Field label="Должность или специальность">
              <Input
                placeholder="Например: системный аналитик"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </Field>

            <Field label="Юридическое лицо">
              <Select value={legalEntityId} onChange={(e) => handleLegalEntityChange(e.target.value)}>
                {LEGAL_ENTITIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Структурное подразделение">
              <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                {entity.departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="__custom__">Другое (ввести вручную)</option>
              </Select>
            </Field>

            {department === "__custom__" && (
              <Input
                placeholder="Название подразделения"
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value)}
              />
            )}

            <Button variant="primary" className="w-full" disabled={!canSubmit} loading={loading} onClick={generate}>
              {loading ? "Формируем документ..." : "Сформировать ДИ"}
            </Button>

            {loading && <TimedProgress tau={30} stages={GENERATION_STAGES} />}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </Card>

        <div className="min-w-0">
          {!result && !loading && (
            <div className="flex min-h-90 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white/60 px-6 text-center">
              <DocumentIcon className="size-12" />
              <p className="max-w-sm text-sm text-zinc-500">
                Готовый документ появится здесь. Его можно будет скачать в DOCX или открыть в редакторе для правок
                по разделам.
              </p>
            </div>
          )}

          {/* Скелет будущего документа: строки проявляются по очереди, поэтому
              видно, что процесс идёт, а не завис. */}
          {loading && (
            <Card className="min-h-90 p-0">
              <div className="border-b border-zinc-200 px-5 py-4">
                <div className="mx-auto h-4 w-64 animate-pulse rounded bg-zinc-200" />
              </div>
              <div className="divide-y divide-zinc-200">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex gap-5 px-5 py-4">
                    <div
                      className="h-4 w-56 shrink-0 animate-pulse rounded bg-zinc-200"
                      style={{ animationDelay: `${row * 120}ms` }}
                    />
                    <div className="flex-1 space-y-2">
                      <div
                        className="h-4 w-full animate-pulse rounded bg-zinc-100"
                        style={{ animationDelay: `${row * 120 + 60}ms` }}
                      />
                      <div
                        className="h-4 w-4/5 animate-pulse rounded bg-zinc-100"
                        style={{ animationDelay: `${row * 120 + 120}ms` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {result && !loading && (
            <Card className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-5">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-semibold">Документ сформирован</h2>
                  <Badge tone="accent">версия {result.version}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LinkButton href={`/api/di/export/${result.id}`} variant="primary" size="sm">
                    Скачать DOCX
                  </LinkButton>
                  <LinkButton href={`/history/${result.id}/edit`} size="sm">
                    Открыть в редакторе
                  </LinkButton>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[15px] leading-relaxed">
                  <caption className="border-b border-zinc-200 px-5 py-4 text-center text-sm font-semibold tracking-[0.2em] text-zinc-900">
                    ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ
                  </caption>
                  <tbody>
                    <MetaRow
                      label="Юридическое лицо"
                      value={getLegalEntity(result.payload.templateMeta.legalEntityId).label}
                    />
                    <MetaRow label="Название штатной должности" value={result.payload.templateMeta.positionName} />
                    <MetaRow
                      label="Наименование структурного подразделения"
                      value={result.payload.templateMeta.departmentName}
                    />

                    <DocSection title={result.payload.sections.general.heading} />
                    <DocRow
                      label="Требуемая квалификация и стаж работы по данной должности"
                      items={result.payload.sections.general.requiredQualification}
                    />
                    <DocRow label="Подчиненность" items={result.payload.sections.general.subordination} />
                    <DocRow label="Прием на работу" items={result.payload.sections.general.hiringProcedure} />
                    <DocRow
                      label="Замещение на время отсутствия"
                      items={result.payload.sections.general.substitutionProcedure}
                    />
                    <DocRow
                      label="Нормативные документы, которыми руководствуется в своей деятельности"
                      items={result.payload.sections.general.regulatoryDocuments}
                    />
                    <DocRow
                      label="Локально-нормативные акты"
                      items={result.payload.sections.general.localRegulations}
                    />
                    <DocRow label="Работник должен знать" items={result.payload.sections.general.employeeMustKnow} />

                    <DocSection title={result.payload.sections.duties.heading} />
                    <DocRow label="Работник обязан" items={result.payload.sections.duties.items} />

                    <DocSection title={result.payload.sections.rights.heading} />
                    <DocRow label="Работник имеет право" items={result.payload.sections.rights.items} />

                    <DocSection title={result.payload.sections.responsibility.heading} />
                    <DocRow
                      label="Работник несет ответственность за"
                      items={result.payload.sections.responsibility.items}
                    />
                  </tbody>
                </table>
              </div>

              <div className="border-t border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500">
                {getFinalNoteLines(result.payload.templateMeta.positionName).map((line, idx) => (
                  <p key={`${idx}-${line.slice(0, 20)}`} className={idx > 0 ? "mt-2" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
