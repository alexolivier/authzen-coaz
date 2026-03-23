import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenClient } from "../authzen/client.js";
import type { EvaluationRequest, EvaluationsRequest } from "../authzen/types.js";
import { resolveMapping } from "./resolver.js";
import { validateCoazMapping } from "./schema.js";
import type { CoazToolDefinition } from "./types.js";

const UNAUTHORIZED = -32401;

function log(label: string, data: unknown): void {
  console.log(`\n[COAZ] ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

export async function enforceCoaz(
  tool: CoazToolDefinition,
  args: Record<string, unknown>,
  tokenClaims: Record<string, unknown>,
  pdpClient: AuthZenClient,
): Promise<void> {
  const rawMapping = tool.inputSchema["x-coaz-mapping"];
  let mapping;
  try {
    mapping = validateCoazMapping(rawMapping);
  } catch (err) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid x-coaz-mapping: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log(`x-coaz-mapping for "${tool.name}"`, rawMapping);
  const resolved = resolveMapping(mapping, tool.name, args, tokenClaims);

  const arrays = [resolved.subject, resolved.action, resolved.resource, resolved.context];
  const multiLength = arrays.map((a) => a.length).find((len) => len > 1);

  if (!multiLength) {
    const request: EvaluationRequest = {
      subject: resolved.subject[0],
      action: resolved.action[0],
      resource: resolved.resource[0],
      context: resolved.context[0],
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

  const request: EvaluationsRequest = { evaluations: [] };

  if (resolved.subject.length === 1) request.subject = resolved.subject[0];
  if (resolved.action.length === 1) request.action = resolved.action[0];
  if (resolved.resource.length === 1) request.resource = resolved.resource[0];
  if (resolved.context.length === 1) request.context = resolved.context[0];

  for (let i = 0; i < multiLength; i++) {
    const entry: EvaluationsRequest["evaluations"][number] = {};
    if (resolved.subject.length > 1) entry.subject = resolved.subject[i];
    if (resolved.action.length > 1) entry.action = resolved.action[i];
    if (resolved.resource.length > 1) entry.resource = resolved.resource[i];
    if (resolved.context.length > 1) entry.context = resolved.context[i];
    request.evaluations.push(entry);
  }

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
