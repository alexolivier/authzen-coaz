import { evaluate } from "cel-js";
import type { AuthZenMapping } from "./types.js";

interface ResolverContext {
  params: Record<string, unknown>;
  token: Record<string, unknown>;
}

function resolveExpression(expr: string, context: ResolverContext): unknown {
  try {
    return evaluate(expr, context as unknown as Record<string, unknown>);
  } catch (err) {
    if (err instanceof Error && /Identifier .* not found/.test(err.message)) {
      console.warn(`[COAZ] CEL expression "${expr}" resolved to undefined: ${err.message}`);
      return undefined;
    }
    throw err;
  }
}

function resolveValue(value: unknown, context: ResolverContext): unknown {
  if (typeof value === "string") return resolveExpression(value, context);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveValue(v, context);
      if (resolved !== undefined) out[k] = resolved;
    }
    return out;
  }
  return value;
}

export interface ResolvedEvaluation {
  action?: Record<string, unknown>;
  resource: Record<string, unknown>;
}

export interface ResolvedMapping {
  subject: Record<string, unknown>;
  context?: Record<string, unknown>;
  evaluations: ResolvedEvaluation[];
}

export function resolveMapping(
  mapping: AuthZenMapping,
  params: Record<string, unknown>,
  tokenClaims: Record<string, unknown>,
): ResolvedMapping {
  const ctx: ResolverContext = { params, token: tokenClaims };
  return {
    subject: resolveValue(mapping.subject, ctx) as Record<string, unknown>,
    context: mapping.context
      ? (resolveValue(mapping.context, ctx) as Record<string, unknown>)
      : undefined,
    evaluations: mapping.evaluations.map((entry) => ({
      action: entry.action
        ? (resolveValue(entry.action, ctx) as Record<string, unknown>)
        : undefined,
      resource: resolveValue(entry.resource, ctx) as Record<string, unknown>,
    })),
  };
}
