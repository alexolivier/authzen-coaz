# COAZ Reference MCP Server

A reference implementation of the [AuthZen Profile for Model Context Protocol Tool Authorization](https://github.com/openid/authzen/blob/main/profiles/authzen-mcp-profile-1_0.md) (COAZ). It demonstrates how MCP tools can declare fine-grained authorization requirements via `x-coaz-mapping`, and how a Policy Enforcement Point (PEP) resolves those mappings into [AuthZEN Authorization API](https://openid.net/specs/authorization-api-1_0.html) requests against a Policy Decision Point (PDP).

This demo uses [Cerbos](https://cerbos.dev) as the AuthZEN-compatible PDP.

## What is COAZ?

COAZ (Compatible with OpenID AuthZen, pronounced "cozy") is a standardized mapping from MCP tool definitions and their invocation parameters to the AuthZen Subject-Action-Resource-Context (SARC) model. It enables MCP gateways and servers to perform fine-grained, parameter-level authorization checks before executing MCP tools.

Each COAZ-enabled tool declares an `x-coaz-mapping` in its `inputSchema` that describes how tool arguments and JWT token claims map to an AuthZEN evaluation request:

```json
{
  "name": "get_customer",
  "coaz": true,
  "inputSchema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" }
    },
    "x-coaz-mapping": {
      "resource": [{ "type": "customer", "id": "properties.customer_id" }],
      "subject":  [{ "type": "token.role", "id": "token.sub" }],
      "context":  [{ "agent": "token.client_id" }]
    }
  }
}
```

When the tool is called, the PEP evaluates [CEL](https://github.com/google/cel-spec) expressions referencing `properties` (tool arguments) and `token` (caller's JWT claims), then sends the resulting AuthZEN request to the PDP.

## Demo tools

### `get_customer` — RBAC, single evaluation

Looks up a customer by ID. Demonstrates role-based access control: `admin` and `agent` roles are permitted, `viewer` is denied.

The `x-coaz-mapping` produces a single AuthZEN evaluation request:

```json
{
  "subject":  { "type": "agent", "id": "bob@example.com" },
  "action":   { "name": "get_customer" },
  "resource":  { "type": "customer", "id": "cust-123" },
  "context":  { "agent": "support-agent-v2" }
}
```

### `transfer_customer` — ABAC + multi-evaluation

Transfers a customer between regions. Requires `read` on the source region and `write` on the destination region. Demonstrates two things:

**Multi-evaluation** — The action and resource arrays each have two elements, so the PEP calls the AuthZEN batch `evaluations` endpoint. Both checks must pass.

**Attribute-based access control** — The subject includes `properties.department` from the JWT. The PDP policy requires `admin` role AND `department == "platform-ops"`. An admin in the wrong department is denied.

```json
{
  "subject": { "type": "admin", "id": "alice@example.com", "properties": { "department": "platform-ops" } },
  "context": { "agent": "support-agent-v2" },
  "evaluations": [
    { "action": { "name": "read" },  "resource": { "type": "customer_region", "id": "us-west-2" } },
    { "action": { "name": "write" }, "resource": { "type": "customer_region", "id": "eu-west-1" } }
  ]
}
```

## Demo personas

| Name | Role | Department | `get_customer` | `transfer_customer` |
|------|------|------------|----------------|---------------------|
| alice | admin | platform-ops | allowed | allowed |
| bob | agent | support | allowed | denied (wrong role) |
| charlie | viewer | support | denied (wrong role) | denied (wrong role) |

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://docs.docker.com/get-docker/) (for the Cerbos PDP)

## Running the demo

### 1. Install dependencies

```sh
bun install
```

### 2. Start the PDP

```sh
docker compose up -d
```

This starts [Cerbos](https://cerbos.dev) with the policies in `policies/` and audit decision logs to stdout. View them with:

```sh
docker compose logs -f
```

### 3. Generate tokens and start the JWKS server

```sh
bun run tokens
```

This generates signed JWTs for each persona and serves the JWKS endpoint. Keep this running — the MCP server needs it to verify tokens.

The output will show the tokens and the env vars needed for the next step.

### 4. Start the MCP server

In a separate terminal, using the env vars printed by the token script:

```sh
JWKS_URI=http://localhost:9200/.well-known/jwks.json \
TOKEN_ISSUER=http://localhost:9200 \
TOKEN_AUDIENCE=coaz-mcp-server \
bun run start
```

### 5. Make requests

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to interact with the server:

```sh
bun run inspect
```

Or connect any MCP client to `http://localhost:3000/mcp`, passing an `Authorization: Bearer <token>` header with one of the tokens from step 3.

### What to look for

The MCP server console shows the full authorization flow for each tool call:

1. **`[TOOL]`** — The tool name and arguments
2. **`[AUTH]`** — JWT verification (subject and role from the token)
3. **`[COAZ]`** — The `x-coaz-mapping` from the tool definition, then the resolved AuthZEN request with CEL expressions evaluated against tool arguments and token claims
4. **`[PDP]`** — AuthZEN endpoint discovery (on first call)
5. **`[COAZ]`** — The AuthZEN response with the PDP's decision

The Cerbos container logs (`docker compose logs -f`) show the corresponding decision audit trail with the matched policy.

## Running tests

The e2e tests require the PDP to be running:

```sh
docker compose up -d
bun test
```

## Project structure

```
src/
  index.ts              HTTP server, session management
  server.ts             MCP server setup, tool registration
  auth/token.ts         JWT verification via JWKS
  authzen/client.ts     AuthZEN PDP client (discovery + evaluation)
  authzen/types.ts      AuthZEN request/response types
  coaz/pep.ts           Policy Enforcement Point — resolves mappings, calls PDP
  coaz/resolver.ts      CEL expression resolution of properties/token references
  coaz/schema.ts        Zod validation of x-coaz-mapping
  coaz/types.ts         COAZ type definitions
  tools/                Tool definitions and handlers
policies/               Cerbos policy files
scripts/tokens.ts       Token generation + JWKS server
test/e2e.test.ts        End-to-end tests
spec.md                 The COAZ specification
```
