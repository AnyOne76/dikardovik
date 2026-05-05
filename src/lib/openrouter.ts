import { loadEnvConfig } from "@next/env";
import { getResolvedApiConfig, type ResolvedApiConfig } from "@/lib/api-settings";
import { fixedHeaders, type InstructionPayload } from "@/lib/di-contract";
import { applyTripleTextQuality } from "@/lib/di-text-quality";
import {
  capitalizeListItems,
  ensureResponsibilityItems,
  FIXED_SUBORDINATION_LINES,
  isLeadershipRole,
  isResponsibilityRelevantLine,
} from "@/lib/di-rules";

loadEnvConfig(process.cwd());

type GenerationInput = {
  jobTitle: string;
  department: string;
  facts: string[];
  relatedContext: string[];
};

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

function cleanGeneratedText(value: string): string {
  // Keep Russian/Latin letters, digits and common punctuation; drop random CJK and other noise.
  const stripped = value
    .replace(/[^\p{Script=Cyrillic}\p{Script=Latin}\d\s.,;:!?()\-/"'№%]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped
    .replace(/\bифргафические\b/gi, "орфографические")
    .replace(/\bне рабочих\b/gi, "нерабочих")
    .replace(/\bпримичание\b/gi, "ПРИМЕЧАНИЕ")
    .replace(/\bруководителюцеха\b/gi, "руководителю цеха")
    .replace(/\bруководителяцеха\b/gi, "руководителя цеха")
    .replace(/\s+([,.;:!?])/g, "$1");
}

function fallbackPayload(input: GenerationInput): InstructionPayload {
  const generalItems = input.facts.slice(0, 5);
  const dutiesItems = input.facts.slice(5, 15);

  return {
    templateMeta: {
      approvedBy: "Генеральный директор __________________",
      positionName: input.jobTitle,
      departmentName: input.department,
    },
    sections: {
      general: {
        heading: fixedHeaders.sec1,
        requiredQualification:
          generalItems.length > 0
            ? generalItems
            : ["Квалификационные требования определяются работодателем."],
        subordination: FIXED_SUBORDINATION_LINES,
        hiringProcedure: [MANDATORY_HIRING_TEXT],
        substitutionProcedure: ["На время отсутствия обязанности исполняет назначенное лицо."],
        regulatoryDocuments: ["Руководствуется ТК РФ, отраслевыми нормами и внутренними регламентами."],
        localRegulations: ["Положение о подразделении, приказы, инструкции работодателя."],
        employeeMustKnow: ["Профильные стандарты, требования охраны труда, порядок документооборота."],
      },
      duties: {
        heading: fixedHeaders.sec2,
        items:
          dutiesItems.length > 0
            ? dutiesItems
            : ["Выполнять должностные обязанности согласно утвержденным ЛНА."],
      },
      rights: {
        heading: fixedHeaders.sec3,
        items: ["Требовать необходимые ресурсы для выполнения работы."],
      },
      responsibility: {
        heading: fixedHeaders.sec4,
        items: ["Нести ответственность за качество и сроки выполнения задач."],
      },
    },
    signatures: {
      coordinator: "Согласовано: __________________",
      acknowledgementSlots: 8,
    },
  };
}

function buildPool(input: GenerationInput): string[] {
  const fromFacts = input.facts.map((s) => cleanGeneratedText(s)).filter(Boolean);
  const fromRelated = input.relatedContext
    .flatMap((block) => block.split(/[.;\n]/g))
    .map((s) => cleanGeneratedText(s))
    .filter((s) => s.length > 10);
  return [...fromFacts, ...fromRelated].filter((s, i, arr) => arr.indexOf(s) === i);
}

function padList(
  items: string[],
  minCount: number,
  pool: string[],
  defaultText: string,
): string[] {
  const normalized = items.map((s) => cleanGeneratedText(s)).filter(Boolean);
  const dedup = normalized.filter((s, i, arr) => arr.indexOf(s) === i);
  for (const candidate of pool) {
    if (dedup.length >= minCount) break;
    if (!dedup.includes(candidate)) dedup.push(candidate);
  }
  while (dedup.length < minCount) {
    dedup.push(`${defaultText} (${dedup.length + 1})`);
  }
  return dedup;
}

function normalizeTerminology(text: string): string {
  return cleanGeneratedText(text)
    .replace(/Начальник/g, "Руководитель")
    .replace(/начальник/g, "руководитель")
    // `\b` is ASCII-only in JS; Cyrillic words need a plain global replace.
    .replace(/руководительу/gi, (w) => (w[0] === "Р" ? "Руководителю" : "руководителю"))
    .replace(/\bруководителю(\S)/g, "руководителю $1")
    .replace(/\bруководителя(\S)/g, "руководителя $1");
}

function applyTerminologyRules(payload: InstructionPayload): InstructionPayload {
  const p = structuredClone(payload);
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
  return p;
}

function ensureSectionItems(payload: InstructionPayload, input: GenerationInput): InstructionPayload {
  const fallback = fallbackPayload({
    jobTitle: payload?.templateMeta?.positionName ?? input.jobTitle,
    department: payload?.templateMeta?.departmentName ?? input.department,
    facts: input.facts,
    relatedContext: input.relatedContext,
  });
  const safe = structuredClone(payload ?? fallback) as InstructionPayload;
  const pool = buildPool(input);

  if (!safe.templateMeta) safe.templateMeta = fallback.templateMeta;
  if (!safe.sections) safe.sections = fallback.sections;
  if (!safe.sections.general) safe.sections.general = fallback.sections.general;
  if (!safe.sections.duties) safe.sections.duties = fallback.sections.duties;
  if (!safe.sections.rights) safe.sections.rights = fallback.sections.rights;
  if (!safe.sections.responsibility) {
    safe.sections.responsibility = fallback.sections.responsibility;
  }
  if (!safe.signatures) safe.signatures = fallback.signatures;
  if (!safe.sections.general.heading) safe.sections.general.heading = fixedHeaders.sec1;
  if (!safe.sections.duties.heading) safe.sections.duties.heading = fixedHeaders.sec2;
  if (!safe.sections.rights.heading) safe.sections.rights.heading = fixedHeaders.sec3;
  if (!safe.sections.responsibility.heading) {
    safe.sections.responsibility.heading = fixedHeaders.sec4;
  }
  if (!Array.isArray(safe.sections.general.requiredQualification)) {
    safe.sections.general.requiredQualification = [];
  }
  if (!Array.isArray(safe.sections.general.subordination)) safe.sections.general.subordination = [];
  if (!Array.isArray(safe.sections.general.hiringProcedure)) safe.sections.general.hiringProcedure = [];
  if (!Array.isArray(safe.sections.general.substitutionProcedure)) {
    safe.sections.general.substitutionProcedure = [];
  }
  if (!Array.isArray(safe.sections.general.regulatoryDocuments)) {
    safe.sections.general.regulatoryDocuments = [];
  }
  if (!Array.isArray(safe.sections.general.localRegulations)) safe.sections.general.localRegulations = [];
  if (!Array.isArray(safe.sections.general.employeeMustKnow)) safe.sections.general.employeeMustKnow = [];
  if (!Array.isArray(safe.sections.duties.items)) safe.sections.duties.items = [];
  if (!Array.isArray(safe.sections.rights.items)) safe.sections.rights.items = [];
  if (!Array.isArray(safe.sections.responsibility.items)) {
    safe.sections.responsibility.items = [];
  }

  safe.sections.general.requiredQualification = padList(
    safe.sections.general.requiredQualification,
    4,
    pool,
    "Квалификационные требования определяются работодателем",
  );
  // Безусловное бизнес-правило: "Подчиненность" всегда фиксирована и не зависит от должности.
  safe.sections.general.subordination = FIXED_SUBORDINATION_LINES;
  safe.sections.general.hiringProcedure = padList(
    safe.sections.general.hiringProcedure,
    1,
    pool,
    MANDATORY_HIRING_TEXT,
  );
  // Безусловное бизнес-правило: формулировка "Прием на работу" фиксирована для всех должностей.
  safe.sections.general.hiringProcedure = [MANDATORY_HIRING_TEXT];
  safe.sections.general.substitutionProcedure = padList(
    safe.sections.general.substitutionProcedure,
    1,
    pool,
    "На время отсутствия обязанности исполняет назначенное лицо",
  );
  safe.sections.general.regulatoryDocuments = padList(
    safe.sections.general.regulatoryDocuments,
    8,
    pool,
    "Руководствуется ТК РФ, ГОСТ, СП и иными регламентами",
  );
  safe.sections.general.localRegulations = padList(
    safe.sections.general.localRegulations,
    6,
    pool,
    "Исполняет внутренние локально-нормативные акты компании",
  );
  safe.sections.general.employeeMustKnow = padList(
    safe.sections.general.employeeMustKnow,
    14,
    pool,
    "Должен знать технологию работ, требования охраны труда и пожарной безопасности",
  );
  safe.sections.duties.items = padList(
    safe.sections.duties.items,
    32,
    pool,
    "Выполнять должностные обязанности согласно утвержденным ЛНА",
  );
  safe.sections.rights.items = padList(
    safe.sections.rights.items,
    22,
    pool,
    "Иметь право на условия и ресурсы, необходимые для безопасной работы",
  );
  safe.sections.responsibility.items = safe.sections.responsibility.items
    .filter((line) => isResponsibilityRelevantLine(line))
    .map((line) => cleanGeneratedText(line))
    .filter(Boolean);
  safe.sections.responsibility.items = ensureResponsibilityItems(safe.sections.responsibility.items, 14);

  // Бизнес-правило: для руководящих должностей всегда включаем 5S/стандартизацию.
  if (isLeadershipRole(input.jobTitle)) {
    const mandatoryLeadershipLines = [
      "Соблюдать стандарты системы 5S;",
      "Участвовать в процессе стандартизации, контролировать соблюдение стандартов;",
      "Осуществлять проверку знаний сотрудников, согласно утвержденным стандартам и предписаниям;",
    ];
    for (const line of mandatoryLeadershipLines) {
      if (!safe.sections.duties.items.includes(line)) {
        safe.sections.duties.items.push(line);
      }
    }
  }
  // Безусловное бизнес-правило: для линейных должностей фиксированный набор обязательных обязанностей.
  if (!isLeadershipRole(input.jobTitle)) {
    for (const line of MANDATORY_LINEAR_DUTIES) {
      if (!safe.sections.duties.items.includes(line)) {
        safe.sections.duties.items.push(line);
      }
    }
  }

  return applyTerminologyRules(safe);
}

export async function generateInstructionPayload(
  input: GenerationInput,
  resolved?: ResolvedApiConfig,
): Promise<{ payload: InstructionPayload; model: string; }> {
  const { openrouterApiKey: apiKeyRaw, openrouterModel: model } =
    resolved ?? (await getResolvedApiConfig());
  const apiKey = apiKeyRaw?.trim() || undefined;
  if (!apiKey) {
    const local = ensureSectionItems(fallbackPayload(input), input);
    const refined = await applyTripleTextQuality(local, {
      resolvedApi: resolved ?? (await getResolvedApiConfig()),
      skipLlmProofread: true,
    });
    return { payload: refined, model };
  }

  const prompt = `Сформируй JSON строго по схеме должностной инструкции с неизменными заголовками секций.
Обязательная структура JSON:
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
Должность: ${input.jobTitle}
Подразделение: ${input.department}
Факты: ${input.facts.join("; ")}
Связанный контекст: ${input.relatedContext.join("; ")}
Верни ТОЛЬКО JSON без пояснений.
Добавь не менее:
- requiredQualification: 4
- subordination: 2
- hiringProcedure: 1
- substitutionProcedure: 1
- regulatoryDocuments: 8
- localRegulations: 6
- employeeMustKnow: 14
- duties.items: 32
- rights.items: 22
- responsibility.items: 14`;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
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
    // Сетевые ошибки/таймауты OpenRouter не должны ломать генерацию DI.
    console.warn("OpenRouter request failed, fallback to local generation", e);
    const fb = ensureSectionItems(fallbackPayload(input), input);
    const refinedFb = await applyTripleTextQuality(fb, {
      resolvedApi: resolved ?? (await getResolvedApiConfig()),
      skipLlmProofread: true,
    });
    return { payload: refinedFb, model };
  }

  if (!response.ok) {
    console.warn("OpenRouter API error, fallback to local generation", response.status);
    const fb = ensureSectionItems(fallbackPayload(input), input);
    const refinedFb = await applyTripleTextQuality(fb, { resolvedApi: resolved ?? (await getResolvedApiConfig()) });
    return { payload: refinedFb, model };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const jsonText = content.replace(/^```json|```$/g, "").trim();
  let payload: InstructionPayload;
  try {
    payload = JSON.parse(jsonText) as InstructionPayload;
  } catch {
    const fb = ensureSectionItems(fallbackPayload(input), input);
    const refinedFb = await applyTripleTextQuality(fb, { resolvedApi: resolved ?? (await getResolvedApiConfig()) });
    return { payload: refinedFb, model };
  }
  const ensured = ensureSectionItems(payload, input);
  const refined = await applyTripleTextQuality(ensured, { resolvedApi: resolved ?? (await getResolvedApiConfig()) });
  return { payload: refined, model };
}
