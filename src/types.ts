declare const IpAddressBrand: unique symbol;
declare const IpV4Brand: unique symbol;
declare const IpV6Brand: unique symbol;
declare const CidrBrand: unique symbol;

export type IpAddress = string & { readonly [IpAddressBrand]: true };
export type IpV4 = IpAddress & { readonly [IpV4Brand]: true };
export type IpV6 = IpAddress & { readonly [IpV6Brand]: true };
export type Cidr = string & { readonly [CidrBrand]: true };

export type IpKind = "ipv4" | "ipv6";

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type ResolutionOutcome =
  | {
      readonly ok: true;
      readonly ip: IpAddress;
      readonly source: ResolutionSource;
      readonly hopIndex?: number;
    }
  | {
      readonly ok: false;
      readonly reason: ResolutionFailure;
      readonly attempted: ResolutionSource;
    };

export type ResolutionSource =
  | "single-header"
  | "xff-rightmost-untrusted"
  | "xff-leftmost-explicit-insecure"
  | "forwarded-rightmost-untrusted"
  | "conn-info"
  | "none";

export type ResolutionFailure =
  | "no-header"
  | "header-empty"
  | "header-malformed"
  | "all-hops-trusted"
  | "no-untrusted-hop"
  | "conn-info-unavailable"
  | "header-too-large"
  | "too-many-entries";

export const MAX_HEADER_BYTES = 8 * 1024;
export const MAX_CHAIN_ENTRIES = 50;
