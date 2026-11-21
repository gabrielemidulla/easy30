/** Parse a wikilink like `[[folder/Note#Heading|Alias]]` into its target (`folder/Note`).
 * Bare strings (`folder/Note`, `Note.md`) are accepted too. Returns `null` for empty input. */
export function linkTarget(raw: string): string | null {
  let text = raw.trim()
  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(text)
  if (wiki?.[1]) text = wiki[1]
  text = text.split("|")[0] ?? ""
  text = text.split("#")[0] ?? ""
  text = text.trim().replace(/\.md$/i, "")
  return text === "" ? null : text
}

export function toWikilink(target: string): string {
  return `[[${target}]]`
}
