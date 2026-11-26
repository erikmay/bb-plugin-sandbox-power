import { describe, expect, it } from "vitest";
import { sandboxActionSpec } from "../actions.js";
import type { MachinePhase } from "../sandbox-store.js";

const sandbox = (phase: MachinePhase) => ({ hostId: "host_vm", name: "exe.dev VM abc123", phase });

describe("sandboxActionSpec", () => {
  it("offers pause for an active sandbox and resume for a suspended one", () => {
    expect(sandboxActionSpec(sandbox("active"), "idle")).toMatchObject({ label: "Pause sandbox", icon: "Pause", operation: "suspend", disabled: false });
    expect(sandboxActionSpec(sandbox("suspended"), "idle")).toMatchObject({ label: "Resume sandbox", icon: "Play", operation: "resume", disabled: false });
  });

  it("shows transitions as disabled", () => {
    expect(sandboxActionSpec(sandbox("suspending"), "idle")).toMatchObject({ disabled: true, operation: null });
    expect(sandboxActionSpec(sandbox("resuming"), "idle")).toMatchObject({ disabled: true, operation: null });
  });

  it.each(["creating", "removing", "destroyed"] as const)("hides the action while %s", (phase) => {
    expect(sandboxActionSpec(sandbox(phase), "idle")).toBeNull();
  });

  it.each(["active", "starting", "pending", "stopping"] as const)("disables pausing while the thread is %s", (status) => {
    expect(sandboxActionSpec(sandbox("active"), status)).toMatchObject({
      disabled: true,
      operation: null,
      detail: "exe.dev VM abc123 · agent is working",
    });
  });

  it("allows resuming whatever the thread is doing", () => {
    expect(sandboxActionSpec(sandbox("suspended"), "active")).toMatchObject({ operation: "resume", disabled: false });
  });

  it("hides the action for threads without a sandbox", () => {
    expect(sandboxActionSpec(undefined, "idle")).toBeNull();
  });
});
