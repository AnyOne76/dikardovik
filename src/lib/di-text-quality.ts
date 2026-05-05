import { fixedHeaders, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import {
  capitalizeListItems,
  coerceAcknowledgementSlots,
  coerceInstructionListItems,
  coerceNonEmptyScalar,
  ensureResponsibilityItems,
  FIXED_SUBORDINATION_LINES,
  RESPONSIBILITY_FALLBACK_ITEMS,
  SCHEMA_LIST_FALLBACKS,
  SCHEMA_SCALAR_FALLBACKS,
} from "@/lib/di-rules";
import type { ResolvedApiConfig } from "@/lib/api-settings";

const SPELLER_URL = "https://speller.yandex.net/services/spellservice.json/checkTexts";
const MAX_SPELL_CHUNK = 9_500;

type SpellerError = { pos: number; len: number; s: string[] };

function normalizeTerminologyLight(text: string): string {
  return String(text ?? "")
    .replace(/Начальник/g, "Руководитель")
    .replace(/начальник/g, "руководитель")
    .replace(/руководительу/gi, (w) => (w[0] === "Р" ? "Руководителю" : "руководителю"))
    .replace(/\bруководителю(\S)/g, "руководителю $1")
    .replace(/\bруководителя(\S)/g, "руководителя $1");
}

function applyTerminologyToPayload(payload: InstructionPayload): InstructionPayload {
  const p = structuredClone(payload);
  const nt = (t: string) => normalizeTerminologyLight(t);
  p.templateMeta.approvedBy = nt(p.templateMeta.approvedBy);
  p.templateMeta.positionName = nt(p.templateMeta.positionName);
  p.templateMeta.departmentName = nt(p.templateMeta.departmentName);
  p.sections.general.requiredQualification = p.sections.general.requiredQualification.map(nt);
  p.sections.general.subordination = p.sections.general.subordination.map(nt);
  p.sections.general.hiringProcedure = p.sections.general.hiringProcedure.map(nt);
  p.sections.general.substitutionProcedure = p.sections.general.substitutionProcedure.map(nt);
  p.sections.general.regulatoryDocuments = p.sections.general.regulatoryDocuments.map(nt);
  p.sections.general.localRegulations = p.sections.general.localRegulations.map(nt);
  p.sections.general.employeeMustKnow = p.sections.general.employeeMustKnow.map(nt);
  p.sections.duties.items = p.sections.duties.items.map(nt);
  p.sections.rights.items = p.sections.rights.items.map(nt);
  p.sections.responsibility.items = p.sections.responsibility.items.map(nt);
  p.signatures.coordinator = nt(p.signatures.coordinator);
  return p;
}

/**
 * Детерминированная зачистка: типографика, типовые опечатки модели, лишние символы.
 * Не заменяет смысл и не «перефразирует» — только поверхность текста.
 */
export function sanitizeInstructionSurfaceText(value: string): string {
  const stripped = String(value ?? "")
    .replace(/[^\p{Script=Cyrillic}\p{Script=Latin}\d\s.,;:!?()\-/"'№%]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  let s = stripped
    .replace(/\bифргафические\b/gi, "орфографические")
    .replace(/\bне рабочих\b/gi, "нерабочих")
    .replace(/примичание/gi, "ПРИМЕЧАНИЕ")
    .replace(/\bруководителюцеха\b/gi, "руководителю цеха")
    .replace(/\bруководителяцеха\b/gi, "руководителя цеха")
    .replace(/\s+([,.;:!?])/g, "$1");

  s = s.replace(/([,.;:!?])(?=\S)/g, "$1 ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function applySpellerErrors(text: string, errors: SpellerError[]): string {
  if (!errors?.length) return text;
  const sorted = [...errors].sort((a, b) => b.pos - a.pos);
  let result = text;
  for (const err of sorted) {
    const suggestion = err.s?.[0];
    if (suggestion == null) continue;
    const safePos = Math.max(0, Math.min(err.pos, result.length));
    const safeLen = Math.max(0, Math.min(err.len, result.length - safePos));
    result = result.slice(0, safePos) + suggestion + result.slice(safePos + safeLen);
  }
  return result;
}

async function yandexCheckTexts(texts: string[]): Promise<SpellerError[][]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const resp = await fetch(SPELLER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(texts),
      signal: controller.signal,
    });
    if (!resp.ok) return texts.map(() => []);
    const data = (await resp.json()) as unknown;
    if (!Array.isArray(data)) return texts.map(() => []);
    return data.map((block) => (Array.isArray(block) ? (block as SpellerError[]) : []));
  } catch {
    return texts.map(() => []);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Проход Яндекс.Спеллера по списку строк (пакетами по длине).
 */
export async function applyYandexSpellerBatch(strings: string[]): Promise<string[]> {
  if (strings.length === 0) return [];
  const out: string[] = [];
  let batch: string[] = [];
  let batchLen = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const errBlocks = await yandexCheckTexts(batch);
    for (let i = 0; i < batch.length; i += 1) {
      out.push(applySpellerErrors(batch[i], errBlocks[i] ?? []));
    }
    batch = [];
    batchLen = 0;
  };

  for (const raw of strings) {
    const s = raw;
    const incr = s.length + 20;
    if (batch.length > 0 && (batchLen + incr > MAX_SPELL_CHUNK || batch.length >= 50)) {
      await flush();
    }
    batch.push(s);
    batchLen += incr;
  }
  await flush();
  return out;
}

type ProofShape = {
  templateMeta: InstructionPayload["templateMeta"];
  sections: {
    general: Omit<InstructionPayload["sections"]["general"], "heading">;
    duties: Pick<InstructionPayload["sections"]["duties"], "items">;
    rights: Pick<InstructionPayload["sections"]["rights"], "items">;
    responsibility: Pick<InstructionPayload["sections"]["responsibility"], "items">;
  };
  signatures: Pick<InstructionPayload["signatures"], "coordinator">;
};

function extractProofShape(payload: InstructionPayload): ProofShape {
  const { heading: _g, ...restGeneral } = payload.sections.general;
  void _g;
  return {
    templateMeta: { ...payload.templateMeta },
    sections: {
      general: restGeneral,
      duties: { items: [...payload.sections.duties.items] },
      rights: { items: [...payload.sections.rights.items] },
      responsibility: { items: [...payload.sections.responsibility.items] },
    },
    signatures: { coordinator: payload.signatures.coordinator },
  };
}

function sameListLengths(a: InstructionPayload, proof: ProofShape): boolean {
  const g = a.sections.general;
  const p = proof.sections;
  return (
    g.requiredQualification.length === p.general.requiredQualification.length &&
    g.subordination.length === p.general.subordination.length &&
    g.hiringProcedure.length === p.general.hiringProcedure.length &&
    g.substitutionProcedure.length === p.general.substitutionProcedure.length &&
    g.regulatoryDocuments.length === p.general.regulatoryDocuments.length &&
    g.localRegulations.length === p.general.localRegulations.length &&
    g.employeeMustKnow.length === p.general.employeeMustKnow.length &&
    a.sections.duties.items.length === p.duties.items.length &&
    a.sections.rights.items.length === p.rights.items.length &&
    a.sections.responsibility.items.length === p.responsibility.items.length
  );
}

function mergeProofShape(base: InstructionPayload, proof: ProofShape): InstructionPayload {
  const out = structuredClone(base);
  out.templateMeta = proof.templateMeta;
  out.sections.general = {
    ...proof.sections.general,
    heading: fixedHeaders.sec1,
  };
  out.sections.duties = { ...out.sections.duties, items: proof.sections.duties.items, heading: fixedHeaders.sec2 };
  out.sections.rights = { ...out.sections.rights, items: proof.sections.rights.items, heading: fixedHeaders.sec3 };
  out.sections.responsibility = {
    ...out.sections.responsibility,
    items: proof.sections.responsibility.items,
    heading: fixedHeaders.sec4,
  };
  out.signatures = { ...out.signatures, coordinator: proof.signatures.coordinator };
  return out;
}

async function proofreadWithOpenRouter(
  payload: InstructionPayload,
  resolved: ResolvedApiConfig,
): Promise<InstructionPayload | null> {
  const apiKey = resolved.openrouterApiKey.trim();
  if (!apiKey) return null;

  const slice = extractProofShape(payload);
  const prompt = `Ты профессиональный редактор кадровых документов на русском языке.

Исправь ТОЛЬКО орфографию, пунктуацию и очевидные грамматические огрехи.
Запрещено: менять смысл, сокращать или дополнять содержание, добавлять новые обязанности/права, менять юридические формулировки целиком, объединять или дробить пункты.

Обязательно сохрани точное количество строк в каждом массиве (длины списков неизменны).

Верни ТОЛЬКО JSON той же структуры, что и вход (без полей heading у секций):

${JSON.stringify(slice)}

Ответ — один JSON-объект, без markdown и пояснений.`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: resolved.openrouterModel,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = String(data?.choices?.[0]?.message?.content ?? "");
    const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonText) as ProofShape;
    if (!parsed?.templateMeta || !parsed.sections) return null;
    if (!sameListLengths(payload, parsed)) return null;
    const merged = mergeProofShape(payload, parsed);
    const checked = instructionSchema.safeParse(merged);
    return checked.success ? checked.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function collectAllEditableStrings(payload: InstructionPayload): string[] {
  const { templateMeta, sections, signatures } = payload;
  return [
    templateMeta.approvedBy,
    templateMeta.positionName,
    templateMeta.departmentName,
    ...sections.general.requiredQualification,
    ...sections.general.subordination,
    ...sections.general.hiringProcedure,
    ...sections.general.substitutionProcedure,
    ...sections.general.regulatoryDocuments,
    ...sections.general.localRegulations,
    ...sections.general.employeeMustKnow,
    ...sections.duties.items,
    ...sections.rights.items,
    ...sections.responsibility.items,
    signatures.coordinator,
  ];
}

function scatterEditableStrings(payload: InstructionPayload, strings: string[]): InstructionPayload {
  const out = structuredClone(payload);
  let i = 0;
  const take = () => {
    const v = strings[i] ?? "";
    i += 1;
    return v;
  };
  out.templateMeta.approvedBy = take();
  out.templateMeta.positionName = take();
  out.templateMeta.departmentName = take();
  out.sections.general.requiredQualification = out.sections.general.requiredQualification.map(() => take());
  out.sections.general.subordination = out.sections.general.subordination.map(() => take());
  out.sections.general.hiringProcedure = out.sections.general.hiringProcedure.map(() => take());
  out.sections.general.substitutionProcedure = out.sections.general.substitutionProcedure.map(() => take());
  out.sections.general.regulatoryDocuments = out.sections.general.regulatoryDocuments.map(() => take());
  out.sections.general.localRegulations = out.sections.general.localRegulations.map(() => take());
  out.sections.general.employeeMustKnow = out.sections.general.employeeMustKnow.map(() => take());
  out.sections.duties.items = out.sections.duties.items.map(() => take());
  out.sections.rights.items = out.sections.rights.items.map(() => take());
  out.sections.responsibility.items = out.sections.responsibility.items.map(() => take());
  out.signatures.coordinator = take();
  return out;
}

/**
 * Жёсткие бизнес-инварианты после языковой обработки (подчинённость, регистр списков, охват ответственности).
 */
export function reapplyInstructionTextGuards(payload: InstructionPayload): InstructionPayload {
  const out = structuredClone(payload);
  out.sections.general.subordination = [...FIXED_SUBORDINATION_LINES];
  out.sections.general.requiredQualification = capitalizeListItems(
    coerceInstructionListItems(out.sections.general.requiredQualification, SCHEMA_LIST_FALLBACKS.requiredQualification),
  );
  out.sections.general.hiringProcedure = capitalizeListItems(
    coerceInstructionListItems(out.sections.general.hiringProcedure, SCHEMA_LIST_FALLBACKS.hiringProcedure),
  );
  out.sections.general.substitutionProcedure = capitalizeListItems(
    coerceInstructionListItems(
      out.sections.general.substitutionProcedure,
      SCHEMA_LIST_FALLBACKS.substitutionProcedure,
    ),
  );
  out.sections.general.regulatoryDocuments = capitalizeListItems(
    coerceInstructionListItems(
      out.sections.general.regulatoryDocuments,
      SCHEMA_LIST_FALLBACKS.regulatoryDocuments,
    ),
  );
  out.sections.general.localRegulations = capitalizeListItems(
    coerceInstructionListItems(out.sections.general.localRegulations, SCHEMA_LIST_FALLBACKS.localRegulations),
  );
  out.sections.general.employeeMustKnow = capitalizeListItems(
    coerceInstructionListItems(out.sections.general.employeeMustKnow, SCHEMA_LIST_FALLBACKS.employeeMustKnow),
  );
  out.sections.general.subordination = capitalizeListItems(out.sections.general.subordination);
  out.sections.duties.items = capitalizeListItems(
    coerceInstructionListItems(out.sections.duties.items, SCHEMA_LIST_FALLBACKS.duties),
  );
  out.sections.rights.items = capitalizeListItems(
    coerceInstructionListItems(out.sections.rights.items, SCHEMA_LIST_FALLBACKS.rights),
  );
  const respItems = coerceInstructionListItems(
    out.sections.responsibility.items,
    RESPONSIBILITY_FALLBACK_ITEMS[0],
  );
  const respMin = Math.max(14, respItems.length);
  out.sections.responsibility.items = capitalizeListItems(ensureResponsibilityItems(respItems, respMin));
  out.templateMeta.approvedBy = coerceNonEmptyScalar(out.templateMeta.approvedBy, SCHEMA_SCALAR_FALLBACKS.approvedBy);
  out.templateMeta.positionName = coerceNonEmptyScalar(
    out.templateMeta.positionName,
    SCHEMA_SCALAR_FALLBACKS.positionName,
  );
  out.templateMeta.departmentName = coerceNonEmptyScalar(
    out.templateMeta.departmentName,
    SCHEMA_SCALAR_FALLBACKS.departmentName,
  );
  out.signatures.coordinator = coerceNonEmptyScalar(out.signatures.coordinator, SCHEMA_SCALAR_FALLBACKS.coordinator);
  out.signatures.acknowledgementSlots = coerceAcknowledgementSlots(out.signatures.acknowledgementSlots);
  return out;
}

export type TripleTextQualityOptions = {
  skipLlmProofread?: boolean;
  resolvedApi?: ResolvedApiConfig;
};

/**
 * Тройная проверка текста инструкции:
 * 1) детерминированная нормализация поверхности строки;
 * 2) орфография (Яндекс.Спеллер);
 * 3) редакторский проход LLM (пунктуация/орфография без смены смысла), если доступен API-ключ.
 */
export async function applyTripleTextQuality(
  payload: InstructionPayload,
  options: TripleTextQualityOptions = {},
): Promise<InstructionPayload> {
  const skipLlm =
    Boolean(options.skipLlmProofread) ||
    String(process.env.DI_TEXT_QUALITY_FAST ?? "").trim() === "1";

  let current = applyTerminologyToPayload(structuredClone(payload));

  const flat0 = collectAllEditableStrings(current).map(sanitizeInstructionSurfaceText);
  current = scatterEditableStrings(current, flat0);

  const flat1 = await applyYandexSpellerBatch(collectAllEditableStrings(current).map(sanitizeInstructionSurfaceText));
  current = scatterEditableStrings(current, flat1);

  let afterSpeller = structuredClone(current);
  if (!skipLlm) {
    const resolved = options.resolvedApi;
    if (resolved?.openrouterApiKey?.trim()) {
      const proofed = await proofreadWithOpenRouter(current, resolved);
      if (proofed) current = proofed;
    }
  }

  current = reapplyInstructionTextGuards(current);
  const parsed = instructionSchema.safeParse(current);
  if (parsed.success) return parsed.data;

  afterSpeller = reapplyInstructionTextGuards(afterSpeller);
  const fallback = instructionSchema.safeParse(afterSpeller);
  return fallback.success ? fallback.data : payload;
}
