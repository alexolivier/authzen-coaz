import { createRemoteJWKSet, jwtVerify } from "jose";
import { log } from "../log.js";

export interface TokenValidationConfig {
  jwksUri: string;
  issuer: string;
  audience: string;
}

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedJWKSUri: string | undefined;

function getJWKS(uri: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJWKS && cachedJWKSUri === uri) return cachedJWKS;
  cachedJWKS = createRemoteJWKSet(new URL(uri));
  cachedJWKSUri = uri;
  return cachedJWKS;
}

export async function verifyAndExtractClaims(
  token: string,
  config: TokenValidationConfig,
): Promise<Record<string, unknown>> {
  log("AUTH", `verifying JWT (issuer=${config.issuer}, audience=${config.audience})`);
  const jwks = getJWKS(config.jwksUri);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience: config.audience,
  });
  log("AUTH", `token verified sub=${payload.sub} role=${(payload as Record<string, unknown>).role}`);
  return payload as Record<string, unknown>;
}
