import mammoth from "mammoth";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import {
  assertStrictStructure,
  instructionSchema,
  toPrintableText,
  type InstructionPayload,
} from "@/lib/di-contract";
import { fetchPerplexityFactsForSection } from "@/lib/perplexity";

loadEnvConfig(process.cwd());

const MAX_TEXT_CHARS = 100_000;
const ANALYZE_TIMEOUT_MS = 60_000;
const COMPLIANCE_TIMEOUT_MS = 60_000;

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
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

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
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

  const safe = instructionSchema.safeParse(parsed);
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

  return {
    ok: true,
    payload: safe.data,
    printablePreview: toPrintableText(safe.data),
    issues: [],
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

  const data = await resp.json();
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
