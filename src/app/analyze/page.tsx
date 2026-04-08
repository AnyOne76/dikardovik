"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  extractedTextLength: number;
  truncated: boolean;
};

export default function AnalyzePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkCompliance, setCheckCompliance] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError("Выберите файл .docx.");
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

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Проверка готовой должностной инструкции</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Загрузите документ в формате <strong>.docx</strong>. Файлы .doc не поддерживаются — пересохраните в Word как
          docx.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-zinc-800">
          Файл DOCX
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="mt-2 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-orange-800 hover:file:bg-orange-100"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            className="h-4 w-4 accent-orange-600"
            checked={checkCompliance}
            onChange={(e) => setCheckCompliance(e.target.checked)}
          />
          Проверить соответствие ЕКС/ЕТКС (может занять до 1 минуты)
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 inline-flex h-10 items-center rounded-xl bg-orange-600 px-5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-60"
        >
          {loading ? "Проверка…" : "Проверить"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-medium">
              {result.ok
                ? "Структура соответствует шаблону (заголовки секций и схема данных)."
                : "Есть замечания по структуре или схеме данных."}
            </p>
            <p className="mt-1 text-xs opacity-90">
              Извлечено символов: {result.extractedTextLength}
              {result.truncated ? " (текст обрезан до 100 тыс. символов для анализа)" : ""}
              {result.model ? ` · модель: ${result.model}` : ""}
            </p>
          </div>

          {result.ok && result.payload != null && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importing}
                className="inline-flex h-10 items-center rounded-xl bg-orange-600 px-5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-60"
                onClick={async () => {
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
                    if (!r.ok) {
                      throw new Error(typeof data?.error === "string" ? data.error : "Ошибка импорта");
                    }
                    router.push(`/history/${data.id}/edit`);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Ошибка импорта");
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                {importing ? "Импорт…" : "Открыть в редакторе"}
              </button>
            </div>
          )}

          {result.compliance && (
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">Соответствие ЕКС/ЕТКС</h2>
                <p className="text-xs text-zinc-500">
                  {result.compliance.sonarModel ? `Sonar: ${result.compliance.sonarModel}` : ""}
                </p>
              </div>
              {result.compliance.note ? <p className="mt-2 text-xs text-zinc-600">{result.compliance.note}</p> : null}
              {result.compliance.issues?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                  {result.compliance.issues.map((i, idx) => (
                    <li key={`${i.section}-${idx}`}>
                      <span className="text-xs font-medium text-zinc-600">
                        {complianceSectionLabel(i.section)} · {severityLabel(i.severity)}:{" "}
                      </span>
                      {i.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-700">
                  {result.compliance.ok ? "Замечаний не найдено." : "Не удалось выполнить проверку."}
                </p>
              )}
            </div>
          )}

          {result.issues.length > 0 && (
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Замечания</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                {result.issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>
                    {issue.path ? <span className="font-mono text-xs text-zinc-500">{issue.path}: </span> : null}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.ok && result.printablePreview && (
            <details className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                Предпросмотр текста по шаблону
              </summary>
              <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-800">
                {result.printablePreview}
              </pre>
            </details>
          )}
        </div>
      )}
    </main>
  );
}
