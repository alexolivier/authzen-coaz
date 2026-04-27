import {
  CallToolRequestSchema,
  CancelTaskRequestSchema,
  CompleteRequestSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  GetPromptRequestSchema,
  GetTaskPayloadRequestSchema,
  GetTaskRequestSchema,
  InitializeRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListRootsRequestSchema,
  ListTasksRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthZenMapping } from "./types.js";

const subject = { type: "'identity'", id: "token.sub" };
const baseContext = { agent: "token.client_id" };
const serverResource = { type: "'mcp_server'", id: "token.aud" };

function serverScoped(
  actionName: string,
  context: Record<string, string> = baseContext,
): AuthZenMapping {
  return {
    subject,
    context,
    evaluations: [
      { action: { name: `'${actionName}'` }, resource: serverResource },
    ],
  };
}

function resourceScoped(
  actionName: string,
  resourceType: string,
  idExpr: string,
): AuthZenMapping {
  return {
    subject,
    context: baseContext,
    evaluations: [
      {
        action: { name: `'${actionName}'` },
        resource: { type: `'${resourceType}'`, id: idExpr },
      },
    ],
  };
}

const INITIALIZE = InitializeRequestSchema.shape.method.value;
const PING = PingRequestSchema.shape.method.value;
const TOOLS_LIST = ListToolsRequestSchema.shape.method.value;
const TOOLS_CALL = CallToolRequestSchema.shape.method.value;
const RESOURCES_LIST = ListResourcesRequestSchema.shape.method.value;
const RESOURCE_TEMPLATES_LIST = ListResourceTemplatesRequestSchema.shape.method.value;
const RESOURCES_READ = ReadResourceRequestSchema.shape.method.value;
const RESOURCES_SUBSCRIBE = SubscribeRequestSchema.shape.method.value;
const RESOURCES_UNSUBSCRIBE = UnsubscribeRequestSchema.shape.method.value;
const PROMPTS_LIST = ListPromptsRequestSchema.shape.method.value;
const PROMPTS_GET = GetPromptRequestSchema.shape.method.value;
const SAMPLING_CREATE_MESSAGE = CreateMessageRequestSchema.shape.method.value;
const ELICITATION_CREATE = ElicitRequestSchema.shape.method.value;
const COMPLETION_COMPLETE = CompleteRequestSchema.shape.method.value;
const LOGGING_SET_LEVEL = SetLevelRequestSchema.shape.method.value;
const ROOTS_LIST = ListRootsRequestSchema.shape.method.value;
const TASKS_LIST = ListTasksRequestSchema.shape.method.value;
const TASKS_GET = GetTaskRequestSchema.shape.method.value;
const TASKS_RESULT = GetTaskPayloadRequestSchema.shape.method.value;
const TASKS_CANCEL = CancelTaskRequestSchema.shape.method.value;

export type SdkMethod =
  | typeof INITIALIZE
  | typeof PING
  | typeof TOOLS_LIST
  | typeof TOOLS_CALL
  | typeof RESOURCES_LIST
  | typeof RESOURCE_TEMPLATES_LIST
  | typeof RESOURCES_READ
  | typeof RESOURCES_SUBSCRIBE
  | typeof RESOURCES_UNSUBSCRIBE
  | typeof PROMPTS_LIST
  | typeof PROMPTS_GET
  | typeof SAMPLING_CREATE_MESSAGE
  | typeof ELICITATION_CREATE
  | typeof COMPLETION_COMPLETE
  | typeof LOGGING_SET_LEVEL
  | typeof ROOTS_LIST
  | typeof TASKS_LIST
  | typeof TASKS_GET
  | typeof TASKS_RESULT
  | typeof TASKS_CANCEL;

export const DEFAULT_MAPPINGS: Record<string, AuthZenMapping> = {
  [INITIALIZE]: serverScoped(INITIALIZE, {
    ...baseContext,
    protocol_version: "params.protocolVersion",
  }),

  [PING]: serverScoped(PING),

  [TOOLS_LIST]: serverScoped(TOOLS_LIST),

  [TOOLS_CALL]: {
    subject,
    context: baseContext,
    evaluations: [
      {
        action: { name: "params.name" },
        resource: { type: "'tool'", id: "params.name" },
      },
    ],
  },

  [RESOURCES_LIST]: serverScoped(RESOURCES_LIST),
  [RESOURCE_TEMPLATES_LIST]: serverScoped(RESOURCE_TEMPLATES_LIST),

  [RESOURCES_READ]: resourceScoped(RESOURCES_READ, "resource", "params.uri"),
  [RESOURCES_SUBSCRIBE]: resourceScoped(RESOURCES_SUBSCRIBE, "resource", "params.uri"),
  [RESOURCES_UNSUBSCRIBE]: resourceScoped(RESOURCES_UNSUBSCRIBE, "resource", "params.uri"),

  [PROMPTS_LIST]: serverScoped(PROMPTS_LIST),
  [PROMPTS_GET]: resourceScoped(PROMPTS_GET, "prompt", "params.name"),

  [SAMPLING_CREATE_MESSAGE]: serverScoped(SAMPLING_CREATE_MESSAGE, {
    ...baseContext,
    max_tokens: "params.maxTokens",
  }),

  [ELICITATION_CREATE]: serverScoped(ELICITATION_CREATE, {
    ...baseContext,
    mode: "'form'",
  }),

  [COMPLETION_COMPLETE]: {
    subject,
    context: { ...baseContext, argument_name: "params.argument.name" },
    evaluations: [
      {
        action: { name: `'${COMPLETION_COMPLETE}'` },
        resource: { type: "params.ref.type", id: "params.ref.name" },
      },
    ],
  },

  [LOGGING_SET_LEVEL]: serverScoped(LOGGING_SET_LEVEL, {
    ...baseContext,
    level: "params.level",
  }),

  [ROOTS_LIST]: serverScoped(ROOTS_LIST),

  [TASKS_LIST]: serverScoped(TASKS_LIST),
  [TASKS_GET]: resourceScoped(TASKS_GET, "task", "params.taskId"),
  [TASKS_RESULT]: resourceScoped(TASKS_RESULT, "task", "params.taskId"),
  [TASKS_CANCEL]: resourceScoped(TASKS_CANCEL, "task", "params.taskId"),
} satisfies Partial<Record<SdkMethod, AuthZenMapping>>;
