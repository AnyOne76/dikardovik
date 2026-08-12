"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { instructionSchema } from "@/lib/di-contract";
import { listInstructionPayloadChanges, type InstructionFieldChange } from "@/lib/di-payload-diff";
import { Button, Card, CardTitle, Notice, Page, PageHeader } from "@/components/ui";

type AnalyzeIssue = { code: string; message: string; path?: string };

const COMPLIANCE_SECTION_LABELS: Record<string, string> = {
  qualification: "Квалификация и стаж",
  mustKnow: "Работник должен знать",
  duties: "Должностные обязанности",
  general: "Общие положения",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "Справка",
  warning: "Предупреждение",
  error: "Ошибка",
};

function complianceSectionLabel(section: string): string {
  return COMPLIANCE_SECTION_LABELS[section] ?? section;
}

function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

type AnalyzeResponse = {
  ok: boolean;
  payload?: unknown;
  printablePreview?: string;
  issues: AnalyzeIssue[];
  model?: string;
  compliance?: {
    ok: boolean;
    issues: { section: string; severity: string; message: string }[];
    sonarModel?: string;
    note?: string;
  };
  /** Подсказка после повторной проверки (сверка с файлом и т.п.) */
  verifyNote?: string | null;
  extractedTextLength: number;
  truncated: boolean;
};

export default function AnalyzePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveHint, setImproveHint] = useState<string | null>(null);
  const [improveDiff, setImproveDiff] = useState<InstructionFieldChange[]>([]);
  const [exporting, setExporting] = useState(false);
  const [checkCompliance, setCheckCompliance] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setImproveHint(null);
    setImproveDiff([]);
    if (!file) {
      setError("Выберите файл .doc или .docx.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const url = checkCompliance ? "/api/di/analyze?compliance=1" : "/api/di/analyze";
      const r = await fetch(url, { method: "POST", body: form });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : `Ошибка ${r.status}`;
        setError(msg);
        return;
      }
      setResult(data as AnalyzeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить запрос.");
    } finally {
      setLoading(false);
    }
  }

  async function importToEditor() {
    if (!result) return;
    setImporting(true);
    setError(null);
    try {
      const r = await fetch("/api/di/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateJson: result.payload }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка импорта");
      router.push(`/history/${data.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  }

  async function improve() {
    if (!result) return;
    setImproving(true);
    setError(null);
    setImproveHint(null);
    setImproveDiff([]);
    const beforeParsed = instructionSchema.parse(JSON.parse(JSON.stringify(result.payload)));
    try {
      let r: Response;
      if (file && file.size > 0) {
        const form = new FormData();
        form.set("templateJson", JSON.stringify(result.payload));
        form.set("analyzeIssues", JSON.stringify(result.issues));
        if (result.compliance) form.set("compliance", JSON.stringify(result.compliance));
        form.set("file", file);
        r = await fetch("/api/di/improve", { method: "POST", body: form, credentials: "include" });
      } else {
        r = await fetch("/api/di/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            templateJson: result.payload,
            analyzeIssues: result.issues,
            compliance: result.compliance,
          }),
        });
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка доработки");

      const payload = data.payload as AnalyzeResponse["payload"];
      const printablePreview = data.printablePreview as string | undefined;
      const model = data.model as string | undefined;
      setResult((prev) =>
        prev
          ? {
              ...prev,
              ok: true,
              payload,
              printablePreview: printablePreview ?? prev.printablePreview,
              model: model ?? prev.model,
              issues: [],
              compliance: undefined,
              verifyNote:
                file && file.size > 0
                  ? "Список замечаний очищен. Доработка выполнялась с текстом загруженного Word. Для новой сверки и ЕКС/ЕТКС нажмите «Проверить» в форме выше (тот же файл можно оставить)."
                  : "Список замечаний очищен. Файл в форме не был выбран — в доработку не попал исходный текст, замечания сверки могут повториться. Выберите тот же .doc/.docx и снова нажмите «Проверить», затем при необходимости «Доработать».",
            }
          : prev,
      );
      const afterParsed = instructionSchema.parse(JSON.parse(JSON.stringify(payload)));
      setImproveDiff(listInstructionPayloadChanges(beforeParsed, afterParsed));
      setImproveHint(
        "Текст инструкции обновлён с учётом замечаний. Смотрите «Что изменилось после доработки»; для повторной проверки нажмите «Проверить» в форме выше или откройте в редакторе.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка доработки");
    } finally {
      setImproving(false);
    }
  }

  async function downloadDraft() {
    if (!result || result.payload == null) return;
    setExporting(true);
    setError(null);
    try {
      const r = await fetch("/api/di/export-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateJson: result.payload }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        const msg =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : `Ошибка ${r.status}`;
        throw new Error(msg);
      }
      const blob = await r.blob();
      let filename = "instrukciya_proverka.docx";
      const cd = r.headers.get("Content-Disposition");
      const m = cd?.match(/filename\*=UTF-8''([^;\s]+)/);
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1]);
        } catch {
          filename = m[1];
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скачать DOCX.");
    } finally {
      setExporting(false);
    }
  }

  const hasRemarks =
    result != null &&
    (result.issues.length > 0 ||
      (result.compliance?.issues?.length ?? 0) > 0 ||
      Boolean(result.compliance?.note?.trim()));

  return (
    <Page width="narrow">
      <PageHeader
        title="Проверка инструкции"
        subtitle="Загрузите готовый документ Word — сервис разберёт его по шаблону и покажет замечания."
      />

      <form onSubmit={onSubmit}>
        <Card>
          <CardTitle hint="Для старых .doc текст извлекается на сервере. Если попадаются артефакты, пересохраните файл в Word как .docx.">
            Документ
          </CardTitle>

          <input
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="block w-full cursor-pointer rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted)] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent-strong)]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300 accent-[var(--accent)]"
              checked={checkCompliance}
              onChange={(e) => setCheckCompliance(e.target.checked)}
            />
            Проверить соответствие ЕКС/ЕТКС (до минуты дольше)
          </label>

          <div className="mt-4">
            <Button type="submit" variant="primary" loading={loading}>
              Проверить
            </Button>
          </div>
        </Card>
      </form>

      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <Notice tone={result.ok ? "success" : "info"}>
            <span className="font-medium">
              {result.ok
                ? "Структура соответствует шаблону."
                : result.payload != null
                  ? "Есть замечания по структуре или сверке с исходным текстом — их можно доработать ниже."
                  : "Есть замечания по структуре или схеме данных (готовый JSON недоступен)."}
            </span>
            <br />
            <span className="text-xs opacity-80">
              Извлечено символов: {result.extractedTextLength}
              {result.truncated ? " (обрезано до 100 тыс. для анализа)" : ""}
              {result.model ? ` · модель: ${result.model}` : ""}
            </span>
          </Notice>

          {result.payload != null && (
            <Card>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" loading={importing} onClick={importToEditor}>
                  Открыть в редакторе
                </Button>
                <Button
                  loading={improving}
                  disabled={importing || !hasRemarks}
                  title={hasRemarks ? undefined : "Сначала нужны замечания: включите проверку ЕКС/ЕТКС и дождитесь анализа"}
                  onClick={improve}
                >
                  Доработать по замечаниям
                </Button>
                <Button loading={exporting} disabled={importing || improving} onClick={downloadDraft}>
                  Скачать DOCX
                </Button>
              </div>

              {improveHint && (
                <p className="mt-3 text-sm text-emerald-800" role="status">
                  {improveHint}
                </p>
              )}

              {improveDiff.length > 0 && (
                <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Что изменилось после доработки ({improveDiff.length})
                  </summary>
                  <ul className="mt-2 max-h-80 space-y-3 overflow-y-auto pl-1">
                    {improveDiff.map((ch, idx) => (
                      <li key={`${ch.path}-${idx}`} className="border-b border-[var(--border)] pb-2 last:border-0">
                        <p className="font-mono text-xs text-[var(--muted)]">{ch.path}</p>
                        <p className="mt-1 text-xs text-red-700 line-through">{ch.before}</p>
                        <p className="mt-0.5 text-xs text-emerald-800">{ch.after}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {result.verifyNote && <p className="mt-3 text-xs text-[var(--muted)]">{result.verifyNote}</p>}

              <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                «Скачать DOCX» формирует файл по шаблону приложения из текущего JSON — это не копия загруженного
                документа. «Доработать» отправляет JSON и замечания в модель; чтобы исправления совпали с повторной
                проверкой, оставьте в поле тот же файл Word. Должность и подразделение не меняются.
              </p>
            </Card>
          )}

          {result.compliance && (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Соответствие ЕКС/ЕТКС</h2>
                {result.compliance.sonarModel && (
                  <p className="text-xs text-[var(--muted)]">Sonar: {result.compliance.sonarModel}</p>
                )}
              </div>
              {result.compliance.note && <p className="mt-2 text-xs text-[var(--muted)]">{result.compliance.note}</p>}
              {result.compliance.issues?.length ? (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                  {result.compliance.issues.map((i, idx) => (
                    <li key={`${i.section}-${idx}`}>
                      <span className="text-xs font-medium text-[var(--muted)]">
                        {complianceSectionLabel(i.section)} · {severityLabel(i.severity)}:{" "}
                      </span>
                      {i.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {result.compliance.ok ? "Замечаний не найдено." : "Не удалось выполнить проверку."}
                </p>
              )}
            </Card>
          )}

          {result.issues.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold">Замечания</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                {result.issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>
                    {issue.path && <span className="font-mono text-xs text-[var(--muted)]">{issue.path}: </span>}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {result.printablePreview && (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Предпросмотр текста по шаблону</summary>
                <pre className="mt-3 max-h-120 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--background)] p-3 text-xs">
                  {result.printablePreview}
                </pre>
              </details>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}
