import { runRetention, type RetentionDatabase, type RetentionOptions } from "./index";

/** The parts of the Workers scheduled() arguments this handler reads. */
export interface RetentionScheduledController {
  cron: string;
  scheduledTime: number;
}

export interface RetentionScheduledEnv {
  DB?: RetentionDatabase;
}

export interface RetentionExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Nightly cron (wrangler.jsonc "triggers"). Uses the scheduled time, not the
 * wall clock, so a delayed run expires the same rows. A failure is logged and
 * rethrown so Cloudflare records the run as failed; the next night retries.
 */
export async function handleRetentionCron(
  controller: RetentionScheduledController,
  env: RetentionScheduledEnv,
  ctx: RetentionExecutionContext,
  options?: RetentionOptions,
): Promise<void> {
  if (!env.DB) {
    console.error("[retention] DB binding missing");
    return;
  }
  const run = runRetention(env.DB, new Date(controller.scheduledTime), options).then(
    (result) => console.log("[retention]", controller.cron, JSON.stringify(result)),
    (err: unknown) => {
      console.error("[retention]", err);
      throw err;
    },
  );
  ctx.waitUntil(run);
  await run;
}
