export type Listener = () => void

/** Minimal synchronous event emitter used to tell views the workspace changed. */
export class Emitter {
  private readonly listeners = new Set<Listener>()

  /** Arrow property so it can be passed straight to `useSyncExternalStore`. */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
