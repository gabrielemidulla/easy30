import { describe, expect, it } from "vitest"
import {
  composeNote,
  readFrontmatter,
  replaceBody,
  splitNote,
  updateFrontmatter,
} from "../src/frontmatter.js"
import { slugify } from "../src/ids.js"
import { linkTarget } from "../src/links.js"

describe("frontmatter", () => {
  const note = "---\n# my comment\neasy30: concept\ntags: [a, b]\n---\nBody $x^2$\n"

  it("splits and parses", () => {
    expect(splitNote(note).body).toBe("Body $x^2$\n")
    expect(readFrontmatter(note)).toEqual({ easy30: "concept", tags: ["a", "b"] })
  })

  it("updates keys while keeping comments, other keys and the body", () => {
    const out = updateFrontmatter(note, { id: "c-1", tags: undefined })
    expect(out).toContain("# my comment")
    expect(out).toContain("id: c-1")
    expect(out).not.toContain("tags")
    expect(out.endsWith("---\nBody $x^2$\n")).toBe(true)
  })

  it("adds frontmatter to a plain note", () => {
    expect(updateFrontmatter("hello\n", { easy30: "course" })).toBe(
      "---\neasy30: course\n---\nhello\n",
    )
  })

  it("treats a note without frontmatter as empty", () => {
    expect(readFrontmatter("# Title\n")).toEqual({})
    expect(readFrontmatter("---\n: : bad\n---\n")).toEqual({})
  })

  it("composes and replaces bodies", () => {
    const n = composeNote({ easy30: "concept", requires: ["[[A]]"] }, "answer")
    expect(n).toBe('---\neasy30: concept\nrequires:\n  - "[[A]]"\n---\nanswer\n')
    expect(replaceBody(n, "new")).toBe('---\neasy30: concept\nrequires:\n  - "[[A]]"\n---\nnew\n')
  })
})

describe("links", () => {
  it.each([
    ["[[Base]]", "Base"],
    ["[[algebra/Base|una base]]", "algebra/Base"],
    ["[[Base#Definizione]]", "Base"],
    ["Base.md", "Base"],
    ["  ", null],
  ])("%s → %s", (input, expected) => {
    expect(linkTarget(input)).toBe(expected)
  })
})

describe("slugify", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Analisi Matematica I — Università")).toBe("analisi-matematica-i-universita")
    expect(slugify("!!!")).toBe("course")
  })
})
