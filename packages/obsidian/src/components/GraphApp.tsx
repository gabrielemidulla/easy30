import type { Course } from "@easy30/core"
import { useEffect, useMemo } from "react"
import { createConceptFlow } from "../actions"
import { showIssues } from "../modals/issues-modal"
import { EmptyState } from "./EmptyState"
import { summarize, toFlowModel } from "./flow-model"
import { GraphCanvas } from "./GraphCanvas"
import { GraphHeader } from "./GraphHeader"
import { useHost, useHostVersion } from "./host-context"
import { showNodeMenu } from "./node-menu"
import { useCourseView } from "./use-course-view"

export interface GraphAppProps {
  courseId: string | null
  onCourseChange: (courseId: string) => void
}

export function GraphApp({ courseId, onCourseChange }: GraphAppProps) {
  const host = useHost()
  useHostVersion()
  const ws = host.workspace
  if (!ws) return <div className="easy30-empty">Indexing your vault…</div>
  const courses = ws.courses()
  const active = courses.find((c) => c.id === courseId) ?? courses[0]
  if (!active) return <EmptyState />
  return <CourseGraph courses={courses} course={active} onCourseChange={onCourseChange} />
}

interface CourseGraphProps {
  courses: Course[]
  course: Course
  onCourseChange: (courseId: string) => void
}

function CourseGraph({ courses, course, onCourseChange }: CourseGraphProps) {
  const host = useHost()
  const { view, error } = useCourseView(course.id)

  useEffect(() => {
    host.rememberCourse(course.id)
  }, [host, course.id])

  const current = view && view.course.id === course.id ? view : null
  const model = useMemo(() => (current ? toFlowModel(current) : null), [current])

  if (error) return <div className="easy30-empty">Could not load this course: {error}</div>
  if (!current || !model) return <div className="easy30-empty">Loading…</div>

  return (
    <div className="easy30-graph">
      <GraphHeader
        courses={courses}
        courseId={course.id}
        summary={summarize(model)}
        issueCount={current.issues.length}
        onCourseChange={onCourseChange}
        onShowIssues={() =>
          showIssues(host.app, current.issues, (path) => void host.openNote(path))
        }
        onSkim={() => void host.startStudy({ mode: "skim", courseId: course.id })}
        onReview={() => void host.startStudy({ mode: "review", courseId: course.id })}
      />
      <div className="easy30-canvas">
        {model.nodes.length === 0 ? (
          <div className="easy30-empty">
            <h2>No concepts yet</h2>
            <p>
              Add concept notes to {course.title}, then link them with prerequisites. You can also
              turn any existing note into a concept from the command palette.
            </p>
            <button
              type="button"
              className="mod-cta"
              onClick={() => void createConceptFlow(host, course)}
            >
              New concept
            </button>
          </div>
        ) : (
          <GraphCanvas
            key={course.id}
            model={model}
            onOpenNode={(node) => void host.openNote(node.path)}
            onNodeMenu={(event, node) => showNodeMenu(host, event, node, course.id)}
            onConnect={(prerequisiteId, dependentId) =>
              void host.mutate((ws) => ws.addPrerequisite(dependentId, prerequisiteId))
            }
            onRemoveEdge={(prerequisiteId, dependentId) =>
              void host.mutate((ws) => ws.removePrerequisite(dependentId, prerequisiteId))
            }
          />
        )}
      </div>
    </div>
  )
}
