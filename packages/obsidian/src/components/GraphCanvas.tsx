import {
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type ConceptFlowNode, ConceptNode } from "./ConceptNode"
import { type ConceptNodeData, type FlowModel, relatives, withHover } from "./flow-model"
import { layoutGraph, type Point } from "./layout"

const NODE_TYPES = { concept: ConceptNode }
const FIT_OPTIONS = { padding: 0.15, maxZoom: 1 }

interface Layout {
  signature: string
  positions: Map<string, Point>
}

export interface GraphCanvasProps {
  model: FlowModel
  onOpenNode: (node: ConceptNodeData) => void
  onNodeMenu: (event: MouseEvent, node: ConceptNodeData) => void
  /** Drag from a prerequisite's handle to a dependent. */
  onConnect: (prerequisiteId: string, dependentId: string) => void
  onRemoveEdge: (prerequisiteId: string, dependentId: string) => void
}

/** Recompute the layout only when the set of nodes/edges changes (the signature). */
function useLayout(model: FlowModel): Layout {
  const latest = useRef(model)
  latest.current = model
  return useMemo<Layout>(() => {
    const { nodes, edges } = latest.current
    return {
      signature: model.signature,
      positions: layoutGraph(
        nodes.map((n) => n.conceptId),
        edges,
      ),
    }
  }, [model.signature])
}

function GraphFlow({ model, onOpenNode, onNodeMenu, onConnect, onRemoveEdge }: GraphCanvasProps) {
  const layout = useLayout(model)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const related = useMemo(
    () => (hovered === null ? null : relatives(model.edges, hovered)),
    [model.edges, hovered],
  )

  const nodes = useMemo<ConceptFlowNode[]>(() => {
    return withHover(model, hovered).flatMap((data) => {
      const position = layout.positions.get(data.conceptId)
      return position
        ? [{ id: data.conceptId, type: "concept" as const, position, data, draggable: false }]
        : []
    })
  }, [layout, model, hovered])

  const edges = useMemo<Edge[]>(
    () =>
      model.edges
        .filter((e) => layout.positions.has(e.source) && layout.positions.has(e.target))
        .map((e) => {
          const selected = e.id === selectedEdge
          const inFocus = (id: string) => id === hovered || related?.has(id) === true
          const highlighted = hovered !== null && inFocus(e.source) && inFocus(e.target)
          const dimmed = hovered !== null && !highlighted
          const color = selected || highlighted ? "var(--interactive-accent)" : "var(--text-faint)"
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            type: "smoothstep",
            selected,
            focusable: true,
            className: [
              "easy30-edge",
              selected && "is-selected",
              highlighted && "is-highlighted",
              dimmed && "is-dimmed",
            ]
              .filter(Boolean)
              .join(" "),
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          }
        }),
    [model.edges, layout, selectedEdge, hovered, related],
  )

  const handleConnect = useCallback(
    (c: Connection) => {
      if (c.source !== c.target) onConnect(c.source, c.target)
    },
    [onConnect],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (selectedEdge === null || (event.key !== "Delete" && event.key !== "Backspace")) return
      const edge = model.edges.find((e) => e.id === selectedEdge)
      if (!edge) return
      event.preventDefault()
      setSelectedEdge(null)
      onRemoveEdge(edge.source, edge.target)
    },
    [selectedEdge, model.edges, onRemoveEdge],
  )

  // Drop a selection whose edge disappeared (e.g. after removing it).
  useEffect(() => {
    if (selectedEdge !== null && !model.edges.some((e) => e.id === selectedEdge)) {
      setSelectedEdge(null)
    }
  }, [model.edges, selectedEdge])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard handler for edge deletion
    <div className="easy30-flow-wrap" ref={wrapperRef} tabIndex={-1} onKeyDown={handleKeyDown}>
      <ReactFlow<ConceptFlowNode>
        className="easy30-flow"
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.1}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable
        elementsSelectable
        connectionMode={ConnectionMode.Strict}
        connectionRadius={28}
        deleteKeyCode={null}
        onNodeClick={(_, node) => onOpenNode(node.data)}
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          onNodeMenu(event.nativeEvent, node.data)
        }}
        onConnect={handleConnect}
        isValidConnection={(c) => c.source !== c.target}
        onEdgeClick={(_, edge) => {
          setSelectedEdge(edge.id)
          wrapperRef.current?.focus()
        }}
        onPaneClick={() => setSelectedEdge(null)}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphFlow {...props} />
    </ReactFlowProvider>
  )
}
