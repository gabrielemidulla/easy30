import { createContext, useContext, useEffect, useRef } from "react"

export type StudyKey = "space" | "enter" | "submit" | "1" | "2" | "3" | "4" | "undo"

/** Returns true when it consumed the key. */
export type KeyHandler = (key: StudyKey) => boolean

/** Connects Obsidian's keymap `Scope` (owned by the view) to React components. */
export class KeyBridge {
  private readonly handlers = new Set<KeyHandler>()

  add(handler: KeyHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  /** Most recently mounted handler wins (the card on screen). */
  dispatch(key: StudyKey): boolean {
    for (const handler of [...this.handlers].reverse()) if (handler(key)) return true
    return false
  }
}

export const KeyBridgeContext = createContext<KeyBridge | null>(null)

export function useStudyKeys(handler: KeyHandler): void {
  const bridge = useContext(KeyBridgeContext)
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => bridge?.add((key) => latest.current(key)), [bridge])
}
