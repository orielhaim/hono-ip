import type { Context } from "hono";
import { parseIp } from "./validate.js";
import { parseXForwardedFor, parseForwarded } from "./parsers.js";
import {
  compileTrust,
  type TrustedProxiesInput,
  type TrustFn,
} from "./trust.js";
import type { IpAddress, ResolutionOutcome } from "./types.js";

export type Strategy =
  | { readonly kind: "single-header"; readonly header: string }
  | {
      readonly kind: "xff-rightmost-untrusted";
      readonly trustedProxies: TrustedProxiesInput;
    }
  | { readonly kind: "xff-leftmost-insecure" }
  | {
      readonly kind: "forwarded-rightmost-untrusted";
      readonly trustedProxies: TrustedProxiesInput;
    }
  | {
      readonly kind: "conn-info";
      readonly getConnInfo: (c: Context) => { remote?: { address?: string } };
    }
  | { readonly kind: "first-of"; readonly strategies: readonly Strategy[] };

type Resolver = (c: Context) => ResolutionOutcome;

export function compileStrategy(strategy: Strategy): Resolver {
  switch (strategy.kind) {
    case "single-header":
      return resolveSingleHeader(strategy.header.toLowerCase());
    case "xff-rightmost-untrusted":
      return resolveXffTrusted(compileTrust(strategy.trustedProxies));
    case "xff-leftmost-insecure":
      return resolveXffLeftmost();
    case "forwarded-rightmost-untrusted":
      return resolveForwardedTrusted(compileTrust(strategy.trustedProxies));
    case "conn-info":
      return resolveConnInfo(strategy.getConnInfo);
    case "first-of": {
      const compiled = strategy.strategies.map(compileStrategy);
      return (c) => {
        let lastFailure: ResolutionOutcome = {
          ok: false,
          reason: "no-header",
          attempted: "none",
        };
        for (const r of compiled) {
          const out = r(c);
          if (out.ok) return out;
          lastFailure = out;
        }
        return lastFailure;
      };
    }
  }
}

function resolveSingleHeader(header: string): Resolver {
  return (c) => {
    const raw = c.req.header(header);
    if (!raw) {
      return { ok: false, reason: "no-header", attempted: "single-header" };
    }
    const ip = parseIp(raw);
    if (!ip) {
      return {
        ok: false,
        reason: "header-malformed",
        attempted: "single-header",
      };
    }
    return { ok: true, ip, source: "single-header" };
  };
}

function resolveXffTrusted(trust: TrustFn): Resolver {
  return (c) => {
    const result = parseXForwardedFor(c.req.header("x-forwarded-for"));
    return walkChainTrusted(result, trust, "xff-rightmost-untrusted");
  };
}

function resolveForwardedTrusted(trust: TrustFn): Resolver {
  return (c) => {
    const result = parseForwarded(c.req.header("forwarded"));
    return walkChainTrusted(result, trust, "forwarded-rightmost-untrusted");
  };
}

function walkChainTrusted(
  parsed: ReturnType<typeof parseXForwardedFor>,
  trust: TrustFn,
  source: "xff-rightmost-untrusted" | "forwarded-rightmost-untrusted",
): ResolutionOutcome {
  if (!parsed.ok) {
    const reason =
      parsed.reason === "too-large"
        ? "header-too-large"
        : parsed.reason === "too-many"
          ? "too-many-entries"
          : "header-empty";
    return { ok: false, reason, attempted: source };
  }

  const { chain } = parsed;
  for (let i = chain.length - 1; i >= 0; i--) {
    const ip: IpAddress = chain[i] as IpAddress;
    if (!trust(ip)) {
      return { ok: true, ip, source, hopIndex: i };
    }
  }
  return { ok: false, reason: "all-hops-trusted", attempted: source };
}

function resolveXffLeftmost(): Resolver {
  return (c) => {
    const result = parseXForwardedFor(c.req.header("x-forwarded-for"));
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason === "empty" ? "header-empty" : "header-malformed",
        attempted: "xff-leftmost-explicit-insecure",
      };
    }

    const [head] = result.chain;
    return {
      ok: true,
      ip: head,
      source: "xff-leftmost-explicit-insecure",
      hopIndex: 0,
    };
  };
}

function resolveConnInfo(
  getConnInfo: (c: Context) => { remote?: { address?: string } },
): Resolver {
  return (c) => {
    let addr: string | undefined;
    try {
      addr = getConnInfo(c)?.remote?.address;
    } catch {
      return {
        ok: false,
        reason: "conn-info-unavailable",
        attempted: "conn-info",
      };
    }
    if (!addr) {
      return {
        ok: false,
        reason: "conn-info-unavailable",
        attempted: "conn-info",
      };
    }
    const ip = parseIp(addr);
    if (!ip) {
      return { ok: false, reason: "header-malformed", attempted: "conn-info" };
    }
    return { ok: true, ip, source: "conn-info" };
  };
}
