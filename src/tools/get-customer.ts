import type { RegisteredTool } from "../coaz/types.js";

export const getCustomer: RegisteredTool = {
  definition: {
    name: "get_customer",
    coaz: true,
    description: "Get customer details by ID",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The customer identifier",
        },
      },
      required: ["customer_id"],
      "x-coaz-mapping": {
        resource: [{ type: "customer", id: "properties.customer_id" }],
        subject: [{ type: "token.role", id: "token.sub" }],
        context: [{ agent: "token.client_id" }],
      },
    },
  },

  handler: async (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          customer_id: args.customer_id,
          name: "Acme Corp",
          tier: "enterprise",
          region: "us-west-2",
          contact: "jane@acme.com",
        }),
      },
    ],
  }),
};
