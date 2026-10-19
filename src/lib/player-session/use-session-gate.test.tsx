import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { STORAGE_KEYS } from "./constants";
import { useSessionGate } from "./use-session-gate";

function GateKind() {
  const gate = useSessionGate();
  return <p>{gate.kind}</p>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it("renders an anonymous visitor without looping", () => {
  render(<GateKind />);
  expect(screen.getByText("anonymous")).toBeTruthy();
});

it("renders a stored session without looping", () => {
  window.localStorage.setItem(STORAGE_KEYS.deviceToken, "token");
  window.localStorage.setItem(STORAGE_KEYS.playerId, "p1");
  window.localStorage.setItem(STORAGE_KEYS.playerName, "Player");
  window.localStorage.setItem(STORAGE_KEYS.ageVerified, "1");
  window.localStorage.setItem(STORAGE_KEYS.judgeNoticeAck, "1");
  render(<GateKind />);
  expect(screen.getByText("ready")).toBeTruthy();
});
