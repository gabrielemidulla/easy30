import { Component, MarkdownRenderer } from "obsidian"
import { useEffect, useRef } from "react"
import { useHost } from "../components/host-context"

/** Renders Markdown (including LaTeX and embeds) with Obsidian's own renderer. */
export function MarkdownBlock({ markdown, sourcePath }: { markdown: string; sourcePath: string }) {
  const host = useHost()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const component = new Component()
    component.load()
    el.empty()
    void MarkdownRenderer.render(host.app, markdown, el, sourcePath, component)
    return () => {
      component.unload()
      el.empty()
    }
  }, [host, markdown, sourcePath])

  return <div className="easy30-markdown markdown-rendered" ref={ref} />
}
