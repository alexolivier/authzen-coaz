import { evaluate } from "cel-js";
import type { CoazMapping } from "./types.js";

export function resolveValue(
  value: unknown,
  properties: Record<string, unknown>,
  token: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("properties.") || value.startsWith("token.")) {
      return evaluate(value, { properties, token });
    }
    return value;
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, properties, token);
    }
    return resolved;
  }

  return value;
}

function resolveArray(
  arr: Record<string, unknown>[],
  properties: Record<string, unknown>,
  token: Record<string, unknown>,
): Record<string, unknown>[] {
  return arr.map(
    (item) => resolveValue(item, properties, token) as Record<string, unknown>,
  );
}

export interface ResolvedMapping {
  subject: Record<string, unknown>[];
  action: Record<string, unknown>[];
  resource: Record<string, unknown>[];
  context: Record<string, unknown>[];
}

export function resolveMapping(
  mapping: CoazMapping,
  toolName: string,
  args: Record<string, unknown>,
  tokenClaims: Record<string, unknown>,
): ResolvedMapping {
  const subject = resolveArray(mapping.subject, args, tokenClaims);
  const action = mapping.action
    ? resolveArray(mapping.action, args, tokenClaims)
    : [{ name: toolName }];
  const resource = resolveArray(mapping.resource, args, tokenClaims);
  const context = resolveArray(mapping.context, args, tokenClaims);

  const multiLengths = [subject, action, resource, context]
    .map((a) => a.length)
    .filter((len) => len > 1);

  if (multiLengths.length > 0 && new Set(multiLengths).size > 1) {
    throw new Error(
      "Multi-element arrays in x-coaz-mapping must all have the same length",
    );
  }

  return { subject, action, resource, context };
}
