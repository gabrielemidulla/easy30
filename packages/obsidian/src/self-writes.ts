import type { FileInfo, VaultFs } from "@easy30/core"

/** Remembers the modification time of every file the plugin itself last wrote, so the
 * vault watcher can ignore the echo of our own writes (core already re-indexed after them)
 * while still reacting to any later, external change (whose mtime differs). */
export class SelfWrites {
  private readonly known = new Map<string, number | null>()

  record(path: string, mtime: number | null): void {
    this.known.set(path, mtime)
  }

  /** Is `mtime` (`null` = file gone) exactly what our own last write left behind? */
  isOwn(path: string, mtime: number | null): boolean {
    return this.known.has(path) && this.known.get(path) === mtime
  }
}

/** `VaultFs` decorator that records the resulting mtime of each path it touches. */
export class TrackedFs implements VaultFs {
  constructor(
    private readonly inner: VaultFs,
    private readonly writes: SelfWrites,
  ) {}

  private async track(path: string): Promise<void> {
    this.writes.record(path, await this.inner.mtime(path))
  }

  read(path: string): Promise<string | null> {
    return this.inner.read(path)
  }

  listMarkdown(): Promise<FileInfo[]> {
    return this.inner.listMarkdown()
  }

  mtime(path: string): Promise<number | null> {
    return this.inner.mtime(path)
  }

  async create(path: string, content: string): Promise<void> {
    await this.inner.create(path, content)
    await this.track(path)
  }

  async update(path: string, fn: (current: string) => string): Promise<void> {
    await this.inner.update(path, fn)
    await this.track(path)
  }

  async write(path: string, content: string): Promise<void> {
    await this.inner.write(path, content)
    await this.track(path)
  }

  async append(path: string, content: string): Promise<void> {
    await this.inner.append(path, content)
    await this.track(path)
  }

  async rename(from: string, to: string): Promise<void> {
    await this.inner.rename(from, to)
    await this.track(from)
    await this.track(to)
  }

  async remove(path: string): Promise<void> {
    await this.inner.remove(path)
    await this.track(path)
  }
}
