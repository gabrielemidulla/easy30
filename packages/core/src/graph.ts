/** Directed prerequisite graph. An edge `from → to` means `from` is a prerequisite of `to`. */
export class ConceptGraph {
  private readonly prereqs = new Map<string, Set<string>>()
  private readonly dependents = new Map<string, Set<string>>()

  constructor(nodes: Iterable<{ id: string; requires: readonly string[] }>) {
    for (const node of nodes) {
      this.ensure(node.id)
      for (const p of node.requires) this.addEdge(p, node.id)
    }
  }

  private ensure(id: string): void {
    if (!this.prereqs.has(id)) this.prereqs.set(id, new Set())
    if (!this.dependents.has(id)) this.dependents.set(id, new Set())
  }

  private addEdge(from: string, to: string): void {
    this.ensure(from)
    this.ensure(to)
    this.prereqs.get(to)?.add(from)
    this.dependents.get(from)?.add(to)
  }

  has(id: string): boolean {
    return this.prereqs.has(id)
  }

  nodes(): string[] {
    return [...this.prereqs.keys()]
  }

  prerequisitesOf(id: string): string[] {
    return [...(this.prereqs.get(id) ?? [])]
  }

  dependentsOf(id: string): string[] {
    return [...(this.dependents.get(id) ?? [])]
  }

  ancestors(id: string): Set<string> {
    return this.reach(id, this.prereqs)
  }

  descendants(id: string): Set<string> {
    return this.reach(id, this.dependents)
  }

  /** Would adding `from → to` create a cycle (or a self-loop)? */
  wouldCycle(from: string, to: string): boolean {
    return from === to || this.descendants(to).has(from)
  }

  /** Concept ids that sit on (or behind) a cycle, so callers can report broken notes. */
  cyclicNodes(): Set<string> {
    return new Set(this.kahn(new Set(this.nodes())).blocked)
  }

  /**
   * Prerequisites first (Kahn's algorithm). Ties keep insertion order so the result
   * is stable. Nodes blocked by a cycle are appended at the end.
   */
  topologicalOrder(subset?: Iterable<string>): string[] {
    const { order, blocked } = this.kahn(new Set(subset ?? this.nodes()))
    return [...order, ...blocked]
  }

  private kahn(scope: Set<string>): { order: string[]; blocked: string[] } {
    const indegree = new Map<string, number>()
    for (const n of scope) {
      indegree.set(n, this.prerequisitesOf(n).filter((p) => scope.has(p)).length)
    }
    const order = [...scope].filter((n) => indegree.get(n) === 0)
    for (let i = 0; i < order.length; i++) {
      for (const d of this.dependents.get(order[i] as string) ?? []) {
        if (!scope.has(d)) continue
        const left = (indegree.get(d) ?? 0) - 1
        indegree.set(d, left)
        if (left === 0) order.push(d)
      }
    }
    const placed = new Set(order)
    return { order, blocked: [...scope].filter((n) => !placed.has(n)) }
  }

  /** Longest-path depth from a root (0 = no prerequisites). Cycles are cut. */
  depths(): Map<string, number> {
    const depth = new Map<string, number>()
    for (const n of this.topologicalOrder()) {
      let d = 0
      for (const p of this.prerequisitesOf(n)) {
        const pd = depth.get(p)
        if (pd !== undefined) d = Math.max(d, pd + 1)
      }
      depth.set(n, d)
    }
    return depth
  }

  private reach(start: string, edges: Map<string, Set<string>>): Set<string> {
    const seen = new Set<string>()
    const stack = [...(edges.get(start) ?? [])]
    while (stack.length > 0) {
      const n = stack.pop() as string
      if (seen.has(n)) continue
      seen.add(n)
      for (const next of edges.get(n) ?? []) stack.push(next)
    }
    seen.delete(start)
    return seen
  }
}
