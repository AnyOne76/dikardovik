import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import {
  assertStrictStructure,
  instructionSchema,
  toPrintableText,
  type InstructionPayload,
} from "@/lib/di-contract";
import { patchEmptyInstructionLists } from "@/lib/di-rules";
import { fetchPerplexityFactsForSection } from "@/lib/perplexity";

loadEnvConfig(process.cwd());

const legacyWordExtractor = new WordExtractor();

const MAX_TEXT_CHARS = 100_000;
const ANALYZE_TIMEOUT_MS = 60_000;
const COMPLIANCE_TIMEOUT_MS = 60_000;
const VERIFY_TIMEOUT_MS = 55_000;
/** Фрагмент исходника и JSON для второго прохода (лимит символов на промпт). */
const VERIFY_SOURCE_CHARS = 52_000;
const VERIFY_JSON_CHARS = 45_000;

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
}

/** Legacy Word 97–2003 (.doc, OLE). Тело и примечания/сноски — как доп. контекст для анализа. */
export async function extractLegacyDocText(buffer: Buffer): Promise<string> {
  const doc = await legacyWordExtractor.extract(buffer);
  const parts: string[] = [];
  const body = doc.getBody();
  if (body?.trim()) parts.push(body.trim());
  const footnotes = doc.getFootnotes();
  if (footnotes?.trim()) parts.push(footnotes.trim());
  const endnotes = doc.getEndnotes();
  if (endnotes?.trim()) parts.push(endnotes.trim());
  return parts.join("\n\n").trim();
}

export function isSupportedWordUploadName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const isDocx = lower.endsWith(".docx");
  const isDoc = lower.endsWith(".doc") && !isDocx;
  return isDocx || isDoc;
}

export async function extractInstructionFileText(buffer: Buffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    return extractDocxText(buffer);
  }
  if (lower.endsWith(".doc")) {
    return extractLegacyDocText(buffer);
  }
  throw new Error("unsupported_word_extension");
}

export type AnalyzeIssue = { code: string; message: string; path?: string };

export type AnalyzeResult = {
  ok: boolean;
  payload?: InstructionPayload;
  printablePreview?: string;
  issues: AnalyzeIssue[];
  model?: string;
  compliance?: ComplianceReport;
  extractedTextLength: number;
  truncated: boolean;
};

export type ComplianceIssue = {
  section: "qualification" | "mustKnow" | "duties" | "general";
  severity: "info" | "warning" | "error";
  message: string;
};

export type ComplianceReport = {
  ok: boolean;
  issues: ComplianceIssue[];
  sonarModel?: string;
  note?: string;
};

function parseJsonFromLlmContent(content: string): unknown {
  const stripped = content
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/gm, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("no_json_object");
  }
}

function zodIssuesToAnalyzeIssues(error: z.ZodError): AnalyzeIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.length ? issue.path.map(String).join(".") : undefined,
  }));
}

const extractionVerifyResponseSchema = z.object({
  findings: z
    .array(
      z.object({
        jsonPath: z.string().optional(),
        severity: z.enum(["error", "warning"]).default("error"),
        detail: z.string().min(3),
      }),
    )
    .default([]),
});

/**
 * Второй проход: другая роль промпта, сверка JSON с исходником (галлюцинации, оскорбления, чужой смысл).
 * При сбое сети/разбора — не блокируем анализ, только предупреждение в issues.
 */
async function verifyExtractionAgainstSource(
  documentText: string,
  payload: InstructionPayload,
  apiKey: string,
  verifyModel: string,
): Promise<{ blocked: boolean; issues: AnalyzeIssue[]; skipped?: boolean }> {
  const disabled = (process.env.OPENROUTER_VERIFY_DISABLED ?? "").trim();
  if (disabled === "1" || disabled.toLowerCase() === "true") {
    return { blocked: false, issues: [] };
  }

  const source = documentText.slice(0, VERIFY_SOURCE_CHARS);
  const jsonSlice = JSON.stringify(payload).slice(0, VERIFY_JSON_CHARS);

  const prompt = `Ты независимый контролёр качества. Другая модель извлекла JSON должностной инструкции из текста документа.

Задача: найти только РЕАЛЬНЫЕ проблемы — галлюцинации, текст которого нельзя обосновать исходником, абсурдные или непрофессиональные/оскорбительные вставки, явно чуждые кадровому документу формулировки.

Нормально: аккуратная перефразировка, разбиение/склейка пунктов, если смысл взят из исходника.

Если сомневаешься — НЕ добавляй пункт в findings (лучше пропустить, чем ложное срабатывание).

Верни ТОЛЬКО JSON:
{"findings":[{"jsonPath":"опционально путь в JSON","severity":"error","detail":"кратко по-русски"}]}

severity: "error" — точно неприемлемо; "warning" — заметное расхождение с исходником без явной абсурдности.

ИСХОДНЫЙ ТЕКСТ (фрагмент):
---
${source}
---

ИЗВЛЕЧЁННЫЙ JSON (фрагмент):
---
${jsonSlice}
---
`;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: verifyModel,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return {
      blocked: false,
      issues: [
        {
          code: "extraction_verify_skipped",
          message: `Двойная проверка не выполнена: ${e instanceof Error ? e.message : String(e)}. Результат первого прохода показан без подтверждения второй моделью.`,
        },
      ],
      skipped: true,
    };
  }

  if (!response.ok) {
    const t = await response.text().catch(() => "");
    return {
      blocked: false,
      issues: [
        {
          code: "extraction_verify_skipped",
          message: `Двойная проверка не выполнена (HTTP ${response.status}). ${t.slice(0, 160)}`,
        },
      ],
      skipped: true,
    };
  }

  const rawBody = await response.text().catch(() => "");
  let verifyChatData: { choices?: { message?: { content?: string } }[] };
  try {
    verifyChatData = JSON.parse(rawBody) as typeof verifyChatData;
  } catch {
    const trimmed = rawBody.trim();
    const hint = trimmed ? trimmed.slice(0, 220).replace(/\s+/g, " ") : "";
    const looksHtml = /^<!doctype|^<html[\s>]/i.test(trimmed);
    const tail = trimmed.length > 220 ? "…" : "";
    const extra = !hint
      ? "Пустой ответ — проверьте OPENROUTER_API_KEY, сеть и лимиты провайдера."
      : looksHtml
        ? "Пришёл HTML вместо JSON (часто прокси, VPN или блокировка). "
        : "";
    return {
      blocked: false,
      issues: [
        {
          code: "extraction_verify_skipped",
          message: `Двойная проверка не выполнена: ответ сервиса не JSON. ${extra}${hint ? `Фрагмент: ${hint}${tail}` : ""}`,
        },
      ],
      skipped: true,
    };
  }
  const content = verifyChatData?.choices?.[0]?.message?.content || "";
  let parsed: unknown;
  try {
    parsed = parseJsonFromLlmContent(content);
  } catch {
    return {
      blocked: false,
      issues: [
        {
          code: "extraction_verify_skipped",
          message: "Двойная проверка не выполнена: не удалось разобрать ответ контролёра.",
        },
      ],
      skipped: true,
    };
  }

  const safe = extractionVerifyResponseSchema.safeParse(parsed);
  if (!safe.success) {
    return {
      blocked: false,
      issues: [
        {
          code: "extraction_verify_skipped",
          message: "Двойная проверка не выполнена: неверный формат ответа контролёра.",
        },
      ],
      skipped: true,
    };
  }

  const { findings } = safe.data;
  if (!findings.length) {
    return { blocked: false, issues: [] };
  }

  const blocking = findings.some((f) => f.severity === "error");
  const issues: AnalyzeIssue[] = findings.map((f) => ({
    code: f.severity === "error" ? "extraction_verify_error" : "extraction_verify_warning",
    message: f.detail,
    path: f.jsonPath,
  }));

  return { blocked: blocking, issues };
}

/** Публичная обёртка: сверка готового JSON с текстом исходного документа (второй проход анализа). */
export async function verifyInstructionPayloadAgainstDocumentText(
  documentText: string,
  payload: InstructionPayload,
  apiKey: string,
  verifyModel: string,
): Promise<{ blocked: boolean; issues: AnalyzeIssue[]; skipped?: boolean }> {
  return verifyExtractionAgainstSource(documentText, payload, apiKey, verifyModel);
}

export async function analyzeInstructionFromText(documentText: string): Promise<AnalyzeResult> {
  const extractedTextLength = documentText.length;
  const truncated = documentText.length > MAX_TEXT_CHARS;
  const text = documentText.slice(0, MAX_TEXT_CHARS);

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!apiKey) {
    return {
      ok: false,
      issues: [
        {
          code: "missing_api_key",
          message: "Для анализа загруженного документа задайте OPENROUTER_API_KEY на сервере.",
        },
      ],
      extractedTextLength,
      truncated,
    };
  }

  const prompt = `Тебе дан текст должностной инструкции (возможны таблицы, переносы строк, лишние пробелы).
Задача: извлечь содержание и представить его строго в виде JSON по схеме ниже.

Заголовки секций в JSON должны быть ТОЧНО такими строками:
- "1. ОБЩИЕ ПОЛОЖЕНИЯ"
- "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ"
- "3. ПРАВА"
- "4. ОТВЕТСТВЕННОСТЬ"

Схема JSON:
{
  "templateMeta": { "approvedBy": "...", "positionName": "...", "departmentName": "..." },
  "sections": {
    "general": {
      "heading": "1. ОБЩИЕ ПОЛОЖЕНИЯ",
      "requiredQualification": ["..."],
      "subordination": ["..."],
      "hiringProcedure": ["..."],
      "substitutionProcedure": ["..."],
      "regulatoryDocuments": ["..."],
      "localRegulations": ["..."],
      "employeeMustKnow": ["..."]
    },
    "duties": { "heading": "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ", "items": ["..."] },
    "rights": { "heading": "3. ПРАВА", "items": ["..."] },
    "responsibility": { "heading": "4. ОТВЕТСТВЕННОСТЬ", "items": ["..."] }
  },
  "signatures": { "coordinator": "...", "acknowledgementSlots": 8 }
}

Правила:
- Каждый пункт списка — отдельная строка в массиве.
- Переноси формулировки из текста документа; не придумывай новые обязанности и права, если они есть в тексте.
- Не добавляй отсебятину, оскорбления, шутки и формулировки вне кадрового документа; каждый пункт должен опираться на смысл исходного текста.
- Если какого-то блока в документе нет — заполни минимально допустимым содержанием по смыслу остального текста.
- acknowledgementSlots: целое число от 1 до 20 (по числу строк ознакомления в документе, иначе 8).
- Верни ТОЛЬКО JSON без пояснений до и после.

Текст документа:
---
${text}
---`;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          code: "openrouter_network",
          message: `Не удалось связаться с сервисом анализа: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      extractedTextLength,
      truncated,
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return {
      ok: false,
      issues: [
        {
          code: "openrouter_http",
          message: `Сервис анализа вернул ошибку ${response.status}. ${errText.slice(0, 240)}`,
        },
      ],
      extractedTextLength,
      truncated,
    };
  }

  let analyzeChatData: { choices?: { message?: { content?: string } }[] };
  try {
    analyzeChatData = (await response.json()) as typeof analyzeChatData;
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          code: "openrouter_json",
          message: `Ответ сервиса анализа не удалось разобрать как JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      model,
      extractedTextLength,
      truncated,
    };
  }
  const content = analyzeChatData?.choices?.[0]?.message?.content || "";
  let parsed: unknown;
  try {
    parsed = parseJsonFromLlmContent(content);
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "llm_json",
          message:
            "Не удалось разобрать ответ модели как JSON. Попробуйте другой файл или повторите позже.",
        },
      ],
      model,
      extractedTextLength,
      truncated,
    };
  }

  const safe = instructionSchema.safeParse(patchEmptyInstructionLists(parsed));
  if (!safe.success) {
    return {
      ok: false,
      issues: zodIssuesToAnalyzeIssues(safe.error),
      model,
      extractedTextLength,
      truncated,
    };
  }

  try {
    assertStrictStructure(safe.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      issues: [{ code: "strict_structure", message: msg }],
      model,
      extractedTextLength,
      truncated,
    };
  }

  const verifyModel = (process.env.OPENROUTER_VERIFY_MODEL ?? "").trim() || model;
  const verify = await verifyExtractionAgainstSource(text, safe.data, apiKey, verifyModel);

  if (verify.blocked) {
    return {
      ok: false,
      payload: safe.data,
      printablePreview: toPrintableText(safe.data),
      issues: verify.issues,
      model,
      extractedTextLength,
      truncated,
    };
  }

  return {
    ok: true,
    payload: safe.data,
    printablePreview: toPrintableText(safe.data),
    issues: verify.issues,
    model,
    extractedTextLength,
    truncated,
  };
}

function parseJsonObjectFromText(text: string): unknown {
  const stripped = String(text ?? "").replace(/^```json\\s*/i, "").replace(/```\\s*$/gm, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error("no_json_object");
  }
}

export async function checkComplianceEksEtks(payload: InstructionPayload): Promise<ComplianceReport> {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const pplxKey = (process.env.PERPLEXITY_API_KEY ?? "").trim();

  if (!apiKey) {
    return {
      ok: false,
      issues: [{ section: "general", severity: "warning", message: "Нет OPENROUTER_API_KEY — проверка соответствия недоступна." }],
    };
  }
  if (!pplxKey) {
    return {
      ok: false,
      issues: [{ section: "general", severity: "warning", message: "Нет PERPLEXITY_API_KEY (Sonar) — проверка соответствия ЕКС/ЕТКС ограничена." }],
      note: "Можно включить PERPLEXITY_API_KEY, чтобы подтягивать нормативно-ориентированные выдержки.",
    };
  }

  const jobTitle = payload.templateMeta.positionName;
  const department = payload.templateMeta.departmentName;

  // Pull “normative-oriented” snippets via Sonar for key areas.
  let sonarModel = process.env.PERPLEXITY_MODEL || "sonar-pro";
  const [qual, mustKnow, duties] = await Promise.all([
    fetchPerplexityFactsForSection({
      jobTitle,
      department,
      sectionHuman: "Требуемая квалификация и стаж работы по данной должности (ориентир: ЕКС/ЕТКС/профстандарты)",
      desiredCount: 20,
    }).catch(() => ({ snippets: [], model: sonarModel })),
    fetchPerplexityFactsForSection({
      jobTitle,
      department,
      sectionHuman: "Работник должен знать (ориентир: ЕКС/ЕТКС/профстандарты)",
      desiredCount: 24,
    }).catch(() => ({ snippets: [], model: sonarModel })),
    fetchPerplexityFactsForSection({
      jobTitle,
      department,
      sectionHuman: "Работник обязан (функциональные обязанности; ориентир: ЕКС/ЕТКС/профстандарты)",
      desiredCount: 35,
    }).catch(() => ({ snippets: [], model: sonarModel })),
  ]);

  sonarModel = duties.model || mustKnow.model || qual.model || sonarModel;

  const prompt = `Проверь должностную инструкцию на соответствие российским квалификационным ориентирам (ЕКС/ЕТКС и профстандарты) по смыслу.
У тебя есть:
1) Извлеченная ДИ в JSON (по корпоративному шаблону)
2) Справочные выдержки (получены через поиск Sonar; могут быть шумными)

Нужно:
- Найти потенциальные несоответствия/пробелы по 3 зонам: квалификация, должен знать, обязанности.
- Выдать краткие замечания с уровнем: info|warning|error.
- НЕ выдумывай нормы и номера документов. Если не уверен — ставь warning.
- Верни ТОЛЬКО JSON:
{
  "ok": boolean,
  "issues": [
    { "section": "qualification|mustKnow|duties|general", "severity": "info|warning|error", "message": "..." }
  ],
  "note": "опционально"
}

Должность: ${jobTitle}
Подразделение: ${department}

Справка (квалификация):
${qual.snippets.slice(0, 40).join("\\n") || "—"}

Справка (должен знать):
${mustKnow.snippets.slice(0, 40).join("\\n") || "—"}

Справка (обязанности):
${duties.snippets.slice(0, 60).join("\\n") || "—"}

DI JSON:
${JSON.stringify(payload).slice(0, 60_000)}
`;

  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(COMPLIANCE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      sonarModel,
      issues: [
        {
          section: "general",
          severity: "warning",
          message: `Не удалось выполнить проверку соответствия: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      sonarModel,
      issues: [
        { section: "general", severity: "warning", message: `Ошибка сервиса проверки ${resp.status}. ${t.slice(0, 200)}` },
      ],
    };
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = (await resp.json()) as typeof data;
  } catch (e) {
    return {
      ok: false,
      sonarModel,
      issues: [
        {
          section: "general",
          severity: "warning",
          message: `Ответ сервиса проверки не JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }
  const content = data?.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = parseJsonObjectFromText(content);
  } catch {
    return {
      ok: false,
      sonarModel,
      issues: [{ section: "general", severity: "warning", message: "Не удалось разобрать ответ проверки как JSON." }],
    };
  }

  const schema = z.object({
    ok: z.boolean(),
    issues: z
      .array(
        z.object({
          section: z.enum(["qualification", "mustKnow", "duties", "general"]),
          severity: z.enum(["info", "warning", "error"]),
          message: z.string().min(3),
        }),
      )
      .default([]),
    note: z.string().optional(),
  });

  const safe = schema.safeParse(parsed);
  if (!safe.success) {
    return {
      ok: false,
      sonarModel,
      issues: [{ section: "general", severity: "warning", message: "Ответ проверки имеет неверный формат." }],
    };
  }

  return { ...safe.data, sonarModel };
}
