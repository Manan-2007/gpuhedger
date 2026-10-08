import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("explains a missing browser wallet instead of wagmi's raw message", () => {
    const err = Object.assign(new Error("Provider not found.\n\nVersion: @wagmi/core@2.22.1"), {
      name: "ProviderNotFoundError",
      shortMessage: "Provider not found.",
    });
    expect(friendlyError(err)).toMatch(/No browser wallet detected/);
  });

  it("never leaks a library version string", () => {
    const err = Object.assign(new Error("Connector not connected.\n\nVersion: @wagmi/core@2.22.1"), { shortMessage: "Connector not connected." });
    expect(friendlyError(err)).toBe("Connector not connected.");
  });

  it("recognizes a rejected signature", () => {
    expect(friendlyError(new Error("MetaMask Tx Signature: User denied transaction signature."))).toMatch(/rejected the request/);
  });

  it("handles empty input", () => {
    expect(friendlyError(undefined)).toBe("Something went wrong.");
  });
});
