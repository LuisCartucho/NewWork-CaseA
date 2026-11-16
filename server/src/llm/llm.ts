// One small wrapper around the OpenAI-compatible chat API.
// Primary: Gemini Flash (free tier). Fallback: Groq. Both fail -> null -> facts-only mode.
// Callers must only pass redacted email text and the specific looked-up facts.
// Logging: provider, HTTP status and error code only. Never the prompt, the response, or the
// provider's error message (which could in principle echo input).
import { config } from "../config.js";

export interface ChatMessage { role: "system" | "user"; content: string }
export interface ChatResult { content: string; provider: string }

const PROVIDERS = [
  { name: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", ...config.llm.gemini },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", ...config.llm.groq },
];

const TIMEOUT_MS = 12_000; // a slow provider falls through to the next one instead of blocking
const MAX_RETRY_WAIT_MS = 12_000; // on 429, wait this long at most before trying the next provider
const COOLDOWN_MS = 120_000; // after a timeout or quota error, skip that provider for a while

const cooldownUntil = new Map<string, number>();
const coolDown = (name: string, why: string) => {
  cooldownUntil.set(name, Date.now() + COOLDOWN_MS);
  console.warn(`[llm] ${name} ${why}; skipping it for ${COOLDOWN_MS / 1000}s`);
};

export async function chat(messages: ChatMessage[], opts: { json?: boolean } = {}): Promise<ChatResult | null> {
  // Tests set LLM_DISABLED=1 so they are offline and deterministic.
  if (process.env.LLM_DISABLED === "1") return null;

  for (const p of PROVIDERS) {
    if (!p.key || (cooldownUntil.get(p.name) ?? 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({
            model: p.model,
            messages,
            temperature: 0,
            reasoning_effort: "low", // both are reasoning models; these tasks don't need long thinking
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 429 && attempt === 0) {
          const wait = retryAfterMs(res);
          if (wait <= MAX_RETRY_WAIT_MS) { await sleep(wait); continue; }
        }
        if (!res.ok) {
          const code = errorCode(await res.text());
          if (res.status === 429 || res.status === 503) coolDown(p.name, `${res.status} (quota or overload${code ? `, ${code}` : ""})`);
          else console.warn(`[llm] ${p.name} HTTP ${res.status}${code ? ` (${code})` : ""}`);
          break; // next provider
        }
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = body.choices?.[0]?.message?.content?.trim();
        if (content) return { content, provider: p.name };
        console.warn(`[llm] ${p.name}: empty response`);
        break;
      } catch (err) {
        const e = err as Error;
        if (e.name === "TimeoutError") coolDown(p.name, `timed out after ${TIMEOUT_MS / 1000}s`);
        else console.warn(`[llm] ${p.name} failed: ${e.name}`);
        break;
      }
    }
  }
  return null;
}

/** The provider's machine-readable error code ("RESOURCE_EXHAUSTED", "rate_limit_exceeded"), not its message. */
function errorCode(text: string): string {
  try {
    const j = JSON.parse(text);
    const e = Array.isArray(j) ? j[0]?.error : j?.error;
    const code = e?.status ?? e?.code ?? e?.type;
    return typeof code === "string" && /^[\w.-]{1,40}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

/** Retry-After header (seconds), else a short default. Never logs or returns the key. */
function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : 5_000;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True if at least one provider has a key. */
export const llmConfigured = () => PROVIDERS.some((p) => p.key) && process.env.LLM_DISABLED !== "1";

/** Batch only: forget cooldowns after waiting, so the next email tries every provider again. */
export const resetCooldowns = () => cooldownUntil.clear();

/** Models sometimes wrap JSON in ```json fences even when asked not to. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned);
}
