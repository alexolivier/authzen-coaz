import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestParamsSchema,
  ErrorCode,
  isJSONRPCRequest,
  JSONRPC_VERSION,
  McpError,
  type CallToolResult,
  type JSONRPCRequest,
  type RequestId,
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createServer } from "./server.js";
import { AuthZenClient } from "./authzen/client.js";
import { verifyAndExtractClaims, type TokenValidationConfig } from "./auth/token.js";
import { DEFAULT_MAPPINGS } from "./coaz/default-mappings.js";
import { enforceMapping } from "./coaz/pep.js";
import { validateAuthZenMapping } from "./coaz/schema.js";
import { tools } from "./tools/registry.js";
import { log } from "./log.js";
import type { AuthZenMapping } from "./coaz/types.js";

const UNAUTHORIZED = -32401;

const tokenConfig: TokenValidationConfig = {
  jwksUri: process.env.JWKS_URI ?? "http://localhost:8080/.well-known/jwks.json",
  issuer: process.env.TOKEN_ISSUER ?? "http://localhost:8080",
  audience: process.env.TOKEN_AUDIENCE ?? "coaz-mcp-server",
};
const PDP_URL = process.env.PDP_URL ?? "http://localhost:3592";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

for (const [method, mapping] of Object.entries(DEFAULT_MAPPINGS)) {
  try {
    validateAuthZenMapping(mapping);
  } catch (err) {
    throw new Error(
      `Invalid DEFAULT_MAPPINGS entry "${method}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const pdpClient = new AuthZenClient(PDP_URL);
await pdpClient.discover();

interface MappingLookup {
  mapping: AuthZenMapping;
  defaultAction: string;
}

function lookupMapping(req: JSONRPCRequest): MappingLookup | undefined {
  if (req.method === "tools/call") {
    const parsed = CallToolRequestParamsSchema.safeParse(req.params);
    if (!parsed.success) return undefined;
    const tool = tools.find((t) => t.definition.name === parsed.data.name);
    if (tool?.definition.coaz) {
      return {
        mapping: tool.definition.inputSchema["x-authzen-mapping"],
        defaultAction: tool.definition.name,
      };
    }
  }
  const mapping = DEFAULT_MAPPINGS[req.method];
  return mapping ? { mapping, defaultAction: req.method } : undefined;
}

async function authorizeRequest(
  req: JSONRPCRequest,
  authInfo: AuthInfo | undefined,
): Promise<void> {
  const found = lookupMapping(req);
  if (!found) return;

  if (!authInfo?.token) {
    throw new McpError(UNAUTHORIZED, "Missing access token");
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyAndExtractClaims(authInfo.token, tokenConfig);
  } catch (err) {
    throw new McpError(
      UNAUTHORIZED,
      `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await enforceMapping(
    found.mapping,
    found.defaultAction,
    (req.params ?? {}) as Record<string, unknown>,
    claims,
    pdpClient,
  );
}

interface JsonRpcErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId | null;
  error: { code: number; message: string };
}

interface JsonRpcResultResponse<T> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId | null;
  result: T;
}

function jsonRpcError(id: RequestId | undefined, code: number, message: string): JsonRpcErrorResponse {
  return { jsonrpc: JSONRPC_VERSION, id: id ?? null, error: { code, message } };
}

function toolErrorResult(
  id: RequestId | undefined,
  err: McpError,
): JsonRpcResultResponse<CallToolResult> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? null,
    result: {
      isError: true,
      content: [{ type: "text", text: `MCP error ${err.code}: ${err.message}` }],
    },
  };
}

const serverConfig = { pdpClient };
const app = new Hono();
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

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

    if (Array.isArray(body)) {
      return c.json(jsonRpcError(undefined, ErrorCode.InvalidRequest, "Batch requests not supported"), 400);
    }

    if (isJSONRPCRequest(body)) {
      try {
        await authorizeRequest(body, authInfo);
      } catch (err) {
        if (err instanceof McpError) {
          return c.json(
            body.method === "tools/call"
              ? toolErrorResult(body.id, err)
              : jsonRpcError(body.id, err.code, err.message),
            200,
          );
        }
        throw err;
      }
    }
  }

  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      log("MCP", `session not found: ${sessionId}`);
      return c.json({ error: "Session not found" }, 404);
    }
    return transport.handleRequest(c.req.raw, { authInfo });
  }

  log("MCP", "new session — creating server");
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      log("MCP", `session initialized: ${id}`);
      sessions.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      log("MCP", `session closed: ${transport.sessionId}`);
      sessions.delete(transport.sessionId);
    }
  };

  const mcpServer = await createServer(serverConfig);
  await mcpServer.connect(transport);
  return transport.handleRequest(c.req.raw, { authInfo });
});

serve({ fetch: app.fetch, port: PORT }, () => {
  log("MCP", `server listening on http://localhost:${PORT}/mcp`);
  log("MCP", `PDP:    ${PDP_URL}`);
  log("MCP", `JWKS:   ${tokenConfig.jwksUri}`);
  log("MCP", `Issuer: ${tokenConfig.issuer}`);
});
