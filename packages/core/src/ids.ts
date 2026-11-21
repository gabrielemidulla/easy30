const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz" // Crockford base32, lowercase

function randomChars(length: number): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ""
  for (const b of bytes) out += ALPHABET[b % 32]
  return out
}

export const newConceptId = (): string => `c-${randomChars(8)}`
export const newTestId = (): string => `t-${randomChars(8)}`
/** Log entry ids are time-prefixed so they sort chronologically. */
export const newEntryId = (now: Date = new Date()): string =>
  `r-${now.getTime().toString(36)}${randomChars(4)}`

/** `"Algebra Lineare & Geometria"` → `"algebra-lineare-geometria"`. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || "course"
}

/** Characters Obsidian (and common file systems) reject in file names. */
export function safeFileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}
