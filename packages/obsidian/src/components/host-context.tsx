import { createContext, type ReactNode, useContext, useSyncExternalStore } from "react"
import type { Easy30Host } from "../host"

const HostContext = createContext<Easy30Host | null>(null)

export function HostProvider({ host, children }: { host: Easy30Host; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>
}

export function useHost(): Easy30Host {
  const host = useContext(HostContext)
  if (!host) throw new Error("useHost must be used inside a HostProvider")
  return host
}

/** Re-render whenever the workspace changes; returns the current version number. */
export function useHostVersion(): number {
  const host = useHost()
  return useSyncExternalStore(host.subscribe, () => host.version)
}
