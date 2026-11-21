import { useHost, useHostVersion } from "../components/host-context"
import type { StudyRequest } from "../host"
import { Finish } from "./Finish"
import { useStudyKeys } from "./keys"
import { ReviewCard } from "./ReviewCard"
import { SkimCard } from "./SkimCard"
import { useSession } from "./use-session"

interface Props {
  request: StudyRequest
  onRequestChange: (request: StudyRequest) => void
}

export function StudyApp({ request, onRequestChange }: Props) {
  const host = useHost()
  useHostVersion()
  if (!host.workspace) return <div className="easy30-empty">Indexing your vault…</div>
  return <Study request={request} onRequestChange={onRequestChange} />
}

function Study({ request, onRequestChange }: Props) {
  const host = useHost()
  const session = useSession(host, request)
  const course = host.workspace?.courses().find((c) => c.id === request.courseId) ?? null

  useStudyKeys((key) => {
    if (key !== "undo" || !session.canUndo) return false
    void session.undo()
    return true
  })

  if (course === null) return <div className="easy30-empty">This course no longer exists.</div>
  if (session.status === "error") {
    return <div className="easy30-empty">Could not start: {session.error}</div>
  }

  const decided = session.ratings.length + session.skipped
  const progress = session.total === 0 ? 1 : Math.min(1, decided / session.total)
  const modeLabel = request.mode === "skim" ? "Skim" : request.learnNext ? "Learn next" : "Review"

  return (
    <div className="easy30-study">
      <div className="easy30-study-header">
        <div className="easy30-study-title">
          <strong>{modeLabel}</strong>
          <span className="easy30-muted"> · {course.title}</span>
        </div>
        <button type="button" disabled={!session.canUndo} onClick={() => void session.undo()}>
          Undo <kbd>U</kbd>
        </button>
      </div>
      <div
        className="easy30-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={session.total}
        aria-valuenow={decided}
      >
        <div className="easy30-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="easy30-progress-text">
        {session.ratings.length} rated
        {session.skipped > 0 && ` · ${session.skipped} inferred skipped`}
        {` · ${session.remaining} left`}
        {session.hint && <span className="easy30-hint">{session.hint}</span>}
      </div>

      {session.status === "loading" && <div className="easy30-empty">Loading…</div>}
      {session.status === "card" && session.concept && request.mode === "skim" && (
        <SkimCard
          key={`${session.concept.id}:${session.ratings.length}`}
          concept={session.concept}
          busy={session.busy}
          onRate={(rating, extras) => void session.rate(rating, extras)}
        />
      )}
      {session.status === "card" && session.concept && request.mode === "review" && (
        <ReviewCard
          key={`${session.concept.id}:${session.ratings.length}`}
          concept={session.concept}
          language={course.language}
          busy={session.busy}
          onRate={(rating, extras) => void session.rate(rating, extras)}
        />
      )}
      {session.status === "done" && (
        <Finish
          request={request}
          ratings={session.ratings}
          skipped={session.skipped}
          onLearnNext={() => {
            const { conceptIds: _ignored, ...rest } = request
            onRequestChange({ ...rest, learnNext: true })
          }}
        />
      )}
    </div>
  )
}
