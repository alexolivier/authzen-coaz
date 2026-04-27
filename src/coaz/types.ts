import type { z } from "zod/v4";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenMappingSchema } from "./schema.js";

export type AuthZenMapping = z.infer<typeof AuthZenMappingSchema>;

export type CoazTool = Tool & {
  coaz: true;
  inputSchema: Tool["inputSchema"] & {
    "x-authzen-mapping": AuthZenMapping;
  };
};

export interface RegisteredTool {
  definition: CoazTool;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}
