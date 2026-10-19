import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { OnboardingFlow } from "./onboarding-flow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const turnstile = {
  render: vi.fn((_container: HTMLElement, options: { callback: (token: string) => void }) => {
    options.callback("token-1");
    return "widget-1";
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  window.turnstile = turnstile;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete window.turnstile;
});

async function submitClaim() {
  render(<OnboardingFlow />);
  fireEvent.click(screen.getByRole("button", { name: "Enter the room" }));
  fireEvent.click(screen.getByRole("button", { name: "I am 18 or older" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "user_32958" } });
  await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Claim username" }));
}

it.each([
  [409, "That username is taken."],
  [400, "That username is not allowed. Pick another one."],
  [429, "Too many claims today."],
])("resets the challenge after a %s claim response", async (status, error) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status })));
  await submitClaim();
  expect(await screen.findByText(error)).toBeTruthy();
  expect(turnstile.reset).toHaveBeenCalledTimes(1);
  expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  expect((screen.getByRole("button", { name: "Claim username" }) as HTMLButtonElement).disabled).toBe(false);
});

it("recovers and resets the challenge when the claim request throws", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await submitClaim();
  expect(await screen.findByText("We couldn't reach the server. Check your connection and try again.")).toBeTruthy();
  expect(turnstile.reset).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "Claim username" }) as HTMLButtonElement).disabled).toBe(false);
});
