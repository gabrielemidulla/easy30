import type { Workspace } from "@easy30/core"

export interface ServerContext {
  workspace: Workspace
  /** `source` stamped on every log entry written through this server. */
  source(): string
}
