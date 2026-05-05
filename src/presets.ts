import type { Context } from "hono";
import type { Strategy } from "./strategies.js";

export const cloudflare = (): Strategy => ({
  kind: "single-header",
  header: "cf-connecting-ip",
});

export const fly = (): Strategy => ({
  kind: "single-header",
  header: "fly-client-ip",
});

export const vercel = (): Strategy => ({
  kind: "single-header",
  header: "x-real-ip",
});

export const behindReverseProxy = (
  opts: {
    trustedProxies?: Strategy & { kind: "xff-rightmost-untrusted" } extends {
      trustedProxies: infer T;
    }
      ? T
      : never;
  } = {},
): Strategy => ({
  kind: "xff-rightmost-untrusted",
  trustedProxies: opts.trustedProxies ?? ["loopback", "uniquelocal"],
});

export const direct = (
  getConnInfo: (c: Context) => { remote?: { address?: string } },
): Strategy => ({
  kind: "conn-info",
  getConnInfo,
});
