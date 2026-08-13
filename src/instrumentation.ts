/**
 * Проверки окружения при старте Node-рантайма (не на этапе `next build`:
 * в Docker-сборке секрета ещё нет).
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { assertAuthSecret } = await import("./lib/auth-secret");
  assertAuthSecret();
}
