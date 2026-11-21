import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import { Workspace } from "@easy30/core"
import { NodeFs } from "@easy30/core/node"

/** Thrown for user-facing errors: printed without a stack trace. */
export class CliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CliError"
  }
}

export async function openWorkspace(dir: string): Promise<Workspace> {
  const root = resolve(dir)
  try {
    if (!(await stat(root)).isDirectory()) throw new CliError(`${root} is not a folder`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError(`No such folder: ${root}`)
    }
    throw error
  }
  return Workspace.open(new NodeFs(root))
}
