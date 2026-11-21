import type { Issue } from "@easy30/core"
import type { Registrar } from "../registrar.js"

export function registerVaultTools(tool: Registrar): void {
  tool(
    "validate_vault",
    {
      title: "Validate vault",
      readOnly: true,
      description:
        "Check the whole vault for problems: malformed Easy30 notes, duplicate ids, prerequisite cycles " +
        "and unresolved prerequisite links, per course. Run it after generating or editing a graph and " +
        "fix every issue reported (use set_prerequisites / update_concept).",
      input: {},
    },
    async (_args, { workspace }) => {
      const vault = [...workspace.issues]
      const known = new Set(vault.map(issueKey))
      const courses = await Promise.all(
        workspace.courses().map(async (course) => {
          const view = await workspace.view(course.id)
          return {
            course: course.id,
            issues: view.issues.filter((i) => !known.has(issueKey(i))),
          }
        }),
      )
      const ok = vault.length === 0 && courses.every((c) => c.issues.length === 0)
      return { ok, vault_issues: vault, courses: courses.filter((c) => c.issues.length > 0) }
    },
  )
}

const issueKey = (issue: Issue) => `${issue.path}\u0000${issue.message}`
