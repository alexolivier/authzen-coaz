import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

interface StaticReferenceResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => string;
}

const STATIC_RESOURCES: StaticReferenceResource[] = [
  {
    uri: "doc://public/readme",
    name: "public-readme",
    description: "Public README for the COAZ reference server.",
    mimeType: "text/markdown",
    read: () => "# COAZ Reference Server\n\nPublic documentation accessible to any authenticated identity.",
  },
  {
    uri: "doc://internal/runbook",
    name: "internal-runbook",
    description: "Internal operations runbook (restricted to operators).",
    mimeType: "text/markdown",
    read: () => "# Internal Runbook\n\nOn-call procedures. Internal only.",
  },
  {
    uri: "customers://index",
    name: "customers-index",
    description: "Index of customer records.",
    mimeType: "application/json",
    read: () =>
      JSON.stringify([
        { id: "cust-123", name: "Acme Corp", region: "us-west-2" },
        { id: "cust-456", name: "Globex", region: "eu-west-1" },
      ]),
  },
];

const CUSTOMER_RECORDS: Record<string, Record<string, unknown>> = {
  "cust-123": { id: "cust-123", name: "Acme Corp", tier: "enterprise", region: "us-west-2" },
  "cust-456": { id: "cust-456", name: "Globex", tier: "standard", region: "eu-west-1" },
};

export function registerReferenceResources(mcpServer: McpServer): void {
  for (const r of STATIC_RESOURCES) {
    mcpServer.registerResource(
      r.name,
      r.uri,
      { description: r.description, mimeType: r.mimeType },
      async () => ({
        contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.read() }],
      }),
    );
  }

  mcpServer.registerResource(
    "customer-record",
    new ResourceTemplate("customer://{id}", {
      list: async () => ({
        resources: Object.keys(CUSTOMER_RECORDS).map((id) => ({
          uri: `customer://${id}`,
          name: `customer-${id}`,
          description: `Customer record for ${id}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Customer record by ID. AuthZEN check is per-URI (e.g. customer://cust-123).",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const record = CUSTOMER_RECORDS[id];
      const text = record ? JSON.stringify(record) : JSON.stringify({ error: `Unknown customer ${id}` });
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text }],
      };
    },
  );
}
