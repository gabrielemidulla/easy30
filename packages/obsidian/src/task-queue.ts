/** Runs async tasks strictly one after another; a task's failure never blocks the next. */
export class TaskQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private pendingCoalesced: Promise<void> | null = null

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => undefined)
    return result
  }

  /** Like `run`, but while an earlier call with the same intent is still waiting to start,
   * further calls share it: one run covers every request that arrived before it began. */
  coalesced(task: () => Promise<void>): Promise<void> {
    if (this.pendingCoalesced) return this.pendingCoalesced
    const promise = this.run(() => {
      this.pendingCoalesced = null
      return task()
    })
    this.pendingCoalesced = promise
    return promise
  }
}
