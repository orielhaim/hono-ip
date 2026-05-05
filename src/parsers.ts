import forwardedParse from "forwarded-parse";
import { extractIp } from "./validate.js";
import {
  MAX_CHAIN_ENTRIES,
  MAX_HEADER_BYTES,
  type IpAddress,
  type NonEmptyReadonlyArray,
} from "./types.js";

export type ChainParseResult =
  | {
      readonly ok: true;
      readonly chain: NonEmptyReadonlyArray<IpAddress>;
    }
  | {
      readonly ok: false;
      readonly reason: "too-large" | "too-many" | "empty";
    };

function asNonEmpty<T>(arr: T[]): NonEmptyReadonlyArray<T> | null {
  if (arr.length === 0) return null;
  return arr as unknown as NonEmptyReadonlyArray<T>;
}

export function parseXForwardedFor(raw: string | undefined): ChainParseResult {
  if (!raw) return { ok: false, reason: "empty" };
  if (raw.length > MAX_HEADER_BYTES) return { ok: false, reason: "too-large" };

  const parts = raw.split(",");
  if (parts.length > MAX_CHAIN_ENTRIES) {
    return { ok: false, reason: "too-many" };
  }

  const chain: IpAddress[] = [];
  for (const part of parts) {
    const ip = extractIp(part);
    if (ip) chain.push(ip);
  }
  const nonEmpty = asNonEmpty(chain);
  if (!nonEmpty) return { ok: false, reason: "empty" };
  return { ok: true, chain: nonEmpty };
}

export function parseForwarded(raw: string | undefined): ChainParseResult {
  if (!raw) return { ok: false, reason: "empty" };
  if (raw.length > MAX_HEADER_BYTES) return { ok: false, reason: "too-large" };

  let entries: ReadonlyArray<Record<string, string>>;
  try {
    entries = forwardedParse(raw);
  } catch {
    return { ok: false, reason: "empty" };
  }

  if (entries.length > MAX_CHAIN_ENTRIES) {
    return { ok: false, reason: "too-many" };
  }

  const chain: IpAddress[] = [];
  for (const entry of entries) {
    const forValue = entry.for;
    if (!forValue) continue;
    const ip = extractIp(forValue);
    if (ip) chain.push(ip);
  }
  const nonEmpty = asNonEmpty(chain);
  if (!nonEmpty) return { ok: false, reason: "empty" };
  return { ok: true, chain: nonEmpty };
}
