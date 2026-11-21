import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS, isAiConfigured, mergeSettings } from "../src/settings-model"
import { parseStudyRequest } from "../src/study/request"

describe("mergeSettings", () => {
  it("returns defaults for missing or garbage data", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings("nope")).toEqual(DEFAULT_SETTINGS)
  })

  it("keeps valid values and falls back per field", () => {
    const merged = mergeSettings({
      courseFolder: "Uni",
      skimIncludeInferred: "yes",
      ai: { preset: "bogus", model: "gpt-x", apiKey: 5 },
    })
    expect(merged.courseFolder).toBe("Uni")
    expect(merged.skimIncludeInferred).toBe(false)
    expect(merged.ai.preset).toBe("openrouter")
    expect(merged.ai.model).toBe("gpt-x")
    expect(merged.ai.apiKey).toBe("")
  })
})

describe("isAiConfigured", () => {
  const base = { preset: "custom", baseUrl: "", apiKey: "", model: "m" } as const
  it("needs a key for remote endpoints but not local ones", () => {
    expect(isAiConfigured({ ...base, baseUrl: "https://openrouter.ai/api/v1" })).toBe(false)
    expect(isAiConfigured({ ...base, baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" })).toBe(
      true,
    )
    expect(isAiConfigured({ ...base, baseUrl: "http://localhost:11434/v1" })).toBe(true)
    expect(isAiConfigured({ ...base, baseUrl: "http://localhost:11434/v1", model: " " })).toBe(
      false,
    )
  })
})

describe("parseStudyRequest", () => {
  it("accepts valid state and rejects the rest", () => {
    expect(parseStudyRequest({ mode: "skim", courseId: "geo", nonce: 1 })).toEqual({
      mode: "skim",
      courseId: "geo",
    })
    expect(
      parseStudyRequest({ mode: "review", courseId: "geo", conceptIds: ["a", 2], learnNext: true }),
    ).toEqual({ mode: "review", courseId: "geo", conceptIds: ["a"], learnNext: true })
    expect(parseStudyRequest({ mode: "oral", courseId: "geo" })).toBeNull()
    expect(parseStudyRequest(null)).toBeNull()
  })
})
