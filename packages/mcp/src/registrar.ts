import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import type { ServerContext } from "./context.js"
import { errorResult, jsonResult } from "./results.js"

export interface ToolSpec<Shape extends z.ZodRawShape> {
  title: string
  description: string
  input: Shape
  /** Defaults to false. Read-only tools never change the vault. */
  readOnly?: boolean
  destructive?: boolean
}

type Handler<Shape extends z.ZodRawShape> = (
  args: z.infer<z.ZodObject<Shape>>,
  ctx: ServerContext,
) => Promise<unknown>

export type Registrar = <Shape extends z.ZodRawShape>(
  name: string,
  spec: ToolSpec<Shape>,
  handler: Handler<Shape>,
) => void

/**
 * Registers tools with the behaviour every Easy30 tool shares: the workspace is
 * refreshed before the handler runs (files change under us), results are compact JSON,
 * and any thrown error becomes an `isError` result instead of a protocol failure.
 */
export function createRegistrar(server: McpServer, ctx: ServerContext): Registrar {
  return (name, spec, handler) => {
    const annotations: ToolAnnotations = {
      title: spec.title,
      readOnlyHint: spec.readOnly ?? false,
      destructiveHint: spec.destructive ?? false,
      openWorldHint: false,
    }
    const schema = z.object(spec.input)
    server.registerTool(
      name,
      { title: spec.title, description: spec.description, inputSchema: schema, annotations },
      async (rawArgs: unknown): Promise<CallToolResult> => {
        try {
          await ctx.workspace.refresh()
          const result = await handler(schema.parse(rawArgs), ctx)
          return isToolResult(result) ? result : jsonResult(result)
        } catch (error) {
          return errorResult(error)
        }
      },
    )
  }
}

function isToolResult(value: unknown): value is CallToolResult {
  return typeof value === "object" && value !== null && "content" in value
}
