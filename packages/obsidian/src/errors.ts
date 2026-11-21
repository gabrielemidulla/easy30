import { Easy30Error } from "@easy30/core"
import { Notice } from "obsidian"
import { AiError } from "./ai"

export function errorMessage(error: unknown): string {
  if (error instanceof Easy30Error || error instanceof AiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export function showError(error: unknown, prefix = "Easy30"): void {
  new Notice(`${prefix}: ${errorMessage(error)}`, 8000)
}
