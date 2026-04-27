import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerReferencePrompts(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "summarize_customer",
    {
      description: "Generate a one-paragraph summary of a customer record.",
      argsSchema: {
        customer_id: z.string().describe("The customer identifier"),
      },
    },
    ({ customer_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarize the customer record for ${customer_id} in a single paragraph.`,
          },
        },
      ],
    }),
  );

  mcpServer.registerPrompt(
    "incident_report",
    {
      description: "Draft an incident report (restricted to operators).",
      argsSchema: {
        incident_id: z.string().describe("The incident identifier"),
      },
    },
    ({ incident_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Draft an internal incident report for ${incident_id}, including timeline, impact, and remediation.`,
          },
        },
      ],
    }),
  );
}
