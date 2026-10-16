import { describe, expect, it } from "vitest";
import { Anonymizer, candidateUsernames, standInName } from "./anonymize";

describe("standInName", () => {
  it("counts Player A to Z, then two letters", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(standInName)).toEqual([
      "Player A", "Player B", "Player Z", "Player AA", "Player AB", "Player AZ", "Player BA",
    ]);
  });
});

describe("Anonymizer", () => {
  it("gives each player one stand-in across usernames and text, in first-seen order", () => {
    const anonymizer = new Anonymizer(new Set(["eion_m", "aifie", "kai"]));
    expect(anonymizer.username("alfie")).toBe("Player A");
    expect(anonymizer.text("elon_m is pro alfie")).toBe("Player B is pro Player A");
    expect(anonymizer.text("'pro ALFIE' is about alfie, says Kai")).toBe("'pro Player A' is about Player A, says Player C");
    expect(anonymizer.username("elon_m")).toBe("Player B");
  });

  it("matches look-alike spellings but never parts of longer words", () => {
    const anonymizer = new Anonymizer(new Set(["kai"]));
    expect(anonymizer.text("ka1 and kai's friend kaiser, kai_two")).toBe("Player A and Player A's friend kaiser, kai_two");
  });

  it("does not re-match a stand-in when a player is named Player", () => {
    const anonymizer = new Anonymizer(new Set(["piayer", "sam"]));
    expect(anonymizer.text("sam told Player hi")).toBe("Player A told Player B hi");
  });
});

describe("candidateUsernames", () => {
  it("returns normalized tokens within username length", () => {
    expect(candidateUsernames(["hi Al, A1ex says @rowan!", "Alex"]).sort()).toEqual(["aiex", "rowan", "says"]);
  });
});
