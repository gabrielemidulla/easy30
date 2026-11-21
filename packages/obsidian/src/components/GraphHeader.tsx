import type { Course } from "@easy30/core"
import { createCourseFlow } from "../actions"
import type { CourseSummary } from "./flow-model"
import { useHost } from "./host-context"
import { Legend } from "./Legend"

export interface GraphHeaderProps {
  courses: Course[]
  courseId: string
  summary: CourseSummary
  issueCount: number
  onCourseChange: (courseId: string) => void
  onShowIssues: () => void
  onSkim: () => void
  onReview: () => void
}

export function GraphHeader(props: GraphHeaderProps) {
  const host = useHost()
  const { summary } = props
  return (
    <div className="easy30-header">
      <div className="easy30-header-row">
        <select
          className="dropdown easy30-course-select"
          aria-label="Course"
          value={props.courseId}
          onChange={(e) => props.onCourseChange(e.target.value)}
        >
          {props.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void createCourseFlow(host)}>
          New course
        </button>
        <span className="easy30-count">
          {summary.total} {summary.total === 1 ? "concept" : "concepts"}
        </span>
        {props.issueCount > 0 && (
          <button type="button" className="easy30-issues-badge" onClick={props.onShowIssues}>
            {props.issueCount} {props.issueCount === 1 ? "issue" : "issues"}
          </button>
        )}
        <span className="easy30-spacer" />
        <button type="button" onClick={props.onSkim}>
          Skim
        </button>
        <button type="button" className="mod-cta" onClick={props.onReview}>
          Review ({summary.due} due)
        </button>
      </div>
      <Legend summary={summary} />
    </div>
  )
}
