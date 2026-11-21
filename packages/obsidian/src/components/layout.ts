import ELK from "elkjs/lib/elk.bundled.js"
import { type FlowEdge, NODE_HEIGHT, NODE_WIDTH } from "./flow-model"

export interface Point {
  x: number
  y: number
}

const elk = new ELK()

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.layered.spacing.edgeNodeBetweenLayers": "28",
  "elk.spacing.nodeNode": "28",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.componentComponent": "48",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.cycleBreaking.strategy": "GREEDY",
  "elk.separateConnectedComponents": "true",
}

/** Layered top-down layout: prerequisites above their dependents. */
export async function layoutGraph(
  nodeIds: readonly string[],
  edges: readonly FlowEdge[],
): Promise<Map<string, Point>> {
  const known = new Set(nodeIds)
  const result = await elk.layout({
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodeIds.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges
      .filter((e) => known.has(e.source) && known.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  })
  const positions = new Map<string, Point>()
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }
  return positions
}
