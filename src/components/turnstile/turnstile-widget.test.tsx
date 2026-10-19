import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { TurnstileWidget } from "./turnstile-widget";

const turnstile = { render: vi.fn(() => "widget-1"), reset: vi.fn(), remove: vi.fn() };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  window.turnstile = turnstile;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete window.turnstile;
});

it("issues a fresh challenge and clears the spent token when resetKey changes", async () => {
  const onToken = vi.fn();
  const { rerender } = render(<TurnstileWidget onToken={onToken} />);
  await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
  expect(turnstile.reset).not.toHaveBeenCalled();

  rerender(<TurnstileWidget onToken={onToken} resetKey={1} />);
  expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  expect(onToken).toHaveBeenLastCalledWith(null);
});
