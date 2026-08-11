/**
 * OpenAI-совместимый Chat Completions API DeepSeek (https://api-docs.deepseek.com/).
 * Заменяет прежний прокси KIE (Anthropic Messages API) во всех местах генерации/анализа ДИ.
 * Ключ и модель по-прежнему берутся из настроек "OpenRouter" в БД/админке (поле переиспользуется).
 */
export const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";

export function buildDeepseekBody(params: {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** DeepSeek требует упоминания слова "JSON" в промпте, когда включён этот режим — во всех промптах DI оно есть. */
  jsonMode?: boolean;
}): string {
  const { model, prompt, temperature, maxTokens = 8192, jsonMode = true } = params;
  return JSON.stringify({
    model,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages: [{ role: "user", content: prompt }],
  });
}

/** Chat Completions (OpenAI-совместимый формат) отдаёт текст в choices[0].message.content. */
export function extractDeepseekText(data: unknown): string {
  const choices = (data as { choices?: { message?: { content?: string } }[] } | undefined)?.choices;
  return choices?.[0]?.message?.content ?? "";
}
