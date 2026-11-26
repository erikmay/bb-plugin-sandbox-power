import { describe, expect, it, vi } from "vitest";
import {
  HOST_POLL_MS,
  SandboxStore,
  UNRESOLVED_GIVE_UP_MS,
  UNRESOLVED_RETRY_MS,
  type Clock,
  type MachinePhase,
  type SandboxSdk,
} from "../sandbox-store.js";

class ManualClock implements Clock {
  time = 1_000;
  timers: Array<() => void> = [];
  now = () => this.time;
  setInterval = (callback: () => void) => {
    this.timers.push(callback);
    return this.timers.length - 1;
  };
  clearInterval = () => {
    this.timers = [];
  };
}

function fakeSdk() {
  const hosts = [
    { id: "host_mac", name: "MacBook", machineProviderId: null, lifecycle: { phase: "active" as MachinePhase } },
    { id: "host_vm", name: "exe.dev VM abc123", machineProviderId: "exe-dev", lifecycle: { phase: "active" as MachinePhase } },
    { id: "host_manual", name: "Box", machineProviderId: "manual", lifecycle: { phase: "active" as MachinePhase } },
  ];
  const threadEnv = new Map<string, string | null>([
    ["thr_vm", "env_vm"],
    ["thr_mac", "env_mac"],
    ["thr_manual", "env_manual"],
    ["thr_new", null],
  ]);
  const envHost = new Map([
    ["env_vm", "host_vm"],
    ["env_mac", "host_mac"],
    ["env_manual", "host_manual"],
    ["env_new", "host_vm"],
  ]);
  const sdk = {
    hosts: {
      list: vi.fn(async () => hosts),
      experimental_listProviders: vi.fn(async () => [
        { id: "exe-dev", supportsSuspend: true },
        { id: "manual", supportsSuspend: false },
      ]),
    },
    threads: { get: vi.fn(async ({ threadId }: { threadId: string }) => ({ environmentId: threadEnv.get(threadId) ?? null })) },
    environments: { get: vi.fn(async ({ environmentId }: { environmentId: string }) => ({ hostId: envHost.get(environmentId)! })) },
  } satisfies SandboxSdk;
  return { sdk, hosts, threadEnv };
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SandboxStore", () => {
  it("maps only threads on suspendable provider machines", async () => {
    const { sdk } = fakeSdk();
    const store = new SandboxStore(sdk, new ManualClock());
    store.subscribe(() => {});
    store.request(["thr_vm", "thr_mac", "thr_manual"]);
    await settle();
    expect([...store.snapshot().keys()]).toEqual(["thr_vm"]);
    expect(store.snapshot().get("thr_vm")).toEqual({ hostId: "host_vm", name: "exe.dev VM abc123", phase: "active" });
  });

  it("looks each thread up once, shared across callers", async () => {
    const { sdk } = fakeSdk();
    const store = new SandboxStore(sdk, new ManualClock());
    store.subscribe(() => {});
    store.request(["thr_vm"]);
    store.request(["thr_vm"]);
    await settle();
    await store.refresh();
    expect(sdk.threads.get).toHaveBeenCalledTimes(1);
  });

  it("retries a thread whose environment is still provisioning, then gives up", async () => {
    const { sdk, threadEnv } = fakeSdk();
    const clock = new ManualClock();
    const store = new SandboxStore(sdk, clock);
    store.subscribe(() => {});
    store.request(["thr_new"]);
    await settle();
    expect(store.snapshot().has("thr_new")).toBe(false);

    threadEnv.set("thr_new", "env_new");
    clock.time += UNRESOLVED_RETRY_MS;
    await store.refresh();
    expect(store.snapshot().get("thr_new")?.hostId).toBe("host_vm");

    threadEnv.set("thr_late", null);
    store.request(["thr_late"]);
    await settle();
    const calls = sdk.threads.get.mock.calls.length;
    clock.time += UNRESOLVED_GIVE_UP_MS;
    await store.refresh();
    expect(sdk.threads.get.mock.calls.length).toBe(calls);
  });

  it("publishes phase changes and polls only while subscribed", async () => {
    const { sdk, hosts } = fakeSdk();
    const clock = new ManualClock();
    const store = new SandboxStore(sdk, clock);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.request(["thr_vm"]);
    await settle();
    const before = store.snapshot();
    hosts[1]!.lifecycle.phase = "suspended";
    clock.timers[0]?.();
    await settle();
    expect(store.snapshot()).not.toBe(before);
    expect(store.snapshot().get("thr_vm")?.phase).toBe("suspended");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    expect(clock.timers).toHaveLength(0);
    expect(HOST_POLL_MS).toBeGreaterThan(0);
  });

  it("keeps the same snapshot object when nothing changed", async () => {
    const { sdk } = fakeSdk();
    const store = new SandboxStore(sdk, new ManualClock());
    store.subscribe(() => {});
    store.request(["thr_vm"]);
    await settle();
    const first = store.snapshot();
    await store.refresh();
    expect(store.snapshot()).toBe(first);
  });

  it("keeps the last view when the host list fails", async () => {
    const { sdk } = fakeSdk();
    const store = new SandboxStore(sdk, new ManualClock());
    store.subscribe(() => {});
    store.request(["thr_vm"]);
    await settle();
    sdk.hosts.list.mockRejectedValueOnce(new Error("offline"));
    await store.refresh();
    expect(store.snapshot().has("thr_vm")).toBe(true);
  });
});
