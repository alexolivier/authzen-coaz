import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { log } from "./log.js";
import { tools } from "./tools/registry.js";
import { registerReferenceResources } from "./resources/registry.js";
import { registerReferencePrompts } from "./prompts/registry.js";

function jsonSchemaToZodShape(
  schema: Tool["inputSchema"],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const type = (prop as { type?: string }).type;
    let field: z.ZodTypeAny = type === "string" ? z.string() : z.unknown();
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }
  return shape;
}

export async function createServer(): Promise<McpServer> {
  const mcpServer = new McpServer(
    { name: "coaz-reference", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerReferenceResources(mcpServer);
  registerReferencePrompts(mcpServer);

  for (const tool of tools) {
    mcpServer.registerTool(
      tool.definition.name,
      {
        description: tool.definition.description,
        inputSchema: jsonSchemaToZodShape(tool.definition.inputSchema),
      },
      async (args) => {
        const toolCallArgs = (args ?? {}) as Record<string, unknown>;
        log("TOOL", `${tool.definition.name} called`, toolCallArgs);
        return tool.handler(toolCallArgs);
      },
    );
  }

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.definition.name,
      coaz: t.definition.coaz,
      description: t.definition.description,
      inputSchema: t.definition.inputSchema,
    })),
  }));

  return mcpServer;
}
