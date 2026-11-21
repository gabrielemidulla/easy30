import { MemoryFs, Workspace } from "@easy30/core"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createServer } from "../src/index.js"

export const baseVault = () =>
  new MemoryFs({
    "Uni/Geometria/Geometria.md":
      "---\neasy30: course\nid: geometria\ntitle: Geometria\nexam: 2099-01-20\n---\n",
    "Uni/Geometria/Vettori.md":
      "---\neasy30: concept\nid: c-vec\nquestion: Cos'è un vettore?\n---\nUn elemento di uno spazio vettoriale.\n",
    "Uni/Geometria/Span.md":
      '---\neasy30: concept\nid: c-span\nrequires: ["[[Vettori]]"]\n---\nSpan.\n',
    "Uni/Geometria/appunti.md": "# Appunti\nIl determinante misura il volume.\n",
    ".easy30/secret.md": "hidden\n",
  })

export interface Harness {
  client: Client
  fs: MemoryFs
  /** Call a tool; returns the parsed JSON (or raw text) and the error flag. */
  call(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ isError: boolean; text: string; json: unknown }>
}

export async function connect(fs: MemoryFs = baseVault()): Promise<Harness> {
  const workspace = await Workspace.open(fs)
  const server = createServer(workspace)
  const client = new Client({ name: "test-client", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return {
    client,
    fs,
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args })
      const first = Array.isArray(result.content) ? result.content[0] : undefined
      const text = first && "text" in first && typeof first.text === "string" ? first.text : ""
      let json: unknown = text
      try {
        json = JSON.parse(text)
      } catch {
        // plain text result
      }
      return { isError: result.isError === true, text, json }
    },
  }
}
