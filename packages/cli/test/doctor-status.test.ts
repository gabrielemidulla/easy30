import { describe, expect, it } from "vitest"
import { runDoctor } from "../src/commands/doctor.js"
import { progressLabel, runStatus } from "../src/commands/status.js"
import { capture, put, slurp, tempDir } from "./helpers.js"

const course = "---\neasy30: course\nid: c1\ntitle: Course\nexam: 2027-01-20\n---\n"
const concept = (id: string, extra = "") =>
  `---\neasy30: concept\nid: ${id}\ncourse: c1\nquestion: Q ${id}?\n${extra}---\nAnswer ${id}\n`

async function vault(files: Record<string, string>): Promise<string> {
  const dir = await tempDir()
  for (const [path, content] of Object.entries(files)) await put(dir, path, content)
  return dir
}

describe("doctor", () => {
  it("passes on a healthy vault", async () => {
    const dir = await vault({ "C/Course.md": course, "C/A.md": concept("a") })
    const out = capture()
    expect(await runDoctor({ dir, fix: false }, out)).toBe(0)
  })

  it("exits 2 on a cycle, an unresolved link and a missing answer", async () => {
    const dir = await vault({
      "C/Course.md": course,
      "C/A.md": concept("a", 'requires: ["[[B]]", "[[Nope]]"]\n'),
      "C/B.md": concept("b", 'requires: ["[[A]]"]\n'),
      "C/D.md": "---\neasy30: concept\nid: d\ncourse: c1\n---\n",
      "C/Bad.md": "---\neasy30: concept\nimportance: 9\ncourse: c1\n---\nx\n",
    })
    const out = capture()
    expect(await runDoctor({ dir, fix: false }, out)).toBe(2)
    const text = out.text()
    expect(text).toContain("Part of a prerequisite cycle")
    expect(text).toContain("Unresolved prerequisite [[Nope]]")
    expect(text).toContain("Has no question")
    expect(text).toContain("Has no answer")
    expect(text).toContain("importance")
  })

  it("reports bad log lines", async () => {
    const dir = await vault({
      "C/Course.md": course,
      "C/A.md": concept("a"),
      ".easy30/log/c1.jsonl": "garbage\n",
    })
    const out = capture()
    expect(await runDoctor({ dir, fix: false }, out)).toBe(2)
    expect(out.text()).toContain("Line 1: not valid JSON")
  })

  it("--fix writes missing ids", async () => {
    const dir = await vault({
      "C/Course.md": course,
      "C/A.md": "---\neasy30: concept\ncourse: c1\nquestion: Q?\n---\nA\n",
    })
    const before = capture()
    expect(await runDoctor({ dir, fix: false }, before)).toBe(0)
    expect(before.text()).toContain("without a stored id")
    const out = capture()
    expect(await runDoctor({ dir, fix: true }, out)).toBe(0)
    expect(out.text()).toContain("wrote ids into 1 concept note")
    expect(await slurp(dir, "C/A.md")).toMatch(/id: c-[0-9a-z]{8}/)
    expect(out.text()).not.toContain("without a stored id")
  })
})

describe("status", () => {
  it("prints machine-readable progress", async () => {
    const dir = await vault({
      "C/Course.md": course,
      "C/A.md": concept("a"),
      "C/B.md": concept("b", 'requires: ["[[A]]"]\n'),
    })
    const out = capture()
    const now = new Date("2027-01-10T12:00:00Z")
    expect(await runStatus({ dir, json: true, now }, out)).toBe(0)
    const [s] = JSON.parse(out.text())
    expect(s).toMatchObject({
      id: "c1",
      concepts: 2,
      dueNow: 0,
      readyToLearn: 1,
      exam: "2027-01-20",
      daysToExam: 10,
      mastery: { unknown: 2, red: 0, orange: 0, green: 0 },
      percentGreen: 0,
    })
    expect(typeof s.masteryPercent).toBe("number")
  })

  it("renders a human-readable table", async () => {
    const dir = await vault({ "C/Course.md": course, "C/A.md": concept("a") })
    const out = capture()
    await runStatus({ dir, json: false, now: new Date("2027-01-10T12:00:00Z") }, out)
    expect(out.text()).toContain("Course")
    expect(out.text()).toContain("░")
    expect(out.text()).toContain("exam in 10 days")
    expect(out.text()).toContain("0% green")
  })
})

describe("progressLabel", () => {
  it("shows the green share, with orange as a secondary figure", () => {
    const mastery = { unknown: 5, red: 0, orange: 0, green: 0 }
    expect(progressLabel({ concepts: 5, mastery, percentGreen: 0 })).toBe("0% green")
    const mixed = { unknown: 0, red: 0, orange: 2, green: 2 }
    expect(progressLabel({ concepts: 4, mastery: mixed, percentGreen: 50 })).toBe(
      "50% green +50% orange",
    )
  })
})
