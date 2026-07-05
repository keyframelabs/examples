import { KeyframeSessionDetailsSchema, type KeyframeSessionDetails } from "@kfl-interview/shared";

import { config, requireEnv } from "./config";

export async function createKeyframeSession(): Promise<KeyframeSessionDetails> {
  const apiKey = requireEnv(config.keyframeApiKey, "KEYFRAME_API_KEY");

  const response = await fetch("https://api.keyframelabs.com/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      persona_slug: config.keyframePersonaSlug
    })
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(`Keyframe session creation failed: ${extractProviderError(body, response.statusText)}`),
      { status: response.status }
    );
  }

  return KeyframeSessionDetailsSchema.parse(body);
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function extractProviderError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }

  return fallback;
}

