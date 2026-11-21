import { ConceptGraph } from "@easy30/core"
import { type FlowEdge, NODE_HEIGHT, NODE_WIDTH } from "./flow-model"

export interface Point {
  x: number
  y: number
}

const COLUMN_PITCH = NODE_WIDTH + 28
const ROW_PITCH = NODE_HEIGHT + 72
const COMPONENT_GAP = 48
/** Down+up barycenter passes; more rarely pays off for study-sized graphs. */
const SWEEPS = 4

interface Component {
  /** Node indexes grouped by layer; order within a layer is refined by the sweeps. */
  layers: number[][]
}

/**
 * Layered top-down layout: prerequisites above their dependents. Layers are longest-path
 * depths (nodes on cycles come last, as in core), order within layers is refined with a few
 * barycenter sweeps, and each layer is centred. Disconnected components sit side by side.
 * Pure and synchronous: ~10 ms for 500 nodes.
 */
export function layoutGraph(
  nodeIds: readonly string[],
  edges: readonly FlowEdge[],
): Map<string, Point> {
  const index = new Map<string, number>()
  for (const id of nodeIds) if (!index.has(id)) index.set(id, index.size)
  const ids = [...index.keys()]

  const prereqs: number[][] = ids.map(() => [])
  const dependents: number[][] = ids.map(() => [])
  const requires = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    const from = index.get(e.source)
    const to = index.get(e.target)
    if (from === undefined || to === undefined || from === to) continue
    prereqs[to]?.push(from)
    dependents[from]?.push(to)
    requires.get(e.target)?.push(e.source)
  }

  const depths = new ConceptGraph(
    ids.map((id) => ({ id, requires: requires.get(id) ?? [] })),
  ).depths()
  const depthOf = ids.map((id) => depths.get(id) ?? 0)
  const componentOf = connectedComponents(ids.length, prereqs, dependents)

  const components = buildComponents(componentOf, depthOf)
  const positions = new Map<string, Point>()
  let offset = 0
  for (const component of components) {
    orderLayers(component, prereqs, dependents)
    const width = Math.max(...component.layers.map((l) => l.length)) * COLUMN_PITCH
    component.layers.forEach((layer, row) => {
      const start = offset + (width - layer.length * COLUMN_PITCH) / 2
      layer.forEach((node, i) => {
        positions.set(ids[node] as string, { x: start + i * COLUMN_PITCH, y: row * ROW_PITCH })
      })
    })
    offset += width + COMPONENT_GAP
  }
  return positions
}

function connectedComponents(
  count: number,
  prereqs: readonly number[][],
  dependents: readonly number[][],
): number[] {
  const component = new Array<number>(count).fill(-1)
  let next = 0
  for (let start = 0; start < count; start++) {
    if (component[start] !== -1) continue
    const stack = [start]
    component[start] = next
    while (stack.length > 0) {
      const node = stack.pop() as number
      for (const n of [...(prereqs[node] ?? []), ...(dependents[node] ?? [])]) {
        if (component[n] !== -1) continue
        component[n] = next
        stack.push(n)
      }
    }
    next++
  }
  return component
}

function buildComponents(componentOf: readonly number[], depthOf: readonly number[]): Component[] {
  const byComponent = new Map<number, number[]>()
  componentOf.forEach((c, node) => {
    const list = byComponent.get(c)
    if (list) list.push(node)
    else byComponent.set(c, [node])
  })
  return [...byComponent.values()].map((nodes) => {
    const min = Math.min(...nodes.map((n) => depthOf[n] ?? 0))
    const layers: number[][] = []
    for (const node of nodes) {
      const depth = (depthOf[node] ?? 0) - min
      const layer = layers[depth] ?? []
      layer.push(node)
      layers[depth] = layer
    }
    // Depths are contiguous within a connected component, but stay defensive.
    return { layers: layers.filter((l) => l !== undefined) }
  })
}

/** Reorder each layer by the mean slot of its neighbours, sweeping down then up. */
function orderLayers(
  component: Component,
  prereqs: readonly number[][],
  dependents: readonly number[][],
): void {
  const { layers } = component
  if (layers.length < 2) return
  const slot = new Map<number, number>()
  const record = (layer: number[]) => {
    const centre = (layer.length - 1) / 2
    layer.forEach((node, i) => {
      slot.set(node, i - centre)
    })
  }
  for (const layer of layers) record(layer)

  const reorder = (layer: number[], neighbours: readonly number[][]) => {
    const keyed = layer.map((node, i) => {
      const adjacent = neighbours[node] ?? []
      let sum = 0
      for (const n of adjacent) sum += slot.get(n) ?? 0
      const key = adjacent.length > 0 ? sum / adjacent.length : (slot.get(node) ?? i)
      return { node, key, i }
    })
    keyed.sort((a, b) => a.key - b.key || a.i - b.i)
    keyed.forEach((k, i) => {
      layer[i] = k.node
    })
    record(layer)
  }

  for (let pass = 0; pass < SWEEPS; pass++) {
    for (let l = 1; l < layers.length; l++) reorder(layers[l] as number[], prereqs)
    for (let l = layers.length - 2; l >= 0; l--) reorder(layers[l] as number[], dependents)
  }
}
