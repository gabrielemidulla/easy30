import { createCourseFlow } from "../actions"
import { DOCS_URL } from "../constants"
import { useHost } from "./host-context"

export function EmptyState() {
  const host = useHost()
  return (
    <div className="easy30-empty">
      <h2>Map what you need to learn</h2>
      <p>
        A course is a graph of concept notes. Each concept has a question, a reference answer and
        the prerequisites it builds on. Skim the graph once to find what you already know, then
        review what is due with spaced repetition.
      </p>
      <div className="easy30-empty-actions">
        <button type="button" className="mod-cta" onClick={() => void createCourseFlow(host)}>
          Create course
        </button>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
          Read the docs
        </a>
      </div>
    </div>
  )
}
