import { Handle, type Node, type NodeProps, Position } from "@xyflow/react"
import { memo } from "react"
import type { ConceptNodeData } from "./flow-model"

export type ConceptFlowNode = Node<ConceptNodeData, "concept">

function classNames(data: ConceptNodeData): string {
  return [
    "easy30-node",
    `is-${data.mastery}`,
    data.inferred !== null && "is-inferred",
    data.ready && "is-ready",
    data.external && "is-external",
    data.dimmed && "is-dimmed",
  ]
    .filter(Boolean)
    .join(" ")
}

function ImportanceDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="easy30-dots" role="img" aria-label={`Importance ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= level ? "easy30-dot is-on" : "easy30-dot"} />
      ))}
    </span>
  )
}

function ConceptNodeView({ data }: NodeProps<ConceptFlowNode>) {
  return (
    <div className={classNames(data)}>
      <Handle type="target" position={Position.Top} className="easy30-handle" />
      <div className="easy30-node-title" title={data.title}>
        {data.title}
      </div>
      <div className="easy30-node-meta">
        <ImportanceDots level={data.importance} />
        {data.external && data.courseId !== null && (
          <span className="easy30-node-course">{data.courseId}</span>
        )}
        {data.inferred !== null && (
          <span className="easy30-node-tag">
            {data.inferred === "known" ? "probably known" : "probably unknown"}
          </span>
        )}
      </div>
      {data.due && <span className="easy30-due-badge">due</span>}
      <Handle type="source" position={Position.Bottom} className="easy30-handle" />
    </div>
  )
}

export const ConceptNode = memo(ConceptNodeView)
