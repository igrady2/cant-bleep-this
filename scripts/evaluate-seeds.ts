/**
 * Live seed baseline runner. Requires --live and TYPESAFE_API_KEY (see docs/SEED_EVALUATION.md).
 * CI and agents should not run this without explicit cost clearance.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { SEED_FIXTURES } from "../src/lib/seeds/index";
import { evaluateSeedFixtures, serializeSeedEvalReport } from "../src/lib/seeds/evaluate";

const DEFAULT_OUTPUT = path.join("reports", "seed-baseline.json");

export interface EvaluateSeedsCliOptions {
  output: string;
  live: boolean;
}

export function parseEvaluateSeedsArgs(argv: string[]): EvaluateSeedsCliOptions {
  let output = DEFAULT_OUTPUT;
  let live = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") {
      live = true;
    } else if (arg === "--output" || arg === "-o") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --output");
      output = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { output, live };
}

function printUsage(): void {
  console.log(`Usage: npm run evaluate:seeds -- --live [--output path]

Runs all seed fixtures through contextual moderation (one Jev request per fixture).
Requires --live so accidental runs do not bill Jev. Also requires TYPESAFE_API_KEY.

Writes a JSON baseline report (fixture ids only; no message bodies).

Default output: ${DEFAULT_OUTPUT}
`);
}

async function main(): Promise<void> {
  const { output, live } = parseEvaluateSeedsArgs(process.argv);

  if (!live) {
    console.error(
      "Refusing to run without --live. This command bills one Jev request per seed fixture. Pass --live only when you intend to spend API quota.",
    );
    printUsage();
    process.exit(1);
  }

  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    console.error(
      "TYPESAFE_API_KEY is not set. Add it to the environment or .dev.vars before running a live baseline.",
    );
    process.exit(1);
  }

  console.log(
    `Evaluating ${SEED_FIXTURES.length} seed fixtures (one Jev request each). Output: ${output}`,
  );
  const report = await evaluateSeedFixtures(SEED_FIXTURES);
  const dir = path.dirname(output);
  await mkdir(dir, { recursive: true });
  await writeFile(output, serializeSeedEvalReport(report), "utf8");
  console.log(
    `Done. pass=${report.summary.pass} catch=${report.summary.catch} miss=${report.summary.miss} falsePositive=${report.summary.falsePositive} contextualFailures=${report.summary.contextualFailures}`,
  );
  if (report.summary.errors > 0) {
    process.exit(2);
  }
}

const isCliEntry =
  typeof process.argv[1] === "string" && process.argv[1].includes("evaluate-seeds");

if (isCliEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
