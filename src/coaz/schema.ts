import { z } from "zod/v4";

const MappingObject = z.record(z.string(), z.unknown());

const EvaluationEntry = z.object({
  action: MappingObject.optional(),
  resource: MappingObject,
});

function containsTokenRef(value: unknown): boolean {
  if (typeof value === "string") {
    return /(^|[^a-zA-Z0-9_])token(\.|\[)/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).some(containsTokenRef);
  }
  if (Array.isArray(value)) return value.some(containsTokenRef);
  return false;
}

export const AuthZenMappingSchema = z
  .object({
    subject: MappingObject,
    context: MappingObject.optional(),
    evaluations: z
      .array(EvaluationEntry)
      .min(1, "evaluations must have at least one entry"),
  })
  .check((ctx) => {
    if (!containsTokenRef(ctx.value.subject)) {
      ctx.issues.push({
        code: "custom",
        message:
          "subject must contain at least one CEL expression referencing token.* — pinning the AuthZEN subject identity to the verified JWT",
        path: ["subject"],
        input: ctx.value,
      });
    }
  });

export const AuthZenInputSchemaExtension = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
  "x-authzen-mapping": AuthZenMappingSchema,
});

export function validateAuthZenMapping(
  mapping: unknown,
): z.infer<typeof AuthZenMappingSchema> {
  return AuthZenMappingSchema.parse(mapping);
}
