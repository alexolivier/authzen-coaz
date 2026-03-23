import { z } from "zod/v4";

const MappingObject = z.record(z.string(), z.unknown());

function containsTokenRef(obj: unknown): boolean {
  if (typeof obj === "string") return obj.startsWith("$token");
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.values(obj).some(containsTokenRef);
  }
  if (Array.isArray(obj)) return obj.some(containsTokenRef);
  return false;
}

export const CoazMappingSchema = z
  .object({
    subject: z
      .array(MappingObject)
      .min(1, "subject must have at least one element"),
    action: z.array(MappingObject).optional(),
    resource: z
      .array(MappingObject)
      .min(1, "resource must have at least one element"),
    context: z
      .array(MappingObject)
      .min(1, "context must have at least one element"),
  })
  .check((ctx) => {
    const { subject, context } = ctx.value;
    if (!containsTokenRef(subject)) {
      ctx.issues.push({
        code: "custom",
        message: "subject must contain at least one $token reference",
        path: ["subject"],
        input: ctx.value,
      });
    }
    if (!containsTokenRef(subject) && !containsTokenRef(context)) {
      ctx.issues.push({
        code: "custom",
        message:
          "at least one field across subject and context must reference $token",
        path: [],
        input: ctx.value,
      });
    }
  });

export const CoazInputSchemaExtension = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
  "x-coaz-mapping": CoazMappingSchema,
});

export const CoazToolSchema = z.object({
  name: z.string().min(1),
  coaz: z.literal(true),
  description: z.string(),
  inputSchema: CoazInputSchemaExtension,
});

export function validateCoazMapping(mapping: unknown): z.infer<typeof CoazMappingSchema> {
  return CoazMappingSchema.parse(mapping);
}

export function validateCoazTool(tool: unknown): z.infer<typeof CoazToolSchema> {
  return CoazToolSchema.parse(tool);
}
