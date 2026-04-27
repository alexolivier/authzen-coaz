import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createServer, type ServerConfig } from "./server.js";
import { AuthZenClient } from "./authzen/client.js";
import { verifyAndExtractClaims, type TokenValidationConfig } from "./auth/token.js";
import { getDefaultMapping } from "./coaz/default-mappings.js";
import { enforceMapping } from "./coaz/pep.js";
import { tools } from "./tools/registry.js";

const tokenConfig: TokenValidationConfig = {
  jwksUri: process.env.JWKS_URI ?? "http://localhost:8080/.well-known/jwks.json",
  issuer: process.env.TOKEN_ISSUER ?? "http://localhost:8080",
  audience: process.env.TOKEN_AUDIENCE ?? "coaz-mcp-server",
};
const PDP_URL = process.env.PDP_URL ?? "http://localhost:3592";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const pdpClient = new AuthZenClient(PDP_URL);
await pdpClient.discover();

const serverConfig: ServerConfig = { pdpClient, token: tokenConfig };

const app = new Hono();
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

function isCoazToolCall(method: string, params: unknown): boolean {
  if (method !== "tools/call") return false;
  const name = (params as { name?: unknown } | null | undefined)?.name;
  if (typeof name !== "string") return false;
  const tool = tools.find((t) => t.definition.name === name);
  return tool?.definition.coaz === true;
}

async function authorizeMessage(
  msg: JsonRpcMessage,
  authInfo: AuthInfo | undefined,
): Promise<void> {
  if (msg.id === undefined || msg.id === null) return;
  if (typeof msg.method !== "string") return;

  const mapping = getDefaultMapping(msg.method);
  if (!mapping) return;

  if (isCoazToolCall(msg.method, msg.params)) return;

  if (!authInfo?.token) {
    throw new McpError(-32401, "Missing access token");
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyAndExtractClaims(authInfo.token, tokenConfig);
  } catch (err) {
    throw new McpError(
      -32401,
      `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await enforceMapping(
    mapping,
    msg.method,
    (msg.params ?? {}) as Record<string, unknown>,
    claims,
    pdpClient,
    `method "${msg.method}"`,
  );
}

function jsonRpcError(id: unknown, err: McpError): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: err.code, message: err.message },
  };
}

async function authorizeOne(
  msg: JsonRpcMessage,
  authInfo: AuthInfo | undefined,
): Promise<Record<string, unknown> | undefined> {
  try {
    await authorizeMessage(msg, authInfo);
    return undefined;
  } catch (err) {
    if (err instanceof McpError) return jsonRpcError(msg.id, err);
    throw err;
  }
}

async function interceptAuthorization(
  body: unknown,
  authInfo: AuthInfo | undefined,
): Promise<Record<string, unknown> | unknown[] | undefined> {
  if (Array.isArray(body)) {
    const responses: unknown[] = [];
    for (const raw of body) {
      if (typeof raw !== "object" || raw === null) continue;
      const errorResponse = await authorizeOne(raw as JsonRpcMessage, authInfo);
      if (errorResponse) responses.push(errorResponse);
    }
    return responses.length > 0 ? responses : undefined;
  }

  if (typeof body !== "object" || body === null) return undefined;
  return authorizeOne(body as JsonRpcMessage, authInfo);
}

app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const authInfo: AuthInfo | undefined = bearer
    ? { token: bearer, clientId: "unknown", scopes: [] }
    : undefined;

  if (c.req.method === "POST") {
    let body: unknown;
    try {
      body = await c.req.raw.clone().json();
    } catch {
      body = undefined;
    }

    if (body !== undefined) {
      const errorResponse = await interceptAuthorization(body, authInfo);
      if (errorResponse) return c.json(errorResponse, 200);
    }
  }

  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      console.log(`[MCP] Session not found: ${sessionId}`);
      return c.json({ error: "Session not found" }, 404);
    }
    return transport.handleRequest(c.req.raw, { authInfo });
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

  const mcpServer = await createServer(serverConfig);
  await mcpServer.connect(transport);
  return transport.handleRequest(c.req.raw, { authInfo });
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[MCP] Server listening on http://localhost:${PORT}/mcp`);
  console.log(`[MCP] PDP:    ${PDP_URL}`);
  console.log(`[MCP] JWKS:   ${tokenConfig.jwksUri}`);
  console.log(`[MCP] Issuer: ${tokenConfig.issuer}`);
});
