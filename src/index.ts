export type {
  IpAddress,
  IpV4,
  IpV6,
  IpKind,
  Cidr,
  ResolutionOutcome,
  ResolutionSource,
  ResolutionFailure,
} from "./types.js";

export {
  parseIp,
  extractIp,
  isIpV4,
  isIpV6,
  ipKind,
  isCidr,
} from "./validate.js";
export {
  compileTrust,
  PRESETS,
  type TrustedProxiesInput,
  type PresetName,
} from "./trust.js";
export { parseXForwardedFor, parseForwarded } from "./parsers.js";
export type { Strategy } from "./strategies.js";
export {
  cloudflare,
  fly,
  vercel,
  behindReverseProxy,
  direct,
} from "./presets.js";
export {
  ipMiddleware,
  type IpMiddlewareOptions,
  type IpVariables,
} from "./middleware.js";
