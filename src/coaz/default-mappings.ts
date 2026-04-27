import type { AuthZenMapping } from "./types.js";

const subject = { type: "'identity'", id: "token.sub" } as const;
const baseContext = { agent: "token.client_id" } as const;
const serverResource = { type: "'mcp_server'", id: "token.aud" } as const;

function serverScoped(
  actionName: string,
  context: Record<string, string> = baseContext,
): AuthZenMapping {
  return {
    subject: { ...subject },
    context: { ...context },
    evaluations: [
      {
        action: { name: `'${actionName}'` },
        resource: { ...serverResource },
      },
    ],
  };
}

function resourceScoped(
  actionName: string,
  resourceType: string,
  idExpr: string,
): AuthZenMapping {
  return {
    subject: { ...subject },
    context: { ...baseContext },
    evaluations: [
      {
        action: { name: `'${actionName}'` },
        resource: { type: `'${resourceType}'`, id: idExpr },
      },
    ],
  };
}

export const DEFAULT_MAPPINGS: Record<string, AuthZenMapping> = {
  initialize: serverScoped("initialize", { ...baseContext, protocol_version: "params.protocolVersion" }),

  ping: serverScoped("ping"),

  "tools/list": serverScoped("tools/list"),

  "tools/call": {
    subject: { ...subject },
    context: { ...baseContext },
    evaluations: [
      {
        action: { name: "params.name" },
        resource: { type: "'tool'", id: "params.name" },
      },
    ],
  },

  "resources/list": serverScoped("resources/list"),
  "resources/templates/list": serverScoped("resources/templates/list"),

  "resources/read": resourceScoped("resources/read", "resource", "params.uri"),
  "resources/subscribe": resourceScoped("resources/subscribe", "resource", "params.uri"),
  "resources/unsubscribe": resourceScoped("resources/unsubscribe", "resource", "params.uri"),

  "prompts/list": serverScoped("prompts/list"),
  "prompts/get": resourceScoped("prompts/get", "prompt", "params.name"),

  "sampling/createMessage": serverScoped(
    "sampling/createMessage",
    { ...baseContext, max_tokens: "params.maxTokens" },
  ),

  "elicitation/create": serverScoped(
    "elicitation/create",
    { ...baseContext, mode: "'form'" },
  ),

  "completion/complete": {
    subject: { ...subject },
    context: { ...baseContext, argument_name: "params.argument.name" },
    evaluations: [
      {
        action: { name: "'completion/complete'" },
        resource: { type: "params.ref.type", id: "params.ref.name" },
      },
    ],
  },

  "logging/setLevel": serverScoped(
    "logging/setLevel",
    { ...baseContext, level: "params.level" },
  ),

  "roots/list": serverScoped("roots/list"),

  "tasks/list": serverScoped("tasks/list"),
  "tasks/get": resourceScoped("tasks/get", "task", "params.taskId"),
  "tasks/result": resourceScoped("tasks/result", "task", "params.taskId"),
  "tasks/cancel": resourceScoped("tasks/cancel", "task", "params.taskId"),
};

export function getDefaultMapping(method: string): AuthZenMapping | undefined {
  return DEFAULT_MAPPINGS[method];
}
