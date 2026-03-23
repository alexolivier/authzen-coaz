import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_PORT = 9100;
const JWKS_PORT = 9101;
const PDP_URL = process.env.PDP_URL ?? "http://localhost:3592";

let mcpProcess: ReturnType<typeof Bun.spawn>;
let jwksServer: ServerType;
let signingKey: CryptoKey;
let issuer: string;
const audience = "coaz-mcp-server";

interface ToolContent { type: string; text: string }
interface TokenClaims { sub: string; role: string; department: string; client_id: string }

async function mintToken(claims: TokenClaims, exp = "1h"): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(exp)
    .sign(signingKey);
}

async function createMcpClient(token?: string): Promise<Client> {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${MCP_PORT}/mcp`),
    { requestInit: { headers } },
  );
  const client = new Client({ name: "e2e-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function rawJsonRpc(
  method: string,
  params: Record<string, unknown>,
  token?: string,
  sessionId?: string,
): Promise<{ status: number; body: Record<string, unknown>; sessionId?: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const parsed = text.split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => { try { return JSON.parse(l.slice(6)) as Record<string, unknown>; } catch { return null; } })
      .find((d) => d && "id" in d);
    body = parsed ?? { error: { code: -1, message: "No JSON-RPC response in SSE" } };
  } else {
    body = (await res.json()) as Record<string, unknown>;
  }
  return { status: res.status, body, sessionId: res.headers.get("mcp-session-id") ?? undefined };
}

async function initSession(token?: string): Promise<string> {
  const res = await rawJsonRpc("initialize", {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "raw-test", version: "1.0.0" },
  }, token);
  const sid = res.sessionId!;
  await fetch(`http://localhost:${MCP_PORT}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      "mcp-session-id": sid, ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return sid;
}

const ADMIN = { sub: "alice@example.com", role: "admin", department: "platform-ops", client_id: "agent-v2" };
const AGENT = { sub: "bob@example.com", role: "agent", department: "support", client_id: "agent-v2" };
const VIEWER = { sub: "charlie@example.com", role: "viewer", department: "support", client_id: "dashboard" };

describe("COAZ MCP Server E2E", () => {
  beforeAll(async () => {
    for (let i = 0; i < 30; i++) {
      try { const r = await fetch(`${PDP_URL}/.well-known/authzen-configuration`); if (r.ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }

    const kp = await generateKeyPair("RS256");
    signingKey = kp.privateKey;
    const pubJwk = await exportJWK(kp.publicKey);
    pubJwk.kid = "test-key-1"; pubJwk.alg = "RS256"; pubJwk.use = "sig";
    issuer = `http://localhost:${JWKS_PORT}`;

    const app = new Hono();
    app.get("/.well-known/jwks.json", (c) => c.json({ keys: [pubJwk] }));
    jwksServer = serve({ fetch: app.fetch, port: JWKS_PORT });
    await new Promise((r) => setTimeout(r, 200));

    mcpProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env, PORT: String(MCP_PORT), PDP_URL,
        JWKS_URI: `http://localhost:${JWKS_PORT}/.well-known/jwks.json`,
        TOKEN_ISSUER: issuer, TOKEN_AUDIENCE: audience,
      },
      stdout: "pipe", stderr: "pipe",
    });

    for (let i = 0; i < 30; i++) {
      try { const r = await fetch(`http://localhost:${MCP_PORT}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); if (r.status !== 0) break; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
  });

  afterAll(() => { mcpProcess?.kill(); jwksServer?.close(); });

  describe("tools/list", () => {
    it("returns both tools with coaz metadata", async () => {
      // #given
      const token = await mintToken(ADMIN);
      const sid = await initSession(token);

      // #when
      const res = await rawJsonRpc("tools/list", {}, token, sid);

      // #then
      const result = res.body.result as { tools: Record<string, unknown>[] };
      expect(result.tools.length).toBe(2);
      expect(result.tools.every((t) => t.coaz === true)).toBe(true);
      expect(result.tools.every((t) => (t.inputSchema as Record<string, unknown>)["x-coaz-mapping"])).toBe(true);
    });
  });

  describe("RBAC: get_customer", () => {
    it("admin can read", async () => {
      // #given
      const client = await createMcpClient(await mintToken(ADMIN));

      // #when
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      // #then
      expect(result.isError).toBeFalsy();
      expect(JSON.parse((result.content as ToolContent[])[0].text).customer_id).toBe("cust-123");
      await client.close();
    });

    it("agent can read", async () => {
      const client = await createMcpClient(await mintToken(AGENT));
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      expect(result.isError).toBeFalsy();
      await client.close();
    });

    it("viewer is denied", async () => {
      const client = await createMcpClient(await mintToken(VIEWER));
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("-32401");
      await client.close();
    });
  });

  describe("ABAC + multi-eval: transfer_customer", () => {
    it("admin in platform-ops can transfer", async () => {
      const client = await createMcpClient(await mintToken(ADMIN));
      const result = await client.callTool({
        name: "transfer_customer",
        arguments: { customer_id: "cust-123", source_region: "us-west-2", destination_region: "eu-west-1" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content as ToolContent[])[0].text);
      expect(parsed.status).toBe("transferred");
      await client.close();
    });

    it("admin in wrong department is denied", async () => {
      // #given - admin role but sales department
      const adminSales = { ...ADMIN, sub: "diana@example.com", department: "sales" };
      const client = await createMcpClient(await mintToken(adminSales));

      // #when
      const result = await client.callTool({
        name: "transfer_customer",
        arguments: { customer_id: "cust-123", source_region: "us-west-2", destination_region: "eu-west-1" },
      });

      // #then
      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("-32401");
      await client.close();
    });

    it("agent is denied even in platform-ops", async () => {
      // #given - right department but wrong role
      const agentOps = { ...AGENT, department: "platform-ops" };
      const client = await createMcpClient(await mintToken(agentOps));

      // #when
      const result = await client.callTool({
        name: "transfer_customer",
        arguments: { customer_id: "cust-123", source_region: "us-west-2", destination_region: "eu-west-1" },
      });

      // #then
      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("-32401");
      await client.close();
    });
  });

  describe("token validation", () => {
    it("rejects missing token", async () => {
      const client = await createMcpClient();
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("Missing access token");
      await client.close();
    });

    it("rejects expired token", async () => {
      const client = await createMcpClient(await mintToken(ADMIN, "-1h"));
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("Token validation failed");
      await client.close();
    });

    it("rejects garbage token", async () => {
      const client = await createMcpClient("not-a-jwt");
      const result = await client.callTool({ name: "get_customer", arguments: { customer_id: "cust-123" } });

      expect(result.isError).toBe(true);
      expect((result.content as ToolContent[])[0].text).toContain("Token validation failed");
      await client.close();
    });
  });
});
