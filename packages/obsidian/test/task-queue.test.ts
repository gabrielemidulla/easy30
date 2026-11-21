import { describe, expect, it } from "vitest"
import { TaskQueue } from "../src/task-queue"

const gate = () => {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

describe("TaskQueue", () => {
  it("runs tasks in order even when an earlier one is slower", async () => {
    const q = new TaskQueue()
    const log: string[] = []
    const g = gate()
    const first = q.run(async () => {
      await g.promise
      log.push("first")
    })
    const second = q.run(async () => void log.push("second"))
    g.open()
    await Promise.all([first, second])
    expect(log).toEqual(["first", "second"])
  })

  it("keeps going after a failure", async () => {
    const q = new TaskQueue()
    await expect(q.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x")
    expect(await q.run(async () => 2)).toBe(2)
  })

  it("coalesces requests that arrive while a run is waiting to start", async () => {
    const q = new TaskQueue()
    let runs = 0
    const g = gate()
    const blocker = q.run(() => g.promise)
    const a = q.coalesced(async () => void runs++)
    const b = q.coalesced(async () => void runs++)
    const c = q.coalesced(async () => void runs++)
    g.open()
    await Promise.all([blocker, a, b, c])
    expect(runs).toBe(1)
    await q.coalesced(async () => void runs++)
    expect(runs).toBe(2)
  })
})
