import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertStrictStructure, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import { applyTripleTextQuality } from "@/lib/di-text-quality";
import {
  capitalizeListItems,
  ensureResponsibilityItems,
  FIXED_SUBORDINATION_LINES,
  isLeadershipRole,
  isResponsibilityNoiseLine,
  isTailNoteLine,
} from "@/lib/di-rules";
import { loadEnvConfig } from "@next/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { fetchPerplexityFactsForSection } from "@/lib/perplexity";

loadEnvConfig(process.cwd());

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

type SectionKey =
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

function normalizeTerminology(text: string): string {
  // Keep it consistent with openrouter.ts terminology normalization.
  return text
    .toString()
    .replace(/Начальник/g, "Руководитель")
    .replace(/начальник/g, "руководитель")
    // `\b` is ASCII-only in JS; Cyrillic words need a plain global replace.
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
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) throw new Error(`OpenRouter API error ${resp.status}`);

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const jsonText = String(content).replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonText) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items.map((x) => String(x)) : [];
    return items.map((s) => s.trim()).filter((s) => s.length >= 2);
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

  // Prefer keeping original text diversity first.
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

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const row = await prisma.instructionVersion.findUnique({
    where: { id },
    include: {
      generationRun: { select: { userId: true, jobTitleInput: true } },
      jobTitle: { select: { name: true } },
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  const isOwner = row.generationRun?.userId === session.user.id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({} as { section?: unknown; templateJson?: unknown }));
  const section = String(body?.section || "").trim() as SectionKey;
  const clientTemplateJson = body?.templateJson;

  const allowed: SectionKey[] = [
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
  if (!allowed.includes(section)) return NextResponse.json({ error: "Invalid section" }, { status: 400 });

  const ip = getClientIp(request);
  const ok = checkRateLimit(`regen:${id}:${section}:${ip}`, 6, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many regenerate requests" }, { status: 429 });
  }

  const apiConfig = await getResolvedApiConfig();
  const apiKey = apiConfig.openrouterApiKey.trim();
  const model = apiConfig.openrouterModel;
  if (!apiKey) return NextResponse.json({ error: "OpenRouter API key missing" }, { status: 500 });

  let payload: InstructionPayload;
  try {
    const base = clientTemplateJson ?? row.templateJson;
    payload = instructionSchema.parse(base);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid templateJson" }, { status: 400 });
  }

  payload.sections.general.subordination = FIXED_SUBORDINATION_LINES;
  if (section === "subordination") {
    return NextResponse.json({ templateJson: payload });
  }

  const jobTitle = payload.templateMeta.positionName;
  const isLeadership = isLeadershipRole(jobTitle);

  // Desired count = current count, so UI length remains stable.
  const current =
    section === "requiredQualification"
      ? payload.sections.general.requiredQualification
      : section === "subordination"
        ? payload.sections.general.subordination
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

  // Keep UI stable, but never go below mandatory minimums from the generation prompt.
  const minBySection: Record<SectionKey, number> = {
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
      : section === "subordination"
        ? "Подчиненность (только кому подчиняется)"
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
  try {
    const facts = await fetchPerplexityFactsForSection(
      {
        jobTitle: payload.templateMeta.positionName,
        department: payload.templateMeta.departmentName,
        sectionHuman,
        desiredCount,
      },
      apiConfig,
    );
    currentFactsText = facts.snippets.join("\n").slice(0, 6000);
  } catch (e) {
    // Search must not block editing; fallback to generation from existing wording.
    console.warn("Section facts fetch failed", e);
    currentFactsText = "";
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

  // Apply section update
  if (section === "requiredQualification") payload.sections.general.requiredQualification = padded;
  if (section === "subordination") payload.sections.general.subordination = padded;
  if (section === "hiringProcedure") payload.sections.general.hiringProcedure = [MANDATORY_HIRING_TEXT];
  if (section === "substitutionProcedure") payload.sections.general.substitutionProcedure = padded;
  if (section === "regulatoryDocuments") payload.sections.general.regulatoryDocuments = padded;
  if (section === "localRegulations") payload.sections.general.localRegulations = padded;
  if (section === "employeeMustKnow") payload.sections.general.employeeMustKnow = padded;
  if (section === "duties.items") payload.sections.duties.items = padded;
  if (section === "rights.items") payload.sections.rights.items = padded;
  if (section === "responsibility.items") payload.sections.responsibility.items = padded;

  // Always enforce fixed rules that must never break.
  payload.sections.general.hiringProcedure = [MANDATORY_HIRING_TEXT];

  payload.sections.general.subordination = FIXED_SUBORDINATION_LINES;

  if (section === "duties.items") {
    const mandatory = isLeadership ? MANDATORY_LEADERSHIP_DUTIES : MANDATORY_LINEAR_DUTIES;
    const withoutDupes = payload.sections.duties.items.filter((x, i, arr) => arr.indexOf(x) === i);

    // Keep mandatory at the beginning; rest stays.
    const merged = Array.from(new Set([...mandatory, ...withoutDupes]));
    const targetCount = Math.max(desiredCount, mandatory.length);
    payload.sections.duties.items = padOrTrim(merged, targetCount, current, "Выполнять должностные обязанности согласно утвержденным ЛНА");
  }

  if (section === "responsibility.items") {
    const filtered = payload.sections.responsibility.items
      .filter((l) => !isTailNoteLine(l))
      .filter((l) => !isResponsibilityNoiseLine(l));

    if (filtered.length === 0) {
      payload.sections.responsibility.items = ensureResponsibilityItems([], desiredCount);
    } else {
      // Сохраняем стабильную длину списка в UI, но заполняем только "чистым" контентом.
      payload.sections.responsibility.items = ensureResponsibilityItems(filtered, desiredCount);
    }
  }

  payload = normalizePayload(payload);
  payload = await applyTripleTextQuality(payload, { resolvedApi: apiConfig });
  assertStrictStructure(payload);
  instructionSchema.parse(payload); // re-check full schema

  return NextResponse.json({ templateJson: payload });
}

