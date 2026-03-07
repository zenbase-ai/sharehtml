import { Hono } from "hono";
import type { Env } from "../types.js";
import { getAuthenticatedUser } from "../utils/auth.js";
import { nanoid } from "../utils/ids.js";
import { sha256 } from "../utils/crypto.js";
import { getRegistry } from "../utils/registry.js";
import { TokensView } from "../frontend/tokens.js";
import { createMiddleware } from "hono/factory";

const tokens = new Hono<{ Bindings: Env }>();

const requireUser = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const user = await getAuthenticatedUser(c.req.raw, c.env);
  if (!user) return c.text("Unauthorized", 401);
  c.set("user" as never, user);
  await next();
});

tokens.use("/*", requireUser);

function getUser(c: { get: (key: string) => unknown }) {
  return c.get("user" as never) as { id: string; email: string };
}

// Generate a new token (replaces any existing one)
tokens.post("/generate", async (c) => {
  const user = getUser(c);
  const token = nanoid(32);
  const tokenHash = await sha256(token);

  const registry = getRegistry(c.env);
  await registry.createToken(tokenHash, user.email);

  return c.json({ token });
});

// Revoke token
tokens.post("/revoke", async (c) => {
  const user = getUser(c);
  const registry = getRegistry(c.env);
  await registry.deleteTokensForUser(user.email);
  return c.json({ ok: true });
});

// Token management page
tokens.get("/", async (c) => {
  const user = getUser(c);
  const registry = getRegistry(c.env);
  const token = await registry.getTokenForUser(user.email);
  return c.html(TokensView({ email: user.email, existing: token }));
});

export { tokens };
