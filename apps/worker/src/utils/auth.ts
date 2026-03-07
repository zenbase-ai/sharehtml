import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Env, AppBindings } from "../types.js";
import { sha256 } from "./crypto.js";
import { getRegistry } from "./registry.js";

export interface AuthUser {
  id: string;
  email: string;
}

interface AccessJWTPayload extends JWTPayload {
  email?: string;
  sub?: string;
}

// Bearer token auth for CLI API routes — resolves personal token to user email
export const apiAuth = createMiddleware<AppBindings>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.slice(7);

  // Dev mode fallback: accept legacy API_KEY
  if (c.env.AUTH_MODE !== "access") {
    if (c.env.API_KEY && token === c.env.API_KEY) {
      c.set("apiUser", "dev@localhost");
      await next();
      return;
    }
  }

  // Look up personal token
  const tokenHash = await sha256(token);
  const registry = getRegistry(c.env);
  const result = await registry.getTokenUser(tokenHash);

  if (!result) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (result.expired) {
    return c.json({ error: "token_expired" }, 401);
  }

  c.set("apiUser", result.user_email as string);
  await next();
});

// JWKS cache
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(teamName: string) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`),
    );
  }
  return jwksCache;
}

async function verifyAccessJWT(jwt: string, env: Env): Promise<AuthUser | null> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM) {
    console.error("ACCESS_AUD or ACCESS_TEAM not configured");
    return null;
  }

  try {
    const jwks = getJWKS(env.ACCESS_TEAM);
    const { payload } = await jwtVerify(jwt, jwks, {
      audience: env.ACCESS_AUD,
      issuer: `https://${env.ACCESS_TEAM}.cloudflareaccess.com`,
    });

    const accessPayload = payload as AccessJWTPayload;

    if (!accessPayload.sub || !accessPayload.email) {
      console.error("JWT missing sub or email claim");
      return null;
    }

    return {
      id: accessPayload.sub,
      email: accessPayload.email,
    };
  } catch (error) {
    console.error(
      "JWT verification failed",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function getAuthenticatedUser(request: Request, env: Env): Promise<AuthUser | null> {
  if (env.AUTH_MODE !== "access") {
    return { id: "dev", email: "dev@localhost" };
  }

  const jwt = request.headers.get("CF-Access-JWT-Assertion");
  if (!jwt) {
    return null;
  }

  return verifyAccessJWT(jwt, env);
}
