import { CallToolRequest, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenClient } from "../authzen/client.js";
import type { EvaluationRequest, EvaluationsRequest } from "../authzen/types.js";
import { resolveMapping } from "./resolver.js";
import { validateAuthZenMapping } from "./schema.js";
import type { CoazToolDefinition } from "./types.js";

const UNAUTHORIZED = -32401;

function log(label: string, data: unknown): void {
  console.log(`\n[COAZ] ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

export async function enforceCoaz(
  tool: CoazToolDefinition,
  toolArguments: CallToolRequest["params"]["arguments"] = {},
  tokenClaims: Record<string, unknown>,
  pdpClient: AuthZenClient,
): Promise<void> {
  const rawMapping = tool.inputSchema["x-authzen-mapping"];
  let mapping;
  try {
    mapping = validateAuthZenMapping(rawMapping);
  } catch (err) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid x-authzen-mapping: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log(`x-authzen-mapping for "${tool.name}"`, rawMapping);
  const resolved = resolveMapping(mapping, toolArguments, tokenClaims);

  const evaluations = resolved.evaluations.map((entry) => ({
    action: entry.action ?? { name: tool.name },
    resource: entry.resource,
  }));

  if (evaluations.length === 1) {
    const request: EvaluationRequest = {
      subject: resolved.subject,
      action: evaluations[0].action,
      resource: evaluations[0].resource,
      context: resolved.context ?? {},
    };

    log("AuthZEN evaluation request →", request);
    const response = await pdpClient.evaluate(request);
    log(`AuthZEN evaluation response ← decision: ${response.decision}`, response);

    if (!response.decision) {
      throw new McpError(
        UNAUTHORIZED,
        response.context?.reason ?? "Access denied",
      );
    }
    return;
  }

  const request: EvaluationsRequest = {
    subject: resolved.subject,
    context: resolved.context,
    evaluations,
  };

  log("AuthZEN evaluations request →", request);
  const response = await pdpClient.evaluations(request);
  const decisions = response.evaluations.map((e) => e.decision);
  log(`AuthZEN evaluations response ← decisions: [${decisions.join(", ")}]`, response);

  const denied = response.evaluations.find((e) => !e.decision);
  if (denied) {
    throw new McpError(
      UNAUTHORIZED,
      denied.context?.reason ?? "Access denied",
    );
  }
}
