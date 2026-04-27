import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { log } from "./log.js";
import type { AuthZenClient } from "./authzen/client.js";
import { validateAuthZenMapping } from "./coaz/schema.js";
import { tools } from "./tools/registry.js";

export interface ServerConfig {
  pdpClient: AuthZenClient;
}

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

export async function createServer(config: ServerConfig): Promise<McpServer> {
  const { pdpClient } = config;

  for (const tool of tools) {
    const mapping = validateAuthZenMapping(
      tool.definition.inputSchema["x-authzen-mapping"],
    );
    if (mapping.evaluations.length > 1 && !pdpClient.supportsEvaluations) {
      throw new Error(
        `Tool "${tool.definition.name}" has multi-valued x-authzen-mapping but PDP does not support the evaluations endpoint`,
      );
    }
  }

  const mcpServer = new McpServer(
    { name: "coaz-reference", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

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
