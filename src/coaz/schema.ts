import { z } from "zod/v4";

const MappingObject = z.record(z.string(), z.unknown());

const EvaluationEntry = z.object({
  action: MappingObject.optional(),
  resource: MappingObject,
});

const TOKEN_REF = /(^|[^a-zA-Z0-9_])token(\.|\[)/;

export const AuthZenMappingSchema = z
  .object({
    subject: MappingObject,
    context: MappingObject.optional(),
    evaluations: z
      .array(EvaluationEntry)
      .min(1, "evaluations must have at least one entry"),
  })
  .check((ctx) => {
    if (!TOKEN_REF.test(JSON.stringify(ctx.value.subject))) {
      ctx.issues.push({
        code: "custom",
        message:
          "subject must contain at least one CEL expression referencing token.* — pinning the AuthZEN subject identity to the verified JWT",
        path: ["subject"],
        input: ctx.value,
      });
    }
  });

export function validateAuthZenMapping(
  mapping: unknown,
): z.infer<typeof AuthZenMappingSchema> {
  return AuthZenMappingSchema.parse(mapping);
}
