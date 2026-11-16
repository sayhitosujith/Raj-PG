/**
 * Whether the resident AI assistant can run: it needs an Anthropic API key on the server. Kept apart from assistant.ts
 * so the portal can report it without importing the assistant route (which imports the portal's guards).
 */
export const isAssistantConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY)
