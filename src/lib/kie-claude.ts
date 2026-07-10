/** Прокси Anthropic Messages API через KIE (https://kie.ai) — используется вместо OpenRouter. */
export const KIE_CLAUDE_URL = "https://api.kie.ai/claude/v1/messages";

export function buildKieClaudeBody(params: {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): string {
  const { model, prompt, temperature, maxTokens = 8192 } = params;
  return JSON.stringify({
    model,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    messages: [{ role: "user", content: prompt }],
  });
}

/** Anthropic Messages API отдаёт текст в content[0].text (не choices[0].message.content, как у OpenAI). */
export function extractClaudeText(data: unknown): string {
  const content = (data as { content?: { text?: string }[] } | undefined)?.content;
  return content?.[0]?.text ?? "";
}
