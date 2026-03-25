import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type PerplexityResult = {
  snippets: string[];
  model: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLines(content: string): string[] {
  return content
    .split("\n")
    .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((s) => s.length > 3);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.;!?]\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

async function fetchAssistentusFacts(jobTitle: string): Promise<string[]> {
  const query = encodeURIComponent(`должностная инструкция ${jobTitle}`);
  const searchUrl = `https://assistentus.ru/?s=${query}`;
  const commonHeaders = {
    "User-Agent": "Mozilla/5.0 KadrovikBot/1.0",
    Accept: "text/html,application/xhtml+xml",
  };

  const searchResp = await fetch(searchUrl, {
    headers: commonHeaders,
    signal: AbortSignal.timeout(12000),
  });
  if (!searchResp.ok) return [];
  const searchHtml = await searchResp.text();

  const links = Array.from(
    searchHtml.matchAll(/https:\/\/assistentus\.ru\/forma\/dolzhnostnaya-instrukciya-[^"'<> ]+/g),
  )
    .map((m) => m[0])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);

  if (!links.length) return [];

  const pages = await Promise.all(
    links.map(async (url) => {
      try {
        const r = await fetch(url, {
          headers: commonHeaders,
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) return "";
        return await r.text();
      } catch {
        return "";
      }
    }),
  );

  const extracted = pages.flatMap((html) => {
    if (!html) return [];
    const mainMatch =
      html.match(/<article[\s\S]*?<\/article>/i) ??
      html.match(/<main[\s\S]*?<\/main>/i) ??
      html.match(/<body[\s\S]*?<\/body>/i);
    const plain = stripHtml(mainMatch?.[0] ?? html);
    return splitSentences(plain);
  });

  return extracted
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 60);
}

async function queryPerplexity(apiKey: string, model: string, prompt: string): Promise<string[]> {
  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Perplexity API error ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return normalizeLines(content);
}

export async function fetchPerplexityFacts(jobTitle: string): Promise<PerplexityResult> {
  const apiKey = (process.env.PERPLEXITY_API_KEY ?? "").trim();
  const model = process.env.PERPLEXITY_MODEL || "sonar-pro";
  const assistentusLines = await fetchAssistentusFacts(jobTitle).catch(() => []);
  const targetCount = 90;
  const minAssistentusOnly = 40;

  const base = assistentusLines
    .filter((s, idx, arr) => arr.indexOf(s) === idx)
    .slice(0, targetCount);

  // Используем Perplexity только для добора недостающих пунктов.
  let snippets = base;
  if (snippets.length < targetCount && apiKey) {
    const [generalLines, functionalLines] = await Promise.all([
      queryPerplexity(
        apiKey,
        model,
        [
          `Собери данные для должности "${jobTitle}" в РФ.`,
          "Нужны пункты для раздела 1. ОБЩИЕ ПОЛОЖЕНИЯ:",
          "- Требуемая квалификация и стаж",
          "- Подчиненность",
          "- Прием на работу",
          "- Замещение на время отсутствия",
          "- Нормативные документы",
          "- Локально-нормативные акты",
          "- Работник должен знать",
          "Верни МИНИМУМ 25 отдельных строк, без нумерации и без пояснений.",
        ].join("\n"),
      ),
      queryPerplexity(
        apiKey,
        model,
        [
          `Собери данные для должности "${jobTitle}" в РФ.`,
          "Нужны пункты для разделов:",
          "- 2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ (минимум 35 строк)",
          "- 3. ПРАВА (минимум 20 строк)",
          "- 4. ОТВЕТСТВЕННОСТЬ (минимум 25 строк)",
          "Верни только строки пунктов, без вводного текста и без нумерации.",
        ].join("\n"),
      ),
    ]);

    snippets = [...snippets, ...generalLines, ...functionalLines]
      .filter((s, idx, arr) => arr.indexOf(s) === idx)
      .slice(0, targetCount);
  }

  if (!snippets.length) {
    throw new Error("Не удалось получить данные ни с assistentus, ни через Perplexity.");
  }
  if (snippets.length < minAssistentusOnly && !apiKey) {
    throw new Error("Недостаточно данных с assistentus и отсутствует PERPLEXITY_API_KEY для добора.");
  }

  return { snippets, model };
}
