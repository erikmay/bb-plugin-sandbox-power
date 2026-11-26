import type { Sandbox } from "./sandbox-store.js";

export interface SandboxActionSpec {
  label: string;
  detail: string;
  icon: "Pause" | "Play";
  disabled: boolean;
  operation: "suspend" | "resume" | null;
}

export type ThreadStatus = "active" | "error" | "idle" | "pending" | "starting" | "stopping";

const BUSY_THREAD_STATUSES: ReadonlySet<ThreadStatus> = new Set(["active", "pending", "starting", "stopping"]);

/**
 * What the thread action shows for a sandbox in a given lifecycle phase; null
 * hides it. bb refuses to suspend a machine while a thread on it is working,
 * so pausing is disabled until the thread is idle.
 */
export function sandboxActionSpec(
  sandbox: Sandbox | undefined,
  threadStatus: ThreadStatus,
): SandboxActionSpec | null {
  if (sandbox === undefined) return null;
  const detail = sandbox.name;
  switch (sandbox.phase) {
    case "active":
      return BUSY_THREAD_STATUSES.has(threadStatus)
        ? { label: "Pause sandbox", detail: `${detail} · agent is working`, icon: "Pause", disabled: true, operation: null }
        : { label: "Pause sandbox", detail, icon: "Pause", disabled: false, operation: "suspend" };
    case "suspended":
      return { label: "Resume sandbox", detail, icon: "Play", disabled: false, operation: "resume" };
    case "suspending":
      return { label: "Pausing sandbox…", detail, icon: "Pause", disabled: true, operation: null };
    case "resuming":
      return { label: "Resuming sandbox…", detail, icon: "Play", disabled: true, operation: null };
    default:
      return null;
  }
}
