import { assertStrictStructure, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import { applyTripleTextQuality, proofreadSectionItems } from "@/lib/di-text-quality";
import {
  capitalizeListItems,
  ensureResponsibilityItems,
  FIXED_SUBORDINATION_LINES,
  isLeadershipRole,
  isResponsibilityNoiseLine,
  isTailNoteLine,
} from "@/lib/di-rules";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { fetchPerplexityFactsForSection } from "@/lib/perplexity";
import { DEEPSEEK_CHAT_URL, buildDeepseekBody, extractDeepseekText } from "@/lib/deepseek";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getLegalEntity } from "@/lib/legal-entities";

const MANDATORY_HIRING_TEXT =
  "Работник назначается на должность и освобождается от должности в установленном порядке действующим трудовым законодательством и приказом генерального директора организации";

const MANDATORY_LINEAR_DUTIES = [
  "Соблюдать правила трудового распорядка, установленного в компании;",
  "Выполнять иные поручения вышестоящего руководства;",
  "Вести учет выполненных работ в установленной форме в компании;",
  "Проходить обязательные медицинские осмотры по требованию работодателя;",
  "Соблюдать стандарты системы 5S;",
  "Изучать стандарты компании, участвовать в сдаче экзаменов по стандартам выполняемой работы, осуществлять практическое выполнение работ согласно стандартам, участвовать в процессе стандартизации;",
  "Своевременно информировать вышестоящего руководителя о нерабочих стандартах, принимать участие в разработке новых и актуализации уже существующих стандартов;",
];

const MANDATORY_LEADERSHIP_DUTIES = [
  "Соблюдать стандарты системы 5S;",
  "Участвовать в процессе стандартизации, контролировать соблюдение стандартов;",
  "Осуществлять проверку знаний сотрудников, согласно утвержденным стандартам и предписаниям;",
];

export type RegenerateSectionKey =
  | "requiredQualification"
  | "subordination"
  | "hiringProcedure"
  | "substitutionProcedure"
  | "regulatoryDocuments"
  | "localRegulations"
  | "employeeMustKnow"
  | "duties.items"
  | "rights.items"
  | "responsibility.items";

export const REGENERATE_SECTION_KEYS: RegenerateSectionKey[] = [
  "requiredQualification",
  "subordination",
  "hiringProcedure",
  "substitutionProcedure",
  "regulatoryDocuments",
  "localRegulations",
  "employeeMustKnow",
  "duties.items",
  "rights.items",
  "responsibility.items",
];

export class RegenerateSectionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readSectionItems(payload: InstructionPayload, section: RegenerateSectionKey): string[] {
  if (section === "duties.items") return payload.sections.duties.items;
  if (section === "rights.items") return payload.sections.rights.items;
  if (section === "responsibility.items") return payload.sections.responsibility.items;
  return payload.sections.general[section];
}

function writeSectionItems(payload: InstructionPayload, section: RegenerateSectionKey, items: string[]): void {
  if (section === "duties.items") payload.sections.duties.items = items;
  else if (section === "rights.items") payload.sections.rights.items = items;
  else if (section === "responsibility.items") payload.sections.responsibility.items = items;
  else payload.sections.general[section] = items;
}

function normalizeTerminology(text: string): string {
  return text
    .toString()
    .replace(/Начальник/g, "Руководитель")
    .replace(/начальник/g, "руководитель")
    .replace(/руководительу/gi, (w) => (w[0] === "Р" ? "Руководителю" : "руководителю"))
    .replace(/\bруководителю(\S)/g, "руководителю $1")
    .replace(/\bруководителя(\S)/g, "руководителя $1");
}

function normalizePayload(payload: InstructionPayload): InstructionPayload {
  const p: InstructionPayload = structuredClone(payload);
  p.templateMeta.positionName = normalizeTerminology(p.templateMeta.positionName);
  p.templateMeta.departmentName = normalizeTerminology(p.templateMeta.departmentName);
  p.templateMeta.approvedBy = normalizeTerminology(p.templateMeta.approvedBy);

  p.sections.general.requiredQualification = p.sections.general.requiredQualification.map(normalizeTerminology);
  p.sections.general.subordination = p.sections.general.subordination.map(normalizeTerminology);
  p.sections.general.hiringProcedure = p.sections.general.hiringProcedure.map(normalizeTerminology);
  p.sections.general.substitutionProcedure = p.sections.general.substitutionProcedure.map(normalizeTerminology);
  p.sections.general.regulatoryDocuments = p.sections.general.regulatoryDocuments.map(normalizeTerminology);
  p.sections.general.localRegulations = p.sections.general.localRegulations.map(normalizeTerminology);
  p.sections.general.employeeMustKnow = p.sections.general.employeeMustKnow.map(normalizeTerminology);

  p.sections.duties.items = p.sections.duties.items.map(normalizeTerminology);
  p.sections.rights.items = p.sections.rights.items.map(normalizeTerminology);
  p.sections.responsibility.items = p.sections.responsibility.items.map(normalizeTerminology);
  p.sections.general.requiredQualification = capitalizeListItems(p.sections.general.requiredQualification);
  p.sections.general.subordination = capitalizeListItems(p.sections.general.subordination);
  p.sections.general.hiringProcedure = capitalizeListItems(p.sections.general.hiringProcedure);
  p.sections.general.substitutionProcedure = capitalizeListItems(p.sections.general.substitutionProcedure);
  p.sections.general.regulatoryDocuments = capitalizeListItems(p.sections.general.regulatoryDocuments);
  p.sections.general.localRegulations = capitalizeListItems(p.sections.general.localRegulations);
  p.sections.general.employeeMustKnow = capitalizeListItems(p.sections.general.employeeMustKnow);
  p.sections.duties.items = capitalizeListItems(p.sections.duties.items);
  p.sections.rights.items = capitalizeListItems(p.sections.rights.items);
  p.sections.responsibility.items = capitalizeListItems(p.sections.responsibility.items);

  p.signatures.coordinator = normalizeTerminology(p.signatures.coordinator);
  return p;
}

async function openrouterGenerateItems(opts: {
  model: string;
  apiKey: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<string[]> {
  const { model, apiKey, prompt, timeoutMs = 60_000 } = opts;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: buildDeepseekBody({ model, prompt, temperature: 0.2, maxTokens: 4096 }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new RegenerateSectionError(
        502,
        `Не удалось получить ответ от модели (${resp.status})${body ? `: ${body.slice(0, 120)}` : ""}`,
      );
    }

    const data = await resp.json();
    const content = extractDeepseekText(data);
    const jsonText = String(content).replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonText) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items.map((x) => String(x)) : [];
    return items.map((s) => s.trim()).filter((s) => s.length >= 2);
  } catch (error) {
    if (error instanceof RegenerateSectionError) throw error;
    throw new RegenerateSectionError(502, "Не удалось разобрать ответ модели. Повторите попытку.");
  } finally {
    clearTimeout(t);
  }
}

function padOrTrim(items: string[], desiredCount: number, fallbackPool: string[], fallbackDefault?: string): string[] {
  const dedup: string[] = [];
  for (const it of items) {
    if (!it) continue;
    if (!dedup.includes(it)) dedup.push(it);
  }

  if (dedup.length >= desiredCount) return dedup.slice(0, desiredCount);

  for (const it of fallbackPool) {
    if (dedup.length >= desiredCount) break;
    if (!dedup.includes(it)) dedup.push(it);
  }

  while (dedup.length < desiredCount) {
    if (fallbackDefault) dedup.push(fallbackDefault);
    else dedup.push(`Пункт ${dedup.length + 1}`);
  }

  return dedup;
}

export async function regenerateInstructionSection(opts: {
  id: string;
  section: RegenerateSectionKey;
  templateJson?: unknown;
  userId: string;
  userRole: string;
  ip: string;
}): Promise<InstructionPayload> {
  const { id, section, templateJson, userId, userRole, ip } = opts;

  const row = await prisma.instructionVersion.findUnique({
    where: { id },
    include: {
      generationRun: { select: { userId: true, jobTitleInput: true } },
      jobTitle: { select: { name: true } },
    },
  });

  if (!row) throw new RegenerateSectionError(404, "Документ не найден");

  const isAdmin = userRole === "admin";
  const isOwner = row.generationRun?.userId === userId;
  if (!isAdmin && !isOwner) throw new RegenerateSectionError(403, "Нет доступа к документу");

  if (!REGENERATE_SECTION_KEYS.includes(section)) {
    throw new RegenerateSectionError(400, "Неизвестный раздел");
  }

  const ok = checkRateLimit(`regen:${id}:${section}:${ip}`, 6, 60_000);
  if (!ok) throw new RegenerateSectionError(429, "Слишком много запросов. Подождите минуту.");

  const apiConfig = await getResolvedApiConfig();
  const apiKey = apiConfig.openrouterApiKey.trim();
  const model = apiConfig.openrouterModel;
  if (!apiKey) {
    throw new RegenerateSectionError(
      500,
      "Не задан API-ключ DeepSeek. Укажите его в разделе «Настройки API».",
    );
  }

  let payload: InstructionPayload;
  try {
    const base = templateJson ?? row.templateJson;
    payload = instructionSchema.parse(base);
    assertStrictStructure(payload);
  } catch {
    throw new RegenerateSectionError(400, "Некорректная структура документа");
  }

  payload.sections.general.subordination = FIXED_SUBORDINATION_LINES;
  if (section === "subordination") return payload;

  const isLeadership = isLeadershipRole(payload.templateMeta.positionName);

  const current =
    section === "requiredQualification"
      ? payload.sections.general.requiredQualification
      : section === "hiringProcedure"
        ? payload.sections.general.hiringProcedure
        : section === "substitutionProcedure"
          ? payload.sections.general.substitutionProcedure
          : section === "regulatoryDocuments"
            ? payload.sections.general.regulatoryDocuments
            : section === "localRegulations"
              ? payload.sections.general.localRegulations
              : section === "employeeMustKnow"
                ? payload.sections.general.employeeMustKnow
                : section === "duties.items"
                  ? payload.sections.duties.items
                  : section === "rights.items"
                    ? payload.sections.rights.items
                    : payload.sections.responsibility.items;

  const minBySection: Record<RegenerateSectionKey, number> = {
    requiredQualification: 4,
    subordination: 2,
    hiringProcedure: 1,
    substitutionProcedure: 1,
    regulatoryDocuments: 8,
    localRegulations: 6,
    employeeMustKnow: 14,
    "duties.items": 32,
    "rights.items": 22,
    "responsibility.items": 25,
  };

  const desiredCount = Math.max(1, current.length, minBySection[section] ?? 1);
  const itemsAsText = current.map((x, i) => `${i + 1}. ${x}`).join("\n");
  const sectionHuman =
    section === "requiredQualification"
      ? "Требуемая квалификация и стаж работы по данной должности"
      : section === "hiringProcedure"
        ? "Прием на работу"
        : section === "substitutionProcedure"
          ? "Замещение на время отсутствия"
          : section === "regulatoryDocuments"
            ? "Нормативные документы, которыми руководствуется в своей деятельности"
            : section === "localRegulations"
              ? "Локально-нормативные акты"
              : section === "employeeMustKnow"
                ? "Работник должен знать"
                : section === "duties.items"
                  ? "Работник обязан"
                  : section === "rights.items"
                    ? "Работник имеет право"
                    : "Работник несет ответственность за";

  let currentFactsText = "";
  const legalEntity = getLegalEntity(payload.templateMeta.legalEntityId);
  try {
    const facts = await fetchPerplexityFactsForSection(
      {
        jobTitle: payload.templateMeta.positionName,
        department: payload.templateMeta.departmentName,
        companyLabel: legalEntity.label,
        companyContext: legalEntity.companyContext,
        sectionHuman,
        desiredCount,
      },
      apiConfig,
    );
    currentFactsText = facts.snippets.join("\n").slice(0, 6000);
  } catch (e) {
    console.warn("Section facts fetch failed", e);
  }

  const mandatoryRules = [
    "Верни ТОЛЬКО JSON без пояснений.",
    `В массиве items должно быть ровно ${desiredCount} строк.`,
    "Каждый пункт пиши как самостоятельную законченную фразу, без нумерации и без маркеров.",
  ];

  if (section === "hiringProcedure") {
    mandatoryRules.push(`Прием на работу всегда должен быть ровно: ${MANDATORY_HIRING_TEXT}`);
  }

  if (section === "duties.items") {
    mandatoryRules.push(
      isLeadership
        ? `Обязательные пункты для руководителя: ${MANDATORY_LEADERSHIP_DUTIES.join(" | ")}`
        : `Обязательные пункты для линейного сотрудника: ${MANDATORY_LINEAR_DUTIES.join(" | ")}`,
    );
  }

  const prompt = `Перегенерируй пункты для секции "${sectionHuman}".
Данные из поиска (справка):
${currentFactsText || "—"}

Текущие пункты (как стиль/формулировки):
${itemsAsText}

Должность: ${payload.templateMeta.positionName}
Подразделение: ${payload.templateMeta.departmentName}
Юридическое лицо: ${legalEntity.label}
Контекст организации: ${legalEntity.companyContext}
Учитывай профиль юридического лица и подразделения.

${mandatoryRules.join("\n")}

Ответ:
{
  "items": ["...", "..."]
}`;

  const regenItems = await openrouterGenerateItems({ apiKey, model, prompt });
  const padded = padOrTrim(
    regenItems,
    desiredCount,
    current,
    section === "hiringProcedure" ? MANDATORY_HIRING_TEXT : undefined,
  );

  if (section === "requiredQualification") payload.sections.general.requiredQualification = padded;
  if (section === "hiringProcedure") payload.sections.general.hiringProcedure = [MANDATORY_HIRING_TEXT];
  if (section === "substitutionProcedure") payload.sections.general.substitutionProcedure = padded;
  if (section === "regulatoryDocuments") payload.sections.general.regulatoryDocuments = padded;
  if (section === "localRegulations") payload.sections.general.localRegulations = padded;
  if (section === "employeeMustKnow") payload.sections.general.employeeMustKnow = padded;
  if (section === "duties.items") payload.sections.duties.items = padded;
  if (section === "rights.items") payload.sections.rights.items = padded;
  if (section === "responsibility.items") payload.sections.responsibility.items = padded;

  payload.sections.general.hiringProcedure = [MANDATORY_HIRING_TEXT];
  payload.sections.general.subordination = FIXED_SUBORDINATION_LINES;

  if (section === "duties.items") {
    const mandatory = isLeadership ? MANDATORY_LEADERSHIP_DUTIES : MANDATORY_LINEAR_DUTIES;
    const withoutDupes = payload.sections.duties.items.filter((x, i, arr) => arr.indexOf(x) === i);
    const merged = Array.from(new Set([...mandatory, ...withoutDupes]));
    const targetCount = Math.max(desiredCount, mandatory.length);
    payload.sections.duties.items = padOrTrim(
      merged,
      targetCount,
      current,
      "Выполнять должностные обязанности согласно утвержденным ЛНА",
    );
  }

  if (section === "responsibility.items") {
    const filtered = payload.sections.responsibility.items
      .filter((l) => !isTailNoteLine(l))
      .filter((l) => !isResponsibilityNoiseLine(l));

    payload.sections.responsibility.items =
      filtered.length === 0
        ? ensureResponsibilityItems([], desiredCount)
        : ensureResponsibilityItems(filtered, desiredCount);
  }

  payload = normalizePayload(payload);
  payload = await applyTripleTextQuality(payload, { skipLlmProofread: true });

  if (section !== "hiringProcedure") {
    const currentItems = readSectionItems(payload, section);
    const proofed = await proofreadSectionItems(currentItems, apiConfig);
    if (proofed) writeSectionItems(payload, section, proofed);
  }

  assertStrictStructure(payload);
  instructionSchema.parse(payload);
  return payload;
}
