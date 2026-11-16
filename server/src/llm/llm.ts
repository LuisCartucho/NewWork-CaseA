// One small wrapper around the OpenAI-compatible chat API.
// Primary: Gemini Flash (free tier). Fallback: Groq. Both fail -> null -> facts-only mode.
// Callers must only pass redacted email text and the specific looked-up facts.
import { config } from "../config.js";

export interface ChatMessage { role: "system" | "user"; content: string }

const PROVIDERS = [
  { name: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", ...config.llm.gemini },
  { name: "groq", baseUrl: "https://api.groq.com/openai/v1", ...config.llm.groq },
];

export async function chat(_messages: ChatMessage[], _opts: { json?: boolean } = {}): Promise<string | null> {
  // TODO step 3: try each provider with a key, short timeout, return first success.
  void PROVIDERS;
  return null;
}
