import * as util from "node:util"

/** Where commands write. Injected so tests can capture output. */
export interface Io {
  out(text: string): void
  err(text: string): void
  /** Whether stdout understands ANSI colours. */
  color: boolean
}

export function processIo(): Io {
  const color =
    process.stdout.isTTY === true &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== "dumb"
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    color,
  }
}

export function line(io: Io, text = ""): void {
  io.out(`${text}\n`)
}

export type StyleName = "bold" | "dim" | "red" | "green" | "yellow" | "cyan"

export type Style = Record<StyleName, (text: string) => string>

const NAMES: StyleName[] = ["bold", "dim", "red", "green", "yellow", "cyan"]

/** Styling helpers that degrade to plain text when colour is off or unsupported. */
export function createStyle(color: boolean): Style {
  const supported = color && typeof util.styleText === "function"
  const entries = NAMES.map((name) => {
    const apply = (text: string): string => (supported ? util.styleText(name, text) : text)
    return [name, apply] as const
  })
  return Object.fromEntries(entries) as Style
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
