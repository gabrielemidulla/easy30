import type { CourseView } from "@easy30/core"
import { useEffect, useState } from "react"
import { errorMessage } from "../errors"
import { useHost, useHostVersion } from "./host-context"

export interface CourseViewState {
  view: CourseView | null
  error: string | null
}

/** Load `workspace.view(courseId)` and reload it whenever the workspace changes.
 * The previous view stays on screen while reloading, so the graph never flickers. */
export function useCourseView(courseId: string | null): CourseViewState {
  const host = useHost()
  const version = useHostVersion()
  const [state, setState] = useState<CourseViewState>({ view: null, error: null })

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the reload trigger
  useEffect(() => {
    const ws = host.workspace
    if (!ws || courseId === null) {
      setState({ view: null, error: null })
      return
    }
    let cancelled = false
    ws.view(courseId).then(
      (view) => {
        if (!cancelled) setState({ view, error: null })
      },
      (error: unknown) => {
        if (!cancelled) setState({ view: null, error: errorMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [host, courseId, version])

  return state
}
