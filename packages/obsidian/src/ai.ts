import type { Grading, Rating } from "@easy30/core"
import { verdictRating } from "@easy30/core"
import type { AiSettings } from "./settings-model"

export type Verdict = Grading["verdict"]

export interface AiGrading {
  verdict: Verdict
  feedback: string
  missing: string[]
}

export interface GradeInput {
  concept: string
  question: string
  reference: string
  answer: string
  /** Course language hint (e.g. "it"); the model otherwise follows the student's language. */
  language?: string | null
}

export interface HttpRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export interface HttpResponse {
  status: number
  text: string
}

/** Injected so this module stays free of Obsidian imports (and is unit-testable). */
export type Transport = (request: HttpRequest) => Promise<HttpResponse>

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiError"
  }
}

interface ChatMessage {
  role: "system" | "user"
  content: string
}

const SYSTEM_PROMPT = [
  "You grade a student's answer to a study question against a reference answer.",
  "Be strict but fair: accept correct answers phrased differently, but do not reward vague or partly wrong answers.",
  'Reply with ONLY a JSON object: {"verdict":"correct"|"partial"|"incorrect","feedback":string,"missing":string[]}.',
  "feedback: one to three sentences addressed to the student. missing: key points from the reference the answer lacks (empty when correct).",
  "Write feedback and missing in the language the student used (fall back to the language of the question).",
].join(" ")

export function buildMessages(input: GradeInput): ChatMessage[] {
  const lines = [
    `Concept: ${input.concept}`,
    ...(input.language ? [`Course language: ${input.language}`] : []),
    `Question:\n${input.question}`,
    `Reference answer:\n${input.reference}`,
    `Student answer:\n${input.answer}`,
  ]
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n\n") },
  ]
}

export function chatUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`
}

function buildRequest(ai: AiSettings, messages: ChatMessage[], maxTokens?: number): HttpRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (ai.apiKey.trim()) headers.Authorization = `Bearer ${ai.apiKey.trim()}`
  const body = {
    model: ai.model.trim(),
    messages,
    temperature: 0.2,
    ...(maxTokens !== undefined && { max_tokens: maxTokens }),
  }
  return { url: chatUrl(ai.baseUrl), headers, body: JSON.stringify(body) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** First balanced `{...}` in the text, ignoring braces inside strings. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

const VERDICTS: readonly Verdict[] = ["correct", "partial", "incorrect"]

/** Parse the model's text into a grading. Tolerates code fences and surrounding prose. */
export function parseGrading(content: string): AiGrading {
  const objectText = extractJsonObject(content)
  const data = objectText === null ? undefined : parseJson(objectText)
  if (!isRecord(data)) throw new AiError("The model did not return a JSON verdict.")
  const verdict = typeof data.verdict === "string" ? data.verdict.trim().toLowerCase() : ""
  const found = VERDICTS.find((v) => v === verdict)
  if (!found) throw new AiError(`Unexpected verdict "${String(data.verdict)}".`)
  const missing = Array.isArray(data.missing)
    ? data.missing.filter((m): m is string => typeof m === "string" && m.trim() !== "")
    : []
  return {
    verdict: found,
    feedback: typeof data.feedback === "string" ? data.feedback.trim() : "",
    missing,
  }
}

/** Text of the first choice of an OpenAI-compatible chat completion response. */
export function parseCompletion(response: HttpResponse): string {
  const data = parseJson(response.text)
  if (response.status < 200 || response.status >= 300) {
    const error = isRecord(data) ? data.error : undefined
    const detail =
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : response.text.slice(0, 200)
    throw new AiError(`The AI service returned ${response.status}: ${detail}`)
  }
  const choices = isRecord(data) ? data.choices : undefined
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined
  const message = isRecord(first) ? first.message : undefined
  const content = isRecord(message) ? message.content : undefined
  if (typeof content !== "string" || content.trim() === "") {
    throw new AiError("The AI service returned an empty response.")
  }
  return content
}

async function send(transport: Transport, request: HttpRequest): Promise<HttpResponse> {
  try {
    return await transport(request)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new AiError(`Could not reach the AI service: ${reason}`)
  }
}

export async function gradeAnswer(
  ai: AiSettings,
  input: GradeInput,
  transport: Transport,
): Promise<AiGrading> {
  const response = await send(transport, buildRequest(ai, buildMessages(input)))
  return parseGrading(parseCompletion(response))
}

/** Sends a tiny prompt to check the URL, key and model. Throws `AiError` on failure. */
export async function testConnection(ai: AiSettings, transport: Transport): Promise<void> {
  const messages: ChatMessage[] = [{ role: "user", content: "Reply with the single word: ok" }]
  parseCompletion(await send(transport, buildRequest(ai, messages, 16)))
}

export function suggestedRating(verdict: Verdict): Rating {
  return verdictRating(verdict)
}

/** What gets stored in the rating entry (the log schema has a single feedback string). */
export function toLoggedGrading(grading: AiGrading): Grading {
  const missing = grading.missing.length > 0 ? `Missing: ${grading.missing.join("; ")}` : ""
  const feedback = [grading.feedback, missing].filter(Boolean).join(" ")
  return { verdict: grading.verdict, ...(feedback && { feedback }) }
}
