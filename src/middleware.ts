import { createMiddleware } from "hono/factory";
import type { Env, MiddlewareHandler } from "hono";
import { compileStrategy, type Strategy } from "./strategies.js";
import type { IpAddress, ResolutionOutcome } from "./types.js";

export interface IpMiddlewareOptions<K extends string = "ip"> {
  readonly strategy: Strategy;
  readonly variable?: K;
  readonly onFailure?: (
    outcome: Extract<ResolutionOutcome, { ok: false }>,
  ) => void;
  readonly required?: boolean;
}

export type IpVariables<K extends string = "ip"> = {
  readonly [P in K]: IpAddress | null;
} & {
  readonly [P in `${K}Outcome`]: ResolutionOutcome;
};

export function ipMiddleware<K extends string = "ip">(
  opts: IpMiddlewareOptions<K>,
): MiddlewareHandler<{ Variables: IpVariables<K> } & Env> {
  const variable = (opts.variable ?? "ip") as K;
  const outcomeVar = `${variable}Outcome` as const;
  const resolve = compileStrategy(opts.strategy);

  return createMiddleware<{ Variables: IpVariables<K> }>(async (c, next) => {
    const outcome = resolve(c);

    c.set(variable as never, (outcome.ok ? outcome.ip : null) as never);
    c.set(outcomeVar as never, outcome as never);

    if (!outcome.ok) {
      opts.onFailure?.(outcome);
      if (opts.required) {
        return c.text("Unable to determine client IP", 400);
      }
    }

    await next();
  });
}
