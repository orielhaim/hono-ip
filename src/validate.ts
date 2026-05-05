import ipaddr from "ipaddr.js";
import type { IpAddress, IpV4, IpV6, IpKind, Cidr } from "./types.js";

export function parseIp(raw: string): IpAddress | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const zoneIdx = trimmed.indexOf("%");
  const candidate = zoneIdx === -1 ? trimmed : trimmed.slice(0, zoneIdx);

  if (ipaddr.IPv4.isValidFourPartDecimal(candidate)) {
    return candidate as IpAddress;
  }
  if (ipaddr.IPv6.isValid(candidate)) {
    const v6 = ipaddr.IPv6.parse(candidate);
    if (v6.isIPv4MappedAddress()) {
      return v6.toIPv4Address().toString() as IpAddress;
    }
    return v6.toNormalizedString() as IpAddress;
  }
  return null;
}

export function isIpV4(ip: IpAddress): ip is IpV4 {
  return ipaddr.IPv4.isValidFourPartDecimal(ip);
}

export function isIpV6(ip: IpAddress): ip is IpV6 {
  return !isIpV4(ip);
}

export function ipKind(ip: IpAddress): IpKind {
  return isIpV4(ip) ? "ipv4" : "ipv6";
}

export function extractIp(raw: string): IpAddress | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;

  if (s.startsWith("[")) {
    const close = s.indexOf("]");
    if (close === -1) return null;
    s = s.slice(1, close);
    return parseIp(s);
  }

  const firstColon = s.indexOf(":");
  const lastColon = s.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    const left = s.slice(0, firstColon);
    if (ipaddr.IPv4.isValidFourPartDecimal(left)) {
      return parseIp(left);
    }
  }
  return parseIp(s);
}

export function isCidr(value: string): value is Cidr {
  return ipaddr.isValidCIDR(value);
}
