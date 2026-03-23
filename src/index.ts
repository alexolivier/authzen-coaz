import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createServer, type ServerConfig } from "./server.js";

const config: ServerConfig = {
  pdpUrl: process.env.PDP_URL ?? "http://localhost:3592",
  token: {
    jwksUri: process.env.JWKS_URI ?? "http://localhost:8080/.well-known/jwks.json",
    issuer: process.env.TOKEN_ISSUER ?? "http://localhost:8080",
    audience: process.env.TOKEN_AUDIENCE ?? "coaz-mcp-server",
  },
};
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = new Hono();

const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

function extractAuth(c: { req: { header: (name: string) => string | undefined } }): AuthInfo | undefined {
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) return { token: bearer, clientId: "unknown", scopes: [] };
  return undefined;
}

app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  const authInfo = extractAuth(c);

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    return transport.handleRequest(c.req.raw, { authInfo });
  }

  if (sessionId && !sessions.has(sessionId)) {
    console.log(`[MCP] Session not found: ${sessionId}`);
    return c.json({ error: "Session not found" }, 404);
  }

  console.log("[MCP] New session — creating server");
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      console.log(`[MCP] Session initialized: ${id}`);
      sessions.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      console.log(`[MCP] Session closed: ${transport.sessionId}`);
      sessions.delete(transport.sessionId);
    }
  };

  const mcpServer = await createServer(config);
  await mcpServer.connect(transport);
  return transport.handleRequest(c.req.raw, { authInfo });
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[MCP] Server listening on http://localhost:${PORT}/mcp`);
  console.log(`[MCP] PDP:    ${config.pdpUrl}`);
  console.log(`[MCP] JWKS:   ${config.token.jwksUri}`);
  console.log(`[MCP] Issuer: ${config.token.issuer}`);
});
