import type { RegisteredTool } from "../coaz/types.js";

export const transferCustomer: RegisteredTool = {
  definition: {
    name: "transfer_customer",
    coaz: true,
    description: "Transfer a customer from one region to another. Requires read on source region and write on destination region. Restricted by department.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The customer identifier",
        },
        source_region: {
          type: "string",
          description: "Current region (e.g. us-west-2)",
        },
        destination_region: {
          type: "string",
          description: "Target region (e.g. eu-west-1)",
        },
      },
      required: ["customer_id", "source_region", "destination_region"],
      "x-authzen-mapping": {
        subject: {
          type: "token.role",
          id: "token.sub",
          properties: { department: "token.department" },
        },
        context: { agent: "token.client_id" },
        evaluations: [
          {
            action: { name: "'read'" },
            resource: {
              type: "'customer_region'",
              id: "params.arguments.source_region",
            },
          },
          {
            action: { name: "'write'" },
            resource: {
              type: "'customer_region'",
              id: "params.arguments.destination_region",
            },
          },
        ],
      },
    },
  },

  handler: async (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          customer_id: args.customer_id,
          status: "transferred",
          from: args.source_region,
          to: args.destination_region,
        }),
      },
    ],
  }),
};
