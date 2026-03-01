import { isIP as _netIsIP } from "node:net";

export function isIp(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  return _netIsIP(value) !== 0;
}

export function isIpV4(value: string): boolean {
  return _netIsIP(value) === 4;
}

export function isIpV6(value: string): boolean {
  return _netIsIP(value) === 6;
}

function unwrapIPv6(raw: string): string {
  if (raw.startsWith("[")) {
    const closeBracket = raw.indexOf("]");
    if (closeBracket === -1) return raw;
    return raw.slice(1, closeBracket);
  }
  return raw;
}

function stripIPv4Port(raw: string): string {
  const colon = raw.lastIndexOf(":");
  if (colon === -1) return raw;
  const maybeIp = raw.slice(0, colon);
  if (_netIsIP(maybeIp) === 4) return maybeIp;
  return raw;
}

export function extractIp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let ip = raw.trim();
  if (!ip) return null;

  if (ip.startsWith("[")) {
    ip = unwrapIPv6(ip);
  } else {
    ip = stripIPv4Port(ip);
  }

  return isIp(ip) ? ip : null;
}

export interface XffOptions {
  trustedProxies?: ReadonlySet<string>;
}

export function getFirstFromXForwardedFor(
  value: string | null | undefined,
  opts?: XffOptions,
): string | null {
  if (!value || typeof value !== "string") return null;

  const parts = value.split(",");
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ip = extractIp(parts[i]);
    if (ip) cleaned.push(ip);
  }

  if (cleaned.length === 0) return null;

  if (!opts?.trustedProxies) return cleaned[0]!;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (!opts.trustedProxies.has(cleaned[i]!)) return cleaned[i]!;
  }

  return cleaned[0]!;
}

const FORWARDED_FOR_RE = /for=(?:"([^"]+)"|([^;\s,]+))/i;

export function parseForwarded(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const m = FORWARDED_FOR_RE.exec(value);
  if (!m) return null;
  return extractIp(m[1] ?? m[2]);
}