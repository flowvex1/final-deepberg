import OpenAI from "openai";

export const AI_ENABLED = Boolean(
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
);

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "deepberg-disabled",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "http://127.0.0.1:9/v1",
  timeout: 15_000,
  maxRetries: 1,
});

/**
 * The chat model used for all text analysis. Override with the AI_MODEL env var
 * (e.g. a stronger local Ollama model like "qwen2.5:14b-instruct", or a hosted
 * model if you point AI_INTEGRATIONS_OPENAI_BASE_URL at a paid provider).
 */
export const AI_MODEL = process.env.AI_MODEL || "gpt-4.1-mini";
