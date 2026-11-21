function parse(version: string): { core: number[]; pre: string | null } {
  const [main = "", ...rest] = version.trim().replace(/^v/, "").split("+")[0]?.split("-") ?? []
  const core = main.split(".").map((p) => Number.parseInt(p, 10) || 0)
  while (core.length < 3) core.push(0)
  return { core, pre: rest.length > 0 ? rest.join("-") : null }
}

/**
 * Compare two semantic versions: negative, zero or positive. Build metadata is ignored and a
 * pre-release sorts below its release. Pre-release identifiers compare as plain strings.
 */
export function compareSemver(a: string, b: string): number {
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0)
    if (d !== 0) return d
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre < y.pre ? -1 : 1
}
