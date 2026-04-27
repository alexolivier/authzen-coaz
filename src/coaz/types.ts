import type { z } from "zod/v4";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenMappingSchema } from "./schema.js";

export type AuthZenMapping = z.infer<typeof AuthZenMappingSchema>;

export type CoazToolDefinition = Tool & {
  coaz: true;
  inputSchema: Tool["inputSchema"] & {
    "x-authzen-mapping": AuthZenMapping;
  };
};

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<CallToolResult>;
}

export interface RegisteredTool {
  definition: CoazToolDefinition;
  handler: ToolHandler;
}
