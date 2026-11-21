import { describe, expect, it } from "vitest"
import {
  AiError,
  buildMessages,
  chatUrl,
  gradeAnswer,
  type HttpRequest,
  parseCompletion,
  parseGrading,
  suggestedRating,
  testConnection,
  toLoggedGrading,
} from "../src/ai"

const ai = {
  preset: "custom",
  baseUrl: "http://localhost:11434/v1/",
  apiKey: "",
  model: "m",
} as const

const completion = (content: string) =>
  JSON.stringify({ choices: [{ message: { role: "assistant", content } }] })

describe("parseGrading", () => {
  it("parses a plain JSON verdict", () => {
    const g = parseGrading('{"verdict":"partial","feedback":"Close.","missing":["definition"]}')
    expect(g).toEqual({ verdict: "partial", feedback: "Close.", missing: ["definition"] })
  })

  it("tolerates code fences, prose and braces inside strings", () => {
    const text =
      'Sure!\n```json\n{"verdict":"Correct","feedback":"Uses {x} well","missing":[]}\n```'
    expect(parseGrading(text)).toEqual({
      verdict: "correct",
      feedback: "Uses {x} well",
      missing: [],
    })
  })

  it("defaults missing fields and drops junk entries", () => {
    expect(parseGrading('{"verdict":"incorrect","missing":["a",1,""]}')).toEqual({
      verdict: "incorrect",
      feedback: "",
      missing: ["a"],
    })
  })

  it("rejects unknown verdicts and non-JSON", () => {
    expect(() => parseGrading('{"verdict":"maybe"}')).toThrow(AiError)
    expect(() => parseGrading("no json here")).toThrow(AiError)
  })
})

describe("parseCompletion", () => {
  it("extracts the first choice", () => {
    expect(parseCompletion({ status: 200, text: completion("hi") })).toBe("hi")
  })

  it("surfaces API error messages", () => {
    const text = JSON.stringify({ error: { message: "Invalid API key" } })
    expect(() => parseCompletion({ status: 401, text })).toThrow(/401.*Invalid API key/)
  })

  it("rejects empty responses", () => {
    expect(() => parseCompletion({ status: 200, text: "{}" })).toThrow(AiError)
  })
})

describe("requests", () => {
  it("builds the chat URL without double slashes", () => {
    expect(chatUrl("https://x.test/v1/")).toBe("https://x.test/v1/chat/completions")
  })

  it("includes question, reference and student answer in the prompt", () => {
    const [system, user] = buildMessages({
      concept: "Basis",
      question: "What is a basis?",
      reference: "A spanning independent set.",
      answer: "A set of vectors.",
      language: "en",
    })
    expect(system?.role).toBe("system")
    expect(user?.content).toContain("What is a basis?")
    expect(user?.content).toContain("A spanning independent set.")
    expect(user?.content).toContain("A set of vectors.")
  })

  it("sends a bearer token only when a key is set and grades via the transport", async () => {
    const seen: HttpRequest[] = []
    const transport = async (req: HttpRequest) => {
      seen.push(req)
      return { status: 200, text: completion('{"verdict":"correct","feedback":"ok","missing":[]}') }
    }
    const input = { concept: "c", question: "q", reference: "r", answer: "a" }
    const g = await gradeAnswer(ai, input, transport)
    await gradeAnswer({ ...ai, apiKey: " sk-1 " }, input, transport)
    expect(g.verdict).toBe("correct")
    expect(seen[0]?.url).toBe("http://localhost:11434/v1/chat/completions")
    expect(seen[0]?.headers.Authorization).toBeUndefined()
    expect(seen[1]?.headers.Authorization).toBe("Bearer sk-1")
  })

  it("wraps transport failures", async () => {
    const transport = async (): Promise<never> => {
      throw new Error("ECONNREFUSED")
    }
    await expect(testConnection(ai, transport)).rejects.toThrow(/ECONNREFUSED/)
  })
})

describe("rating mapping", () => {
  it("suggests Good / Hard / Again", () => {
    expect(suggestedRating("correct")).toBe(3)
    expect(suggestedRating("partial")).toBe(2)
    expect(suggestedRating("incorrect")).toBe(1)
  })

  it("folds missing points into the logged feedback", () => {
    expect(
      toLoggedGrading({ verdict: "partial", feedback: "Almost.", missing: ["a", "b"] }),
    ).toEqual({
      verdict: "partial",
      feedback: "Almost. Missing: a; b",
    })
    expect(toLoggedGrading({ verdict: "correct", feedback: "", missing: [] })).toEqual({
      verdict: "correct",
    })
  })
})
