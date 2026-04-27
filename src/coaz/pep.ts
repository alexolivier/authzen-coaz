import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenClient } from "../authzen/client.js";
import type { EvaluationsRequest } from "../authzen/types.js";
import { resolveMapping } from "./resolver.js";
import { validateAuthZenMapping } from "./schema.js";
import type { AuthZenMapping, CoazToolDefinition } from "./types.js";

const UNAUTHORIZED = -32401;

function log(label: string, data: unknown): void {
  console.log(`\n[COAZ] ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

export async function enforceMapping(
  rawMapping: unknown,
  defaultActionName: string,
  params: Record<string, unknown>,
  tokenClaims: Record<string, unknown>,
  pdpClient: AuthZenClient,
  label: string,
): Promise<void> {
  let mapping: AuthZenMapping;
  try {
    mapping = validateAuthZenMapping(rawMapping);
  } catch (err) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid x-authzen-mapping: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log(`x-authzen-mapping for ${label}`, rawMapping);
  const resolved = resolveMapping(mapping, params, tokenClaims);

  const evaluations = resolved.evaluations.map((entry) => ({
    action: entry.action ?? { name: defaultActionName },
    resource: entry.resource,
  }));

  if (evaluations.length === 1) {
    const response = await pdpClient.evaluate({
      subject: resolved.subject,
      action: evaluations[0].action,
      resource: evaluations[0].resource,
      context: resolved.context ?? {},
    });
    console.log(`[COAZ] decision for ${label}: ${response.decision}`);

    if (!response.decision) {
      throw new McpError(UNAUTHORIZED, response.context?.reason ?? "Access denied");
    }
    return;
  }

  const request: EvaluationsRequest = {
    subject: resolved.subject,
    context: resolved.context,
    evaluations,
  };

  const response = await pdpClient.evaluations(request);
  const decisions = response.evaluations.map((e) => e.decision);
  console.log(`[COAZ] decisions for ${label}: [${decisions.join(", ")}]`);

  const denied = response.evaluations.find((e) => !e.decision);
  if (denied) {
    throw new McpError(UNAUTHORIZED, denied.context?.reason ?? "Access denied");
  }
}

export async function enforceCoaz(
  tool: CoazToolDefinition,
  toolArguments: Record<string, unknown> = {},
  tokenClaims: Record<string, unknown>,
  pdpClient: AuthZenClient,
): Promise<void> {
  await enforceMapping(
    tool.inputSchema["x-authzen-mapping"],
    tool.name,
    { name: tool.name, arguments: toolArguments },
    tokenClaims,
    pdpClient,
    `tool "${tool.name}"`,
  );
}
