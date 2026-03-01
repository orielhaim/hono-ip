# hono-ip

A tiny, fast middleware for [Hono](https://hono.dev) that figures out your client's real IP address - even when your app sits behind proxies, load balancers, or CDNs.

Works on **Node.js** and **Bun** out of the box. No regex. No dependencies.

## Why?

Getting the "real" client IP in a web app is surprisingly annoying. Your server sees the proxy's address, not the user's. Different infrastructure stacks stuff the original IP into different headers - Cloudflare uses `CF-Connecting-IP`, AWS might use `X-Forwarded-For`, Fastly has its own thing, and so on.

This middleware checks all the common headers in a sensible order, validates every candidate with native `net.isIP` and hands you back a single, trustworthy string.

## Quick start

```bash
npm install hono-ip
```

```ts
import { Hono } from "hono";
import { ipMiddleware } from "hono-ip";

const app = new Hono();

app.use(ipMiddleware());

app.get("/", (c) => {
  const ip = c.get("ip"); // string | null
  return c.text(`Hello, ${ip ?? "stranger"}`);
});
```

That's it. Every route after the middleware can read `c.get("ip")` or `c.var.ip`.

## Going deeper

### Trusted proxies

By default, the middleware returns the **leftmost** IP from `X-Forwarded-For` - the classic approach. The problem is that a malicious client can prepend whatever they want to that header:

```
X-Forwarded-For: 6.6.6.6, <actual client>, <your proxy>
                 ↑ attacker injected this
```

If you know your proxy IPs, pass them in. The middleware will then walk `X-Forwarded-For` **from the right**, skipping trusted addresses, and return the first IP it doesn't recognise - which is the real client:

```ts
app.use(
  ipMiddleware({
    trustedProxies: new Set(["10.0.0.1", "10.0.0.2"]),
  })
);
```

### Runtime-level connection info

Headers can be spoofed. The one thing that _can't_ be faked is the TCP connection's remote address, which Hono exposes through its `getConnInfo` helper. Pass it in to use it as a final fallback:

```ts
// Bun
import { getConnInfo } from "hono/bun";

// Node.js
// import { getConnInfo } from "@hono/node-server/conninfo";

app.use(ipMiddleware({ getConnInfo }));
```

When no header yields a valid IP, the middleware will call `getConnInfo(c).remote.address` and use that instead. If `getConnInfo` throws (e.g. during tests where there's no real server), it's caught silently.

### Using `getClientIp` directly

You don't have to use the middleware. The core function is exported on its own:

```ts
import { getClientIp } from "hono-ip";

app.get("/ip", (c) => {
  const ip = getClientIp(c, {
    trustedProxies: new Set(["10.0.0.1"]),
  });
  return c.json({ ip });
});
```

### Custom context variable name

If `"ip"` collides with something in your app:

```ts
app.use(ipMiddleware({ attributeName: "clientIp" }));

// later
c.get("clientIp");
```

## Resolution order

The middleware checks these sources top-to-bottom and returns the first valid IP it finds:

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `X-Client-IP` | Set by some proxies and load balancers |
| 2 | `X-Forwarded-For` | Leftmost valid IP, or rightmost untrusted if `trustedProxies` is set |
| 3 | `CF-Connecting-IP` | Cloudflare |
| 4 | `Fastly-Client-Ip` | Fastly |
| 5 | `True-Client-Ip` | Akamai, Cloudflare enterprise |
| 6 | `X-Real-IP` | Nginx default config |
| 7 | `X-Cluster-Client-IP` | Rackspace, Riverbed |
| 8 | `X-Forwarded` | Non-standard single-IP variant |
| 9 | `Forwarded-For` | Non-standard single-IP variant |
| 10 | `Forwarded` | RFC 7239 - parses `for="..."` value, handles bracketed IPv6 |
| 11 | `X-Appengine-User-Ip` | Google App Engine |
| 12 | `getConnInfo()` | Hono runtime adapter (Bun / Node / CF Workers / Deno / …) |
| 13 | `Cf-Pseudo-IPv4` | Cloudflare pseudo IPv4 for IPv6 visitors |

## License
Apache-2.0