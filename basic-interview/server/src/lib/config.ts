import { MAX_UPLOAD_BYTES } from "@kfl-interview/shared";

const port = Number(process.env.PORT ?? 8787);
const llmProvider = parseLlmProvider(process.env.LLM_PROVIDER);
const defaultClientOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];

export const config = {
  port: Number.isFinite(port) ? port : 8787,
  clientOrigins: (process.env.CLIENT_ORIGIN ?? defaultClientOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  llmProvider,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.5",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiApiBaseUrl: process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com",
  keyframeApiKey: process.env.KEYFRAME_API_KEY,
  keyframePersonaSlug: process.env.KEYFRAME_PERSONA_SLUG ?? "public:lyra_persona-1.5-live",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
  elevenLabsApiBaseUrl: process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io",
  exposeElevenLabsPromptDebug: parseBooleanEnv(process.env.ELEVENLABS_PROMPT_DEBUG),
  typstBin: process.env.TYPST_BIN ?? "typst",
  maxUploadBytes: MAX_UPLOAD_BYTES
};

export function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    const error = new Error(`Missing ${name}. Add it to .env and restart pnpm dev.`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  return value;
}

export type ConfiguredLlmProvider = "openai" | "gemini" | "local-fallback";

function parseLlmProvider(value: string | undefined): ConfiguredLlmProvider {
  if (!value) {
    return "openai";
  }

  if (value === "openai" || value === "gemini" || value === "local-fallback") {
    return value;
  }

  throw new Error("Invalid LLM_PROVIDER. Use openai, gemini, or local-fallback.");
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}
