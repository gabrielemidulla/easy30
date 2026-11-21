import type { CourseView, Inference, Mastery } from "@easy30/core"

export const NODE_WIDTH = 188
export const NODE_HEIGHT = 56

/** Plain data carried by every graph node (a `type` alias so it satisfies React Flow's
 * `Record<string, unknown>` constraint). */
export type ConceptNodeData = {
  conceptId: string
  path: string
  title: string
  courseId: string | null
  mastery: Mastery
  inferred: Inference
  ready: boolean
  external: boolean
  importance: 1 | 2 | 3
  due: boolean
  /** Faded because another node is hovered and this one is unrelated to it. */
  dimmed: boolean
}

export interface FlowEdge {
  id: string
  /** Prerequisite. */
  source: string
  /** Dependent. */
  target: string
}

export interface FlowModel {
  nodes: ConceptNodeData[]
  edges: FlowEdge[]
  /** Changes only when the set of nodes or edges changes: the layout cache key. */
  signature: string
}

export interface CourseSummary {
  total: number
  unknown: number
  red: number
  orange: number
  green: number
  ready: number
  due: number
}

export function edgeId(from: string, to: string): string {
  return `${from}->${to}`
}

function isDue(due: Date | null, now: Date): boolean {
  return due !== null && due.getTime() <= now.getTime()
}

export function toFlowModel(view: CourseView, now: Date = new Date()): FlowModel {
  const ready = new Set(view.readyToLearn)
  const nodes: ConceptNodeData[] = view.concepts.map((c) => ({
    conceptId: c.id,
    path: c.path,
    title: c.title,
    courseId: c.courseId,
    mastery: c.state.mastery,
    inferred: c.state.inferred,
    ready: !c.external && ready.has(c.id),
    external: c.external,
    importance: c.importance,
    due: !c.external && isDue(c.state.due, now),
    dimmed: false,
  }))
  const edges: FlowEdge[] = view.edges.map((e) => ({
    id: edgeId(e.from, e.to),
    source: e.from,
    target: e.to,
  }))
  const signature = [
    ...nodes.map((n) => n.conceptId).sort(),
    "|",
    ...edges.map((e) => e.id).sort(),
  ].join(",")
  return { nodes, edges, signature }
}

export function summarize(model: FlowModel): CourseSummary {
  const own = model.nodes.filter((n) => !n.external)
  const count = (m: Mastery) => own.filter((n) => n.mastery === m).length
  return {
    total: own.length,
    unknown: count("unknown"),
    red: count("red"),
    orange: count("orange"),
    green: count("green"),
    ready: own.filter((n) => n.ready).length,
    due: own.filter((n) => n.due).length,
  }
}

/** Every transitive prerequisite and dependent of `id` (excluding `id` itself). */
export function relatives(edges: readonly FlowEdge[], id: string): Set<string> {
  const walk = (start: string, next: (e: FlowEdge) => [string, string]): Set<string> => {
    const seen = new Set<string>()
    const stack = [start]
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) break
      for (const e of edges) {
        const [from, to] = next(e)
        if (from === current && !seen.has(to) && to !== start) {
          seen.add(to)
          stack.push(to)
        }
      }
    }
    return seen
  }
  const ancestors = walk(id, (e) => [e.target, e.source])
  const descendants = walk(id, (e) => [e.source, e.target])
  return new Set([...ancestors, ...descendants])
}

/** Apply hover emphasis: everything unrelated to `hoveredId` is dimmed. */
export function withHover(model: FlowModel, hoveredId: string | null): ConceptNodeData[] {
  if (hoveredId === null) return model.nodes
  const related = relatives(model.edges, hoveredId)
  return model.nodes.map((n) => ({
    ...n,
    dimmed: n.conceptId !== hoveredId && !related.has(n.conceptId),
  }))
}
