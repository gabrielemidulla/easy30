import { requestUrl } from "obsidian"
import type { Transport } from "./ai"

/** Obsidian's `requestUrl` bypasses CORS, which browsers' fetch would hit for local servers. */
export const obsidianTransport: Transport = async (request) => {
  const response = await requestUrl({
    url: request.url,
    method: "POST",
    headers: request.headers,
    body: request.body,
    throw: false,
  })
  return { status: response.status, text: response.text }
}
