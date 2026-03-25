import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertStrictStructure, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import { isDirectorRole, isLeadershipRole, isTailNoteLine } from "@/lib/di-rules";
import { loadEnvConfig } from "@next/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";
import { fetchPerplexityFactsForSection } from "@/lib/perplexity";

loadEnvConfig(process.cwd());

const MANDATORY_HIRING_TEXT =
  "Работник назначается на должность и освобождается от должности в установленном порядке действующим трудовым законодательством и приказом генерального директора организации";
const MANDATORY_DIRECTOR_SUBORDINATION_TEXT = "Генеральному директору";

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

  p.signatures.coordinator = normalizeTerminology(p.signatures.coordinator);
  return p;
}

function cleanSubordinationForEdit(input: string[]): string[] {
  const removalPatterns: RegExp[] = [
    /на\s*время\s*отсутствия/i,
    /функц(ии|ия)\s*на\s*время\s*отсутствия/i,
    /исполняет\s+назначенн(о(е|ый)|ая|ый|ую|ого|ых)\s+лиц(о|а)/i,
    /в\s*прямом\s*подчинени[еи]\s*находится/i,
    /в\s*подчинении\s*находится/i,
    /в\s*его\s*подчинении/i,
    /ему\s*подчиня(ют|ются|ется)/i,
    /ему\s*подчинен(у|а|ы)/i,
  ];

  const cleaned = (input ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .filter((line) => !removalPatterns.some((re) => re.test(line)));

  if (cleaned.length === 0) return ["Подчиняется непосредственному руководителю подразделения"];
  return [cleaned[0]];
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

  const body = await request.json().catch(() => ({} as { section?: unknown }));
  const section = String(body?.section || "").trim() as SectionKey;

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

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if (!apiKey) return NextResponse.json({ error: "OpenRouter API key missing" }, { status: 500 });

  const rawPayload = row.templateJson;
  let payload: InstructionPayload;
  try {
    payload = instructionSchema.parse(rawPayload);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid templateJson" }, { status: 400 });
  }

  const jobTitle = payload.templateMeta.positionName;
  const isDirector = isDirectorRole(jobTitle);
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

  const desiredCount = Math.max(1, current.length);

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
    const facts = await fetchPerplexityFactsForSection({
      jobTitle: payload.templateMeta.positionName,
      department: payload.templateMeta.departmentName,
      sectionHuman,
      desiredCount,
    });
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

  if (section === "subordination") {
    mandatoryRules.push(
      isDirector
        ? `Подчиненность для директора всегда: "${MANDATORY_DIRECTOR_SUBORDINATION_TEXT}"`
        : 'Подчиненность должна содержать только "кому подчиняется" (без "на время отсутствия" и без фраз типа "ему подчиняются").',
    );
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

  if (section === "subordination") {
    if (isDirector) payload.sections.general.subordination = [MANDATORY_DIRECTOR_SUBORDINATION_TEXT];
    else payload.sections.general.subordination = cleanSubordinationForEdit(payload.sections.general.subordination);
  }

  if (section === "duties.items") {
    const mandatory = isLeadership ? MANDATORY_LEADERSHIP_DUTIES : MANDATORY_LINEAR_DUTIES;
    const withoutDupes = payload.sections.duties.items.filter((x, i, arr) => arr.indexOf(x) === i);

    // Keep mandatory at the beginning; rest stays.
    const merged = Array.from(new Set([...mandatory, ...withoutDupes]));
    const targetCount = Math.max(desiredCount, mandatory.length);
    payload.sections.duties.items = padOrTrim(merged, targetCount, current, "Выполнять должностные обязанности согласно утвержденным ЛНА");
  }

  if (section === "responsibility.items") {
    payload.sections.responsibility.items = payload.sections.responsibility.items.filter((l) => !isTailNoteLine(l));
    if (payload.sections.responsibility.items.length === 0) {
      payload.sections.responsibility.items = [current[0] || "Нести ответственность за качество и сроки выполнения задач"];
    }
  }

  payload = normalizePayload(payload);
  assertStrictStructure(payload);
  instructionSchema.parse(payload); // re-check full schema

  return NextResponse.json({ templateJson: payload });
}

