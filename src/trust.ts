import ipaddr from "ipaddr.js";
import type { IpAddress, Cidr } from "./types.js";
import { isCidr } from "./validate.js";

export const PRESETS = {
  loopback: ["127.0.0.0/8", "::1/128"],
  linklocal: ["169.254.0.0/16", "fe80::/10"],
  uniquelocal: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"],
  private: [
    "127.0.0.0/8",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "fc00::/7",
    "fe80::/10",
  ],
  cloudflare: [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PresetName = keyof typeof PRESETS;

export type TrustedProxiesInput =
  | ReadonlyArray<string | PresetName>
  | ((ip: IpAddress) => boolean)
  | "all"
  | "none";

type ParsedRange = readonly [ipaddr.IPv4 | ipaddr.IPv6, number];

export type TrustFn = (ip: IpAddress) => boolean;

export function compileTrust(input: TrustedProxiesInput): TrustFn {
  if (input === "all") return () => true;
  if (input === "none") return () => false;
  if (typeof input === "function") return input;

  const v4Ranges: ParsedRange[] = [];
  const v6Ranges: ParsedRange[] = [];

  for (const entry of input) {
    if (entry in PRESETS) {
      for (const cidr of PRESETS[entry as PresetName]) {
        pushRange(cidr, v4Ranges, v6Ranges);
      }
    } else {
      if (!isCidr(entry)) {
        throw new Error(
          `[ip-middleware] Invalid CIDR or preset name: "${entry}"`,
        );
      }
      pushRange(entry, v4Ranges, v6Ranges);
    }
  }

  return (ip: IpAddress): boolean => {
    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      parsed = ipaddr.parse(ip);
    } catch {
      return false;
    }
    const ranges = parsed.kind() === "ipv4" ? v4Ranges : v6Ranges;
    for (const range of ranges) {
      if (parsed.match(range as [typeof parsed, number])) return true;
    }
    return false;
  };
}

function pushRange(cidr: string, v4: ParsedRange[], v6: ParsedRange[]): void {
  const [addr, bits] = ipaddr.parseCIDR(cidr as Cidr);
  if (addr.kind() === "ipv4") v4.push([addr, bits]);
  else v6.push([addr, bits]);
}
