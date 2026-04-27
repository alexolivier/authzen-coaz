# COAZ Reference MCP Server

A reference implementation of the [AuthZen Profile for Model Context Protocol Tool Authorization](https://github.com/openid/authzen/blob/main/profiles/authzen-mcp-profile-1_0.md) (COAZ). It demonstrates how MCP tools can declare fine-grained authorization requirements via `x-authzen-mapping`, and how a Policy Enforcement Point (PEP) resolves those mappings into [AuthZEN Authorization API](https://openid.net/specs/authorization-api-1_0.html) requests against a Policy Decision Point (PDP).

This demo uses [Cerbos](https://cerbos.dev) as the AuthZEN-compatible PDP.

## What is COAZ?

COAZ (Compatible with OpenID AuthZen, pronounced "cozy") is a standardized mapping from MCP tool definitions and their invocation parameters to the AuthZen Subject-Action-Resource-Context (SARC) model. It enables MCP gateways and servers to perform fine-grained, parameter-level authorization checks before executing MCP tools.

Each COAZ-enabled tool declares an `x-authzen-mapping` in its `inputSchema` that describes how tool arguments and JWT token claims map to an AuthZEN evaluation request:

```json
{
  "name": "get_customer",
  "coaz": true,
  "inputSchema": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" }
    },
    "x-authzen-mapping": {
      "subject": { "type": "token.role", "id": "token.sub" },
      "context": { "agent": "token.client_id" },
      "evaluations": [
        {
          "resource": {
            "type": "'customer'",
            "id": "params.arguments.customer_id"
          }
        }
      ]
    }
  }
}
```

Every value in the mapping is a [CEL](https://github.com/google/cel-spec) expression. The PEP evaluates each expression against a context containing `params` (the JSON-RPC `params` object — for `tools/call` this exposes `params.arguments` and `params.name`) and `token` (the caller's JWT claims). Static values are written as quoted CEL string literals (e.g. `"'customer'"`). If `action` is omitted on an evaluation entry, it defaults to `{ "name": "<tool_name>" }`.

## Default mappers

Tool-level `x-authzen-mapping` only covers `tools/call`. For every other MCP JSON-RPC method (`initialize`, `tools/list`, `resources/read`, `prompts/get`, `tasks/get`, etc.), the server applies a built-in default mapping defined in `src/coaz/default-mappings.ts`. These follow the conventions in the AuthZEN-MCP profile:

- `subject` is always `{ type: "identity", id: "<JWT sub>" }`.
- `context.agent` is the JWT `client_id`.
- `resource` is `mcp_server` (id = `<JWT aud>`) for server-scoped methods, or the specific MCP primitive for resource/prompt/task methods (e.g. `resource.id = params.uri` for `resources/read`).
- `action.name` is the JSON-RPC method name (or, for the default `tools/call` mapping that fires on non-COAZ tools, the tool name from `params.name`).

Authorization runs at the JSON-RPC layer in `src/index.ts` before the request reaches the MCP SDK. JSON-RPC notifications (no `id` field) skip authorization per the profile. For `tools/call` on a COAZ tool, the per-tool `x-authzen-mapping` overrides the default and runs in the tool handler instead.

The `policies/mcp_server.yaml` Cerbos policy permits framework methods (`initialize`, `ping`, `tools/list`, etc.) for any holder of a valid token. Production deployments would write more restrictive policies.

## Demo MCP primitives

The reference server exposes one example of each MCP primitive that supports server-side authorization, so each AuthZEN check is exercised end-to-end against the PDP.

| Primitive | Method(s) gated | What it demonstrates |
|-----------|-----------------|----------------------|
| Tool | `tools/call` | Per-tool `x-authzen-mapping` (RBAC and ABAC + multi-evaluation) |
| Resource (static) | `resources/read` | Default mapper checks `resource.id = params.uri` per URI |
| Resource (template) | `resources/read` | Same default mapper applied to a templated URI like `customer://{id}` |
| Prompt | `prompts/get` | Default mapper checks `resource.id = params.name` per prompt name |
| Server-scoped methods | `initialize`, `ping`, `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`, … | Default mapper checks `resource = mcp_server` |

Resources and prompts use the **default mappers** in `src/coaz/default-mappings.ts` rather than declaring their own `x-authzen-mapping` — that's how the AuthZEN-MCP profile expects most non-tool primitives to work. Per-item authorization comes from the Cerbos policies, which match on `request.resource.id` (the URI / prompt name).

## Demo tools

### `get_customer` — RBAC, single evaluation

Looks up a customer by ID. Demonstrates role-based access control: `admin` and `agent` roles are permitted, `viewer` is denied.

The `x-authzen-mapping` produces a single AuthZEN evaluation request:

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

**Multi-evaluation** — The mapping declares two entries in the `evaluations` array, so the PEP calls the AuthZEN batch `evaluations` endpoint. Both checks must pass.

**Attribute-based access control** — The subject's `properties.department` is sourced from the JWT (`token.department`). The PDP policy requires `admin` role AND `department == "platform-ops"`. An admin in the wrong department is denied.

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

## Demo resources

Three static resources plus a template, all gated by the default `resources/read` mapper. The `policies/resource.yaml` policy permits the `identity` role only when `request.resource.id` (the URI) starts with `doc://public/`, `customers://`, or `customer://`.

| URI | Allowed |
|-----|---------|
| `doc://public/readme` | yes |
| `doc://internal/runbook` | denied |
| `customers://index` | yes |
| `customer://{id}` (template, e.g. `customer://cust-123`) | yes |

## Demo prompts

Two prompts gated by the default `prompts/get` mapper. The `policies/prompt.yaml` policy permits the `identity` role only when `request.resource.id` (the prompt name) is `summarize_customer`.

| Prompt | Allowed |
|--------|---------|
| `summarize_customer` | yes |
| `incident_report` | denied |

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
3. **`[COAZ]`** — The `x-authzen-mapping` from the tool definition, then the resolved AuthZEN request with CEL expressions evaluated against tool arguments and token claims
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
  coaz/schema.ts        Zod validation of x-authzen-mapping
  coaz/types.ts         COAZ type definitions
  tools/                Tool definitions and handlers
  resources/            Reference resources (static + template)
  prompts/              Reference prompts
policies/               Cerbos policy files
scripts/tokens.ts       Token generation + JWKS server
test/e2e.test.ts        End-to-end tests
spec.md                 The COAZ specification
```
