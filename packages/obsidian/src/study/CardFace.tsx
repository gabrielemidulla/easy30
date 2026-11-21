import type { Concept } from "@easy30/core"
import type { ReactNode } from "react"
import { useHost } from "../components/host-context"
import { MarkdownBlock } from "./MarkdownBlock"

interface Props {
  concept: Concept
  revealed: boolean
  /** Rendered between the question and the answer (e.g. the answer textarea). */
  children?: ReactNode
}

/** Title, question and (once revealed) the reference answer of a concept. */
export function CardFace({ concept, revealed, children }: Props) {
  const host = useHost()
  const hasAnswer = concept.answer.trim() !== ""
  return (
    <div className="easy30-card">
      <div className="easy30-card-head">
        <span className="easy30-card-title">{concept.title}</span>
        <button
          type="button"
          className="clickable-icon easy30-link-button"
          onClick={() => void host.openNote(concept.path)}
        >
          Open note
        </button>
      </div>
      <div className="easy30-card-question">
        {concept.question.trim() === "" ? (
          <p className="easy30-muted">
            No question yet. Explain "{concept.title}" in your own words.
          </p>
        ) : (
          <MarkdownBlock markdown={concept.question} sourcePath={concept.path} />
        )}
      </div>
      {children}
      {revealed && (
        <div className="easy30-card-answer">
          <div className="easy30-section-label">Answer</div>
          {hasAnswer ? (
            <MarkdownBlock markdown={concept.answer} sourcePath={concept.path} />
          ) : (
            <p className="easy30-muted">This note has no reference answer yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
