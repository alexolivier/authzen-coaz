import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenClient } from "../authzen/client.js";
import type { EvaluationsRequest } from "../authzen/types.js";
import { log } from "../log.js";
import { resolveMapping } from "./resolver.js";
import type { AuthZenMapping } from "./types.js";

const UNAUTHORIZED = -32401;

export async function enforceMapping(
  mapping: AuthZenMapping,
  defaultActionName: string,
  params: Record<string, unknown>,
  tokenClaims: Record<string, unknown>,
  pdpClient: AuthZenClient,
): Promise<void> {
  log("COAZ", `mapping for ${defaultActionName}`, mapping);
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
    log("COAZ", `decision for ${defaultActionName}: ${response.decision}`);

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
  log("COAZ", `decisions for ${defaultActionName}: [${decisions.join(", ")}]`);

  const denied = response.evaluations.find((e) => !e.decision);
  if (denied) {
    throw new McpError(UNAUTHORIZED, denied.context?.reason ?? "Access denied");
  }
}
