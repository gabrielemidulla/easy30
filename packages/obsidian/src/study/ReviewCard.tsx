import type { Concept, Rating } from "@easy30/core"
import { useRef, useState } from "react"
import { type AiGrading, gradeAnswer, suggestedRating, toLoggedGrading } from "../ai"
import { obsidianTransport } from "../ai-transport"
import { useHost } from "../components/host-context"
import { showError } from "../errors"
import { isAiConfigured } from "../settings-model"
import { CardFace } from "./CardFace"
import { useStudyKeys } from "./keys"
import { RatingButtons, REVIEW_OPTIONS } from "./RatingButtons"
import type { RateExtras } from "./use-session"

interface Props {
  concept: Concept
  language: string | null
  busy: boolean
  onRate: (rating: Rating, extras: RateExtras) => void
}

const VERDICT_LABEL: Record<AiGrading["verdict"], string> = {
  correct: "Correct",
  partial: "Partly correct",
  incorrect: "Incorrect",
}

export function ReviewCard({ concept, language, busy, onRate }: Props) {
  const host = useHost()
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState("")
  const [grading, setGrading] = useState<AiGrading | null>(null)
  const [checking, setChecking] = useState(false)
  const shownAt = useRef(Date.now())
  const typed = answer.trim()
  const aiAvailable = isAiConfigured(host.settings.ai)
  const suggested = grading ? suggestedRating(grading.verdict) : null

  const rate = (rating: Rating) => {
    const extras: RateExtras = {
      ms: Date.now() - shownAt.current,
      ...(typed !== "" && { answer: typed }),
      ...(grading && { grading: toLoggedGrading(grading) }),
    }
    onRate(rating, extras)
  }

  const checkWithAi = async () => {
    if (checking || typed === "") return
    setChecking(true)
    try {
      setGrading(
        await gradeAnswer(
          host.settings.ai,
          {
            concept: concept.title,
            question: concept.question.trim() || concept.title,
            reference: concept.answer,
            answer: typed,
            language,
          },
          obsidianTransport,
        ),
      )
    } catch (error) {
      showError(error, "AI check failed")
    } finally {
      setChecking(false)
    }
  }

  useStudyKeys((key) => {
    if (busy) return false
    if (!revealed) {
      if (key === "space" || key === "enter" || key === "submit") setRevealed(true)
      else return false
      return true
    }
    if (key === "1" || key === "2" || key === "3" || key === "4") {
      rate(Number(key) as Rating)
      return true
    }
    if ((key === "enter" || key === "submit") && suggested !== null) {
      rate(suggested)
      return true
    }
    return false
  })

  return (
    <>
      <CardFace concept={concept} revealed={revealed}>
        <textarea
          className="easy30-answer-input"
          placeholder="Your answer (optional)"
          aria-label="Your answer"
          rows={4}
          value={answer}
          readOnly={revealed}
          onChange={(e) => setAnswer(e.target.value)}
        />
        {revealed && aiAvailable && typed !== "" && grading === null && (
          <div className="easy30-ai-row">
            <button type="button" disabled={checking} onClick={() => void checkWithAi()}>
              {checking ? "Checking…" : "Check with AI"}
            </button>
            <span className="easy30-muted">Sends your answer to {host.settings.ai.baseUrl}</span>
          </div>
        )}
        {grading && (
          <div className={`easy30-grading is-${grading.verdict}`}>
            <div className="easy30-grading-verdict">{VERDICT_LABEL[grading.verdict]}</div>
            {grading.feedback && <p>{grading.feedback}</p>}
            {grading.missing.length > 0 && (
              <ul>
                {grading.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardFace>
      {revealed ? (
        <RatingButtons
          options={REVIEW_OPTIONS}
          suggested={suggested}
          disabled={busy}
          onRate={rate}
        />
      ) : (
        <button type="button" className="mod-cta easy30-reveal" onClick={() => setRevealed(true)}>
          Show answer <kbd>Space</kbd>
        </button>
      )}
    </>
  )
}
