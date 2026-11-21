import type { Rating } from "@easy30/core"
import { useEffect, useState } from "react"
import { type CourseSummary, summarize, toFlowModel } from "../components/flow-model"
import { useHost } from "../components/host-context"
import type { StudyRequest } from "../host"

interface Props {
  request: StudyRequest
  ratings: Rating[]
  skipped: number
  onLearnNext: () => void
}

interface Outcome {
  summary: CourseSummary
  readyToLearn: number
}

const MASTERY_ROWS = [
  { key: "unknown", label: "Unknown" },
  { key: "red", label: "Weak" },
  { key: "orange", label: "Shaky" },
  { key: "green", label: "Solid" },
] as const

function useOutcome(courseId: string): Outcome | null {
  const host = useHost()
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  useEffect(() => {
    const ws = host.workspace
    if (!ws) return
    let cancelled = false
    ws.view(courseId).then(
      (view) => {
        if (cancelled) return
        setOutcome({
          summary: summarize(toFlowModel(view)),
          readyToLearn: view.readyToLearn.length,
        })
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [host, courseId])
  return outcome
}

export function Finish({ request, ratings, skipped, onLearnNext }: Props) {
  const host = useHost()
  const outcome = useOutcome(request.courseId)
  const nothingDone = ratings.length === 0
  const canLearnNext =
    request.mode === "review" && !request.learnNext && request.conceptIds === undefined
      ? (outcome?.readyToLearn ?? 0) > 0
      : false

  const heading = nothingDone
    ? request.mode === "skim"
      ? "Nothing left to skim"
      : "Nothing is due"
    : request.mode === "skim"
      ? "Skim complete"
      : "Review complete"

  return (
    <div className="easy30-finish">
      <h2>{heading}</h2>
      {!nothingDone && (
        <p>
          You rated {ratings.length} {ratings.length === 1 ? "concept" : "concepts"}
          {skipped > 0 && ` and skipped ${skipped} inferred`}.
        </p>
      )}
      {nothingDone && request.mode === "review" && (
        <p className="easy30-muted">Come back when reviews are due, or learn something new.</p>
      )}
      {outcome && (
        <div className="easy30-mastery-summary">
          <div className="easy30-mastery-bar" role="img" aria-label="Mastery summary">
            {MASTERY_ROWS.map(({ key }) => (
              <span
                key={key}
                className={`easy30-mastery-seg is-${key}`}
                style={{ flexGrow: outcome.summary[key] }}
              />
            ))}
          </div>
          <div className="easy30-legend">
            {MASTERY_ROWS.map(({ key, label }) => (
              <span key={key} className="easy30-legend-item">
                <span className={`easy30-swatch is-${key}`} />
                {label}
                <span className="easy30-legend-count">{outcome.summary[key]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="easy30-finish-actions">
        <button
          type="button"
          className="mod-cta"
          onClick={() => void host.openGraph(request.courseId)}
        >
          Open graph
        </button>
        {canLearnNext && (
          <button type="button" onClick={onLearnNext}>
            Learn next ({outcome?.readyToLearn} ready)
          </button>
        )}
      </div>
    </div>
  )
}
