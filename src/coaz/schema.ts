import { z } from "zod/v4";

const MappingObject = z.record(z.string(), z.unknown());

const EvaluationEntry = z.object({
  action: MappingObject.optional(),
  resource: MappingObject,
});

export const AuthZenMappingSchema = z.object({
  subject: MappingObject,
  context: MappingObject.optional(),
  evaluations: z
    .array(EvaluationEntry)
    .min(1, "evaluations must have at least one entry"),
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
