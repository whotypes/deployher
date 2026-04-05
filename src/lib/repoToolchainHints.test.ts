import { describe, expect, it } from "bun:test";
import { emptyLockfilePresence, resolveJsToolchain } from "./repoToolchainHints";

describe("resolveJsToolchain", () => {
  it("prefers bun when bun.lockb is present", () => {
    const locks = { ...emptyLockfilePresence(), bunLockb: true, npmLock: true };
    expect(resolveJsToolchain({ packageManager: "npm@10.0.0" }, locks)).toEqual({ label: "Bun" });
  });

  it("uses bun.lock when bun.lockb is absent", () => {
    const locks = { ...emptyLockfilePresence(), bunLock: true };
    expect(resolveJsToolchain(null, locks)).toEqual({ label: "Bun" });
  });

  it("falls back to packageManager when no lockfiles", () => {
    expect(resolveJsToolchain({ packageManager: "bun@1.2.0" }, emptyLockfilePresence())).toEqual({
      label: "Bun"
    });
    expect(resolveJsToolchain({ packageManager: "pnpm@9.0.0" }, emptyLockfilePresence())).toEqual({
      label: "pnpm"
    });
  });

  it("returns null when nothing matches", () => {
    expect(resolveJsToolchain({}, emptyLockfilePresence())).toBeNull();
  });
});
