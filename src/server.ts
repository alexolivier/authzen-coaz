import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AuthZenClient } from "./authzen/client.js";
import { verifyAndExtractClaims, type TokenValidationConfig } from "./auth/token.js";
import { enforceCoaz } from "./coaz/pep.js";
import { tools } from "./tools/registry.js";
import type { AuthZenMapping } from "./coaz/types.js";

export interface ServerConfig {
  pdpUrl: string;
  token: TokenValidationConfig;
}

function toolRequiresEvaluations(mapping: AuthZenMapping): boolean {
  return mapping.evaluations.length > 1;
}

export async function createServer(config: ServerConfig): Promise<McpServer> {
  const mcpServer = new McpServer(
    { name: "coaz-reference", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  const pdpClient = new AuthZenClient(config.pdpUrl);
  await pdpClient.discover();

  for (const tool of tools) {
    if (tool.definition.coaz) {
      const mapping = tool.definition.inputSchema["x-authzen-mapping"];
      if (toolRequiresEvaluations(mapping) && !pdpClient.supportsEvaluations) {
        throw new Error(
          `Tool "${tool.definition.name}" has multi-valued x-authzen-mapping but PDP does not support the evaluations endpoint`,
        );
      }
    }

    const inputProps: Record<string, z.ZodTypeAny> = {};
    const schemaDef = tool.definition.inputSchema;
    for (const [key, prop] of Object.entries(schemaDef.properties ?? {})) {
      const p = prop as { type?: string };
      inputProps[key] =
        p.type === "string" ? z.string() : z.unknown();
      if (!schemaDef.required?.includes(key)) {
        inputProps[key] = inputProps[key].optional();
      }
    }

    mcpServer.registerTool(
      tool.definition.name,
      {
        description: tool.definition.description,
        inputSchema: inputProps,
      },
      async (args, extra) => {
        const toolCallArgs = (args ?? {}) as Record<string, unknown>;
        console.log(`\n[TOOL] ${tool.definition.name} called with args:`, JSON.stringify(toolCallArgs));

        if (tool.definition.coaz) {
          const bearer = extra.authInfo?.token;
          if (!bearer) {
            console.log("[TOOL] No bearer token present — rejecting");
            throw new McpError(ErrorCode.InvalidRequest, "Missing access token");
          }

          let tokenClaims: Record<string, unknown>;
          try {
            tokenClaims = await verifyAndExtractClaims(bearer, config.token);
          } catch (err) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          await enforceCoaz(tool.definition, toolCallArgs, tokenClaims, pdpClient);
        }

        return tool.handler(toolCallArgs);
      },
    );
  }

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => {
      const def = t.definition;
      return {
        name: def.name,
        coaz: def.coaz,
        description: def.description,
        inputSchema: def.inputSchema,
      };
    }),
  }));

  return mcpServer;
}
