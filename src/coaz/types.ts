import type { z } from "zod/v4";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { CoazMappingSchema } from "./schema.js";

export type CoazMapping = z.infer<typeof CoazMappingSchema>;

export type CoazToolDefinition = Tool & {
  coaz: true;
  inputSchema: Tool["inputSchema"] & {
    properties: Record<string, unknown>;
    "x-coaz-mapping": CoazMapping;
  };
};

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<CallToolResult>;
}

export interface RegisteredTool {
  definition: CoazToolDefinition;
  handler: ToolHandler;
}
