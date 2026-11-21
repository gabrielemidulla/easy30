export type AiPreset = "openrouter" | "openai" | "ollama" | "custom"

export interface AiSettings {
  preset: AiPreset
  baseUrl: string
  apiKey: string
  model: string
}

export interface Easy30Settings {
  courseFolder: string
  skimIncludeInferred: boolean
  ai: AiSettings
}

export interface AiPresetInfo {
  label: string
  baseUrl: string
  model: string
}

export const AI_PRESETS: Record<AiPreset, AiPresetInfo> = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-v4-flash-0731",
  },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  custom: { label: "Custom", baseUrl: "", model: "" },
}

export const DEFAULT_SETTINGS: Easy30Settings = {
  courseFolder: "Easy30",
  skimIncludeInferred: false,
  ai: {
    preset: "openrouter",
    baseUrl: AI_PRESETS.openrouter.baseUrl,
    apiKey: "",
    model: AI_PRESETS.openrouter.model,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function isPreset(value: unknown): value is AiPreset {
  return typeof value === "string" && Object.hasOwn(AI_PRESETS, value)
}

/** Merge persisted plugin data (untrusted, possibly from an older version) over the defaults. */
export function mergeSettings(raw: unknown): Easy30Settings {
  const data = isRecord(raw) ? raw : {}
  const ai = isRecord(data.ai) ? data.ai : {}
  const defaults = DEFAULT_SETTINGS
  return {
    courseFolder: str(data.courseFolder, defaults.courseFolder),
    skimIncludeInferred:
      typeof data.skimIncludeInferred === "boolean"
        ? data.skimIncludeInferred
        : defaults.skimIncludeInferred,
    ai: {
      preset: isPreset(ai.preset) ? ai.preset : defaults.ai.preset,
      baseUrl: str(ai.baseUrl, defaults.ai.baseUrl),
      apiKey: str(ai.apiKey, defaults.ai.apiKey),
      model: str(ai.model, defaults.ai.model),
    },
  }
}

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i.test(url.trim())
}

/** AI grading is offered only when an endpoint and model are set, and a key is
 * present unless the endpoint is local (Ollama needs none). */
export function isAiConfigured(ai: AiSettings): boolean {
  if (ai.baseUrl.trim() === "" || ai.model.trim() === "") return false
  return ai.apiKey.trim() !== "" || isLocalUrl(ai.baseUrl)
}
