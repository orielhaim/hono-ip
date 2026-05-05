# hono-ip

Resolve the real client IP in [Hono](https://hono.dev) without getting spoofed.

Works on Node, Bun, Deno, and Cloudflare Workers. Three dependencies, no regex parsing of security-sensitive headers, branded types end-to-end.

## Why this exists

Most "get the client IP" libraries try a list of headers in a fixed order and return the first one that looks like an address. That's the bug. `X-Real-IP`, `X-Client-IP`, `True-Client-IP` - any client can send any of those, and most servers will believe them. The result is silent IP spoofing affecting rate limits, audit logs, fraud signals, and geofencing.

`hono-ip` inverts the model. The operator declares the topology - "I'm behind Cloudflare," "I'm behind nginx with one trusted hop," "I'm direct" - and the middleware reads only what's been declared trustworthy. There is no fallback chain that can be tricked. There is no "try every header" mode.

## Install

```bash
npm install hono-ip
```

## A minimal example

```ts
import { Hono } from "hono";
import { ipMiddleware, cloudflare } from "hono-ip";

const app = new Hono();
app.use(ipMiddleware({ strategy: cloudflare() }));

app.get("/", (c) => c.text(`Hello ${c.var.ip ?? "stranger"}`));
```

`c.var.ip` is typed as `IpAddress | null`, where `IpAddress` is a branded string. You cannot pass a raw, unvalidated string where an `IpAddress` is expected - the validator is the only constructor.

## Strategies

A strategy tells the middleware exactly where to look and how to interpret what it finds. Pick one that matches your deployment.

### Behind a known CDN

Presets exist for the common ones. Each reads a single platform-specific header and trusts it directly, because the platform strips client-supplied copies before your code runs.

```ts
import { ipMiddleware, cloudflare, fly, vercel } from "hono-ip";

app.use(ipMiddleware({ strategy: cloudflare() })); // CF-Connecting-IP
app.use(ipMiddleware({ strategy: fly() }));        // Fly-Client-IP
app.use(ipMiddleware({ strategy: vercel() }));     // X-Real-IP behind Vercel
```

For any other platform that sets a single trusted header, use `single-header` directly:

```ts
app.use(ipMiddleware({
  strategy: { kind: "single-header", header: "x-azure-clientip" },
}));
```

### Behind a reverse proxy you control

Walks `X-Forwarded-For` right-to-left, skipping any address that matches your trusted CIDR ranges, and returns the first untrusted hop. That hop is, by definition, the closest address your proxy chain didn't add.

```ts
import { ipMiddleware, behindReverseProxy } from "hono-ip";

app.use(ipMiddleware({
  strategy: behindReverseProxy({
    trustedProxies: ["loopback", "uniquelocal", "10.42.0.0/16"],
  }),
}));
```

`trustedProxies` accepts CIDR strings, named presets (`loopback`, `linklocal`, `uniquelocal`, `private`, `cloudflare`), or a custom predicate `(ip) => boolean` for fully dynamic trust (e.g. Kubernetes pod CIDRs resolved at startup). Validation happens at compile time - invalid CIDRs throw before the middleware ever runs.

### RFC 7239 Forwarded header

If your infrastructure emits the standardized `Forwarded` header instead of (or alongside) XFF:

```ts
app.use(ipMiddleware({
  strategy: {
    kind: "forwarded-rightmost-untrusted",
    trustedProxies: ["loopback", "uniquelocal"],
  },
}));
```

Parsing uses `forwarded-parse`, the only widely-vetted spec-compliant parser. Malformed headers - including [sabotage attempts](https://adam-p.ca/blog/2022/03/forwarded-header-sabotage/) using unclosed quotes - cause the entire header to be discarded rather than partially interpreted.

### Direct connections

When there's no proxy, fall back to the runtime's connection info. You import the helper for your runtime to keep the package free of cross-runtime imports.

```ts
import { ipMiddleware, direct } from "hono-ip";
import { getConnInfo } from "@hono/node-server/conninfo"; // or hono/bun, hono/deno

app.use(ipMiddleware({ strategy: direct(getConnInfo) }));
```

### Hybrid deployments

Compose strategies with `first-of`. Each child carries its own trust configuration, so the composition stays safe.

```ts
import { ipMiddleware } from "hono-ip";
import { getConnInfo } from "hono/bun";

app.use(ipMiddleware({
  strategy: {
    kind: "first-of",
    strategies: [
      { kind: "single-header", header: "cf-connecting-ip" },
      { kind: "conn-info", getConnInfo },
    ],
  },
}));
```

## Audit and observability

Every resolution is recorded as a tagged outcome. The middleware writes both the IP and the full outcome to the context, so you can log exactly which strategy succeeded, which hop index was chosen, or which failure mode occurred.

```ts
app.use(ipMiddleware({
  strategy: behindReverseProxy({ trustedProxies: ["loopback"] }),
  onFailure: (outcome) => {
    // outcome.reason: "no-header" | "header-empty" | "all-hops-trusted"
    //               | "header-too-large" | "too-many-entries" | ...
    logger.warn({ outcome }, "ip resolution failed");
  },
}));

app.get("/debug", (c) => {
  const outcome = c.var.ipOutcome;
  if (outcome.ok) {
    return c.json({ ip: outcome.ip, source: outcome.source, hop: outcome.hopIndex });
  }
  return c.json({ failed: outcome.reason }, 400);
});
```

For endpoints that genuinely cannot serve a request without a client IP - rate limiters, fraud scoring, geofencing - set `required: true` to short-circuit with `400` when resolution fails.

```ts
app.use("/api/*", ipMiddleware({
  strategy: cloudflare(),
  required: true,
}));
```

## Custom variable names

The variable name flows through the type system. Whatever name you pass becomes a typed property on `c.var`.

```ts
app.use(ipMiddleware({ strategy: cloudflare(), variable: "clientIp" }));

app.get("/", (c) => {
  c.var.clientIp; // IpAddress | null, fully typed
});
```

## Direct API

The middleware is a thin wrapper around composable primitives. Use them directly when you need finer control:

```ts
import {
  parseIp,           // (raw: string) => IpAddress | null
  extractIp,         // unwraps "[::1]:443", "1.2.3.4:80", brackets, zone IDs
  isIpV4, isIpV6,    // type predicates narrowing IpAddress -> IpV4 / IpV6
  parseXForwardedFor,
  parseForwarded,    // RFC 7239, returns left-to-right chain
  compileTrust,      // build a reusable CIDR matcher from preset names + CIDRs
  compileStrategy,   // pre-build a resolver, run it against any Hono context
} from "hono-ip";
```

All parsers return discriminated unions. All validators return branded types or `null`. There are no thrown exceptions on the request path.

## What's enforced for you

IPv6 addresses are normalized; zone identifiers (`fe80::1%eth0`) are stripped before validation. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is collapsed to the v4 form so rate-limit keys are consistent. Only four-part-decimal IPv4 is accepted - odd forms like `0xc0.168.1.1` are rejected to prevent parser-mismatch vulnerabilities. Headers larger than 8 KiB or containing more than 50 entries are refused outright, neutralizing header-flood attacks. Trusted-proxy CIDR ranges are compiled once at middleware construction; the per-request hot path is a header read, a bounded split, and a linear scan with bitmask comparisons.

## Strategy reference

| Strategy | When to use | Reads | Trust model |
|---|---|---|---|
| `single-header` | Behind a CDN that sets and strips its own header | One specific header | Implicit - the platform is the perimeter |
| `xff-rightmost-untrusted` | Behind your own reverse proxy chain | `X-Forwarded-For` | CIDR ranges you declare |
| `forwarded-rightmost-untrusted` | Modern proxy emitting RFC 7239 | `Forwarded` | CIDR ranges you declare |
| `xff-leftmost-insecure` | Migration only - flagged in audit logs | `X-Forwarded-For` | None (spoofable) |
| `conn-info` | Direct connections, no proxy | TCP socket | Inherent (cannot be spoofed) |
| `first-of` | Hybrid environments | Children in order | Each child carries its own |

## License

[Apache-2.0](LICENSE)
