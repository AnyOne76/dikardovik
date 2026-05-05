import type { ResolvedApiConfig } from "@/lib/api-settings";
import { assertStrictStructure, instructionSchema, toPrintableText, type InstructionPayload } from "@/lib/di-contract";
import { patchEmptyInstructionLists } from "@/lib/di-rules";
import { applyTripleTextQuality } from "@/lib/di-text-quality";

export type AnalyzeIssueLike = { code?: string; message: string; path?: string };
export type ComplianceIssueLike = { section: string; severity: string; message: string };

/**
 * Сжатое текстовое представление замечаний анализа для промпта (без повторной отправки огромного исходника).
 */
export function buildAnalyzeFeedbackBrief(
  issues: AnalyzeIssueLike[],
  compliance?: { note?: string; issues?: ComplianceIssueLike[] },
  maxChars = 14_000,
): string {
  const parts: string[] = [];
  if (compliance?.note?.trim()) {
    parts.push(`Общая справка по ЕКС/ЕТКС: ${compliance.note.trim()}`);
  }
  if (compliance?.issues?.length) {
    parts.push("Замечания проверки соответствия профстандарту / ЕКС–ЕТКС:");
    for (const i of compliance.issues) {
      const msg = String(i.message ?? "").trim();
      if (!msg) continue;
      parts.push(`- Раздел «${i.section}», ${i.severity}: ${msg}`);
    }
  }
  if (issues.length) {
    parts.push("Замечания по формулировкам (второй проход проверки):");
    for (const i of issues) {
      const msg = String(i.message ?? "").trim();
      if (!msg) continue;
      const prefix = i.path ? `${i.path}: ` : "";
      parts.push(`- ${prefix}${msg}`);
    }
  }
  let text = parts.join("\n").trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n… (обрезано)`;
  }
  return text;
}

/** Восстанавливает должность/подразделение, заголовки и минимальные длины списков, если модель срезала массивы. */
export function applyBaseInvariantsToImprovedDraft(base: InstructionPayload, draft: unknown): InstructionPayload {
  if (!draft || typeof draft !== "object") {
    throw new Error("Некорректный ответ модели.");
  }
  const o = structuredClone(draft) as InstructionPayload;
  /** Сохраняет удлинение списка, но не откатывает осмысленное сокращение: иначе хвост старых «галлюцинаций» снова попадает в JSON после доработки. */
  const extend = (prev: string[], cur: string[] | undefined): string[] => {
    const c = Array.isArray(cur) ? cur.map((x) => String(x ?? "")) : [];
    if (c.length >= prev.length) return c;
    const hasSchemaReadyItem = c.some((s) => s.trim().length >= 2);
    if (hasSchemaReadyItem) return c;
    return [...c, ...prev.slice(c.length)];
  };

  o.templateMeta ??= { ...base.templateMeta };
  o.templateMeta.positionName = base.templateMeta.positionName;
  o.templateMeta.departmentName = base.templateMeta.departmentName;

  o.signatures ??= { ...base.signatures };
  o.signatures.acknowledgementSlots = base.signatures.acknowledgementSlots;

  if (!o.sections?.general || !o.sections.duties || !o.sections.rights || !o.sections.responsibility) {
    throw new Error("В ответе модели отсутствуют секции.");
  }

  o.sections.general.heading = base.sections.general.heading;
  o.sections.general.requiredQualification = extend(
    base.sections.general.requiredQualification,
    o.sections.general.requiredQualification,
  );
  o.sections.general.subordination = extend(base.sections.general.subordination, o.sections.general.subordination);
  o.sections.general.hiringProcedure = extend(base.sections.general.hiringProcedure, o.sections.general.hiringProcedure);
  o.sections.general.substitutionProcedure = extend(
    base.sections.general.substitutionProcedure,
    o.sections.general.substitutionProcedure,
  );
  o.sections.general.regulatoryDocuments = extend(
    base.sections.general.regulatoryDocuments,
    o.sections.general.regulatoryDocuments,
  );
  o.sections.general.localRegulations = extend(
    base.sections.general.localRegulations,
    o.sections.general.localRegulations,
  );
  o.sections.general.employeeMustKnow = extend(
    base.sections.general.employeeMustKnow,
    o.sections.general.employeeMustKnow,
  );

  o.sections.duties.heading = base.sections.duties.heading;
  o.sections.duties.items = extend(base.sections.duties.items, o.sections.duties.items);

  o.sections.rights.heading = base.sections.rights.heading;
  o.sections.rights.items = extend(base.sections.rights.items, o.sections.rights.items);

  o.sections.responsibility.heading = base.sections.responsibility.heading;
  o.sections.responsibility.items = extend(base.sections.responsibility.items, o.sections.responsibility.items);

  return o;
}

/**
 * Один проход LLM: доработать текст инструкции под замечания, затем патч пустых полей, zod, структура, тройная проверка текста.
 * @param opts.sourceDocumentText — фрагмент текста исходного Word (как при анализе); без него невозможно устранить замечания сверки с документом.
 */
export async function improveInstructionFromAnalyzeFeedback(
  payload: InstructionPayload,
  feedbackBrief: string,
  resolved: ResolvedApiConfig,
  opts?: { sourceDocumentText?: string },
): Promise<{ payload: InstructionPayload; model: string; printablePreview: string }> {
  const apiKey = resolved.openrouterApiKey.trim();
  if (!apiKey) {
    throw new Error("Ключ OpenRouter не настроен.");
  }
  if (!feedbackBrief.trim()) {
    throw new Error("Нет текста замечаний для доработки.");
  }

  const model = resolved.openrouterModel;
  const rawJson = JSON.stringify(payload);
  if (rawJson.length > 120_000) {
    throw new Error("Объём инструкции слишком велик для одной доработки. Сохраните версию и правьте по секциям в редакторе.");
  }

  const sourceRaw = (opts?.sourceDocumentText ?? "").trim();
  const sourceForPrompt =
    sourceRaw.length >= 20 ? sourceRaw.slice(0, 52_000) : "";
  const sourceBlock =
    sourceForPrompt.length > 0
      ? `

Ниже — текст исходного документа Word (тот же, что загружали для проверки). Сверяй пункты JSON с этим текстом буквально и по смыслу.
Если замечание говорит, что формулировки нет в исходнике: перенеси в JSON только то, что подтверждается этим текстом; спорные вставки удали или замени близкой по смыслу фразой из фрагмента.
Фрагмент (может быть усечён по объёму):
---
${sourceForPrompt}
---
`
      : `

Внимание: исходный текст Word в запрос не передан — ты опираешься только на замечания и текущий JSON. Для замечаний сверки с документом без исходника правки могут не устранить повторную проверку; пользователю нужно дорабатывать с тем же файлом в форме.
`;

  const prompt = `Ты редактор кадровых документов на русском языке (должностная инструкция).

Дана текущая инструкция в виде JSON и список замечаний от автоматической проверки. Доработай формулировки так, чтобы замечания были учтены по смыслу: дополни обязанности и блоки «должен знать», уточни квалификацию и т.п., где это следует из замечаний.
${sourceBlock}
Жёсткие правила:
- Верни ТОЛЬКО один JSON-объект той же структуры (как во входе), без markdown и пояснений.
- Заголовки секций не меняй: sections.general.heading = "1. ОБЩИЕ ПОЛОЖЕНИЯ", duties "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ", rights "3. ПРАВА", responsibility "4. ОТВЕТСТВЕННОСТЬ".
- Поля templateMeta.positionName и templateMeta.departmentName оставь теми же строками, что во входе (символ в символ).
- Если замечание — про несоответствие исходному документу или лишний текст: замени формулировку на опирающуюся на исходник или удали этот пункт. Число элементов в каждом массиве не должно быть нулевым; по остальным позициям списки можно сокращать или удлинять по необходимости.
- Каждый пункт списка — осмысленная фраза на русском, не короче 2 символов.
- signatures.acknowledgementSlots оставь равным значению из входа.

Замечания и рекомендации:
${feedbackBrief}

Входной JSON:
${rawJson}`;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      temperature: 0.15,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenRouter: ${resp.status} ${t.slice(0, 200)}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = (await resp.json()) as typeof data;
  } catch {
    throw new Error("Ответ OpenRouter не JSON. Попробуйте ещё раз.");
  }
  const content = String(data?.choices?.[0]?.message?.content ?? "");
  const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Модель вернула не JSON. Попробуйте ещё раз.");
  }

  const merged = applyBaseInvariantsToImprovedDraft(payload, parsed);
  const patched = patchEmptyInstructionLists(merged);
  const safe = instructionSchema.safeParse(patched);
  if (!safe.success) {
    throw new Error("После доработки структура не сошлась со схемой. Попробуйте снова или правьте вручную.");
  }

  try {
    assertStrictStructure(safe.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }

  let refined = await applyTripleTextQuality(safe.data, { resolvedApi: resolved });
  refined = instructionSchema.parse(refined);
  assertStrictStructure(refined);

  return {
    payload: refined,
    model,
    printablePreview: toPrintableText(refined),
  };
}
