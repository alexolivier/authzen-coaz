import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const JWKS_PORT = parseInt(process.env.JWKS_PORT ?? "9200", 10);
const ISSUER = `http://localhost:${JWKS_PORT}`;
const AUDIENCE = "coaz-mcp-server";

interface Persona {
  name: string;
  sub: string;
  role: string;
  department: string;
  client_id: string;
}

const PERSONAS: Persona[] = [
  {
    name: "alice (admin, platform-ops)",
    sub: "alice@example.com",
    role: "admin",
    department: "platform-ops",
    client_id: "support-agent-v2",
  },
  {
    name: "bob (agent, support)",
    sub: "bob@example.com",
    role: "agent",
    department: "support",
    client_id: "support-agent-v2",
  },
  {
    name: "charlie (viewer, support)",
    sub: "charlie@example.com",
    role: "viewer",
    department: "support",
    client_id: "dashboard-app",
  },
];

async function main() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const pubJwk = await exportJWK(publicKey);
  pubJwk.kid = "coaz-demo-key";
  pubJwk.alg = "RS256";
  pubJwk.use = "sig";

  const app = new Hono();
  app.get("/.well-known/jwks.json", (c) => c.json({ keys: [pubJwk] }));

  serve({ fetch: app.fetch, port: JWKS_PORT });

  console.log(`JWKS serving at http://localhost:${JWKS_PORT}/.well-known/jwks.json\n`);
  console.log("Start the MCP server with:");
  console.log(`  JWKS_URI=http://localhost:${JWKS_PORT}/.well-known/jwks.json TOKEN_ISSUER=${ISSUER} TOKEN_AUDIENCE=${AUDIENCE} bun run start\n`);
  console.log("=".repeat(72));

  for (const persona of PERSONAS) {
    const token = await new SignJWT({
      sub: persona.sub,
      role: persona.role,
      department: persona.department,
      client_id: persona.client_id,
    })
      .setProtectedHeader({ alg: "RS256", kid: "coaz-demo-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("24h")
      .sign(privateKey);

    console.log(`\n${persona.name}`);
    console.log(`  sub=${persona.sub}  role=${persona.role}  department=${persona.department}`);
    console.log(`\n  ${token}`);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("\nJWKS server running. Press Ctrl+C to stop.");
}

main();
