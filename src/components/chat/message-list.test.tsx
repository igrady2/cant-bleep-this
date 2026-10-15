import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MessageList } from "./message-list";

afterEach(cleanup);
it.each(["pending", "slip", "clean", "caught", "false_positive", "excluded"] as const)("offers Judge only for pending messages: %s", (status) => {
  render(<MessageList showJudgeActions playerName="me" messages={[
    { id: "m", author: "sam", text: "hello", sentAt: 0, status },
  ]} />);
  expect(screen.queryByRole("link", { name: "Judge" }) !== null).toBe(status === "pending");
});
it("hides Judge on the player's own pending message", () => {
  render(<MessageList showJudgeActions playerName="me" messages={[
    { id: "m", author: "me", text: "hello", sentAt: 0, status: "pending" },
  ]} />);
  expect(screen.queryByRole("link", { name: "Judge" })).toBeNull();
});
