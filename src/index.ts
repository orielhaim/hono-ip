import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import {
  isIp,
  extractIp,
  getFirstFromXForwardedFor,
  parseForwarded,
  type XffOptions,
} from "./ip";

declare module "hono" {
  interface ContextVariableMap {
    ip: string | null;
  }
}

// ──────────────────────────────────────────────
// Header priority (same order as request-ip):
//   1. X-Client-IP
//   2. X-Forwarded-For  (leftmost valid, or rightmost untrusted)
//   3. CF-Connecting-IP
//   4. Fastly-Client-Ip
//   5. True-Client-Ip
//   6. X-Real-IP
//   7. X-Cluster-Client-IP
//   8. X-Forwarded / Forwarded-For / Forwarded (RFC 7239)
//   9. X-Appengine-User-Ip
//  10. Hono getConnInfo  (Bun / Node / CF Workers / …)
//  11. Cf-Pseudo-IPv4
// ──────────────────────────────────────────────

const SIMPLE_HEADERS = [
  "x-client-ip",
  "cf-connecting-ip",
  "fastly-client-ip",
  "true-client-ip",
  "x-real-ip",
  "x-cluster-client-ip",
] as const;

const FALLBACK_HEADERS = [
  "x-appengine-user-ip",
  "cf-pseudo-ipv4",
] as const;

function headerIp(c: Context, name: string): string | null {
  const v = c.req.header(name);
  if (!v) return null;
  const ip = v.trim();
  return isIp(ip) ? ip : null;
}

export interface IpMiddlewareOptions extends XffOptions {
  attributeName?: string;

  getConnInfo?: (c: Context) => { remote: { address?: string } };
}

export function getClientIp(c: Context, opts?: IpMiddlewareOptions): string | null {
  const xClientIp = headerIp(c, "x-client-ip");
  if (xClientIp) return xClientIp;

  const xff = getFirstFromXForwardedFor(c.req.header("x-forwarded-for"), opts);
  if (xff) return xff;

  for (const name of SIMPLE_HEADERS) {
    if (name === "x-client-ip") continue;
    const ip = headerIp(c, name);
    if (ip) return ip;
  }

  const xForwarded = headerIp(c, "x-forwarded");
  if (xForwarded) return xForwarded;

  const forwardedFor = headerIp(c, "forwarded-for");
  if (forwardedFor) return forwardedFor;

  const forwarded = parseForwarded(c.req.header("forwarded"));
  if (forwarded) return forwarded;

  for (const name of FALLBACK_HEADERS) {
    const ip = headerIp(c, name);
    if (ip) return ip;
  }

  if (opts?.getConnInfo) {
    try {
      const info = opts.getConnInfo(c);
      const addr = info?.remote?.address;
      if (addr && isIp(addr)) return addr;
    } catch {}
  }

  console.log("No IP found");
  return null;
}

export function ipMiddleware(opts: IpMiddlewareOptions = {}) {
  const key = (opts.attributeName ?? "ip") as "ip";

  return createMiddleware(async (c, next) => {
    c.set(key, getClientIp(c, opts));
    await next();
  });
}

export { isIp, isIpV4, isIpV6, extractIp, getFirstFromXForwardedFor, parseForwarded } from "./ip";