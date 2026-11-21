import { Easy30Error } from "@easy30/core"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

/** Compact JSON text result: the payload an agent reads. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] }
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] }
}

const HINTS: Record<Easy30Error["code"], string> = {
  not_found: "Check the id, title or path (list_courses / get_course show what exists).",
  cycle: "Prerequisites must form an acyclic graph; drop or reverse one of the edges.",
  conflict: "Something with that name already exists; pick another name or update it instead.",
  ambiguous: "Several concepts match; pass the concept id or its path instead of the title.",
  invalid: "Fix the arguments and retry.",
}

/** Map any thrown value to an `isError` tool result with an actionable message. */
export function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof Easy30Error
      ? `${error.code}: ${error.message}. ${HINTS[error.code]}`
      : error instanceof Error
        ? `Unexpected error: ${error.message}`
        : `Unexpected error: ${String(error)}`
  return { isError: true, content: [{ type: "text", text: message }] }
}
