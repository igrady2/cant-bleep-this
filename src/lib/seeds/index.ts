import seedFile from "../../../fixtures/seeds.json";

import { assertValidSeedFixtureFile } from "./validate";
import type { SeedFixture, SeedFixtureFile } from "./types";

const data = seedFile as SeedFixtureFile;

assertValidSeedFixtureFile(data);

export const SEED_FIXTURES: readonly SeedFixture[] = data.fixtures;
export const SEED_POLICY_VERSION = data.policyVersion;

export { validateSeedFixtureFile, assertValidSeedFixtureFile } from "./validate";
export type { SeedFixture, SeedContextLine, SeedExpectedVerdict, SeedFixtureFile } from "./types";
