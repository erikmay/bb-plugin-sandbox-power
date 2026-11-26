export type MachinePhase =
  | "active"
  | "creating"
  | "destroyed"
  | "removing"
  | "resuming"
  | "suspended"
  | "suspending";

export interface Sandbox {
  hostId: string;
  name: string;
  phase: MachinePhase;
}

export interface SandboxSdk {
  hosts: {
    list(): Promise<
      ReadonlyArray<{
        id: string;
        name: string;
        machineProviderId: string | null;
        lifecycle: { phase: MachinePhase };
      }>
    >;
    experimental_listProviders(): Promise<ReadonlyArray<{ id: string; supportsSuspend: boolean }>>;
  };
  threads: { get(args: { threadId: string }): Promise<{ environmentId: string | null }> };
  environments: { get(args: { environmentId: string }): Promise<{ hostId: string }> };
}

export interface Clock {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const HOST_POLL_MS = 5_000;
export const UNRESOLVED_RETRY_MS = 5_000;
export const UNRESOLVED_GIVE_UP_MS = 10 * 60_000;

const systemClock: Clock = {
  now: () => Date.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * One shared view of which visible threads run on a suspendable machine.
 *
 * Thread actions call `useData` once per registration, so every registration
 * shares this store instead of polling and fetching on its own. A thread's
 * machine is looked up once; a thread without one yet (its environment is
 * still provisioning) is looked up again every UNRESOLVED_RETRY_MS, for at
 * most UNRESOLVED_GIVE_UP_MS after it was first seen.
 */
export class SandboxStore {
  private readonly threadHosts = new Map<string, { hostId: string | null; at: number; firstAt: number }>();
  private readonly inFlight = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private hosts = new Map<string, Sandbox>();
  private snapshotValue: ReadonlyMap<string, Sandbox> = new Map();
  private requested: readonly string[] = [];
  private timer: unknown = null;

  constructor(
    private readonly sdk: SandboxSdk,
    private readonly clock: Clock = systemClock,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      void this.refresh();
      this.timer = this.clock.setInterval(() => void this.refresh(), HOST_POLL_MS);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== null) {
        this.clock.clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  snapshot = (): ReadonlyMap<string, Sandbox> => this.snapshotValue;

  request(threadIds: readonly string[]): void {
    const merged = new Set([...this.requested, ...threadIds]);
    this.requested = [...merged];
    void this.resolveThreads();
  }

  async refresh(): Promise<void> {
    try {
      const [hosts, providers] = await Promise.all([
        this.sdk.hosts.list(),
        this.sdk.hosts.experimental_listProviders(),
      ]);
      const suspendable = new Set(providers.filter((p) => p.supportsSuspend).map((p) => p.id));
      this.hosts = new Map(
        hosts
          .filter((host) => host.machineProviderId !== null && suspendable.has(host.machineProviderId))
          .map((host) => [host.id, { hostId: host.id, name: host.name, phase: host.lifecycle.phase }]),
      );
    } catch {
      return;
    }
    this.publish();
    await this.resolveThreads();
  }

  private async resolveThreads(): Promise<void> {
    const now = this.clock.now();
    const missing = this.requested.filter((id) => {
      if (this.inFlight.has(id)) return false;
      const known = this.threadHosts.get(id);
      return (
        known === undefined ||
        (known.hostId === null &&
          now - known.at >= UNRESOLVED_RETRY_MS &&
          now - known.firstAt < UNRESOLVED_GIVE_UP_MS)
      );
    });
    if (missing.length === 0) return;
    for (const id of missing) this.inFlight.add(id);
    await Promise.all(
      missing.map(async (threadId) => {
        let hostId: string | null = null;
        try {
          const thread = await this.sdk.threads.get({ threadId });
          if (thread.environmentId !== null) {
            hostId = (await this.sdk.environments.get({ environmentId: thread.environmentId })).hostId;
          }
        } catch {
          hostId = null;
        } finally {
          const firstAt = this.threadHosts.get(threadId)?.firstAt ?? this.clock.now();
          this.threadHosts.set(threadId, { hostId, at: this.clock.now(), firstAt });
          this.inFlight.delete(threadId);
        }
      }),
    );
    this.publish();
  }

  private publish(): void {
    const next = new Map<string, Sandbox>();
    for (const [threadId, { hostId }] of this.threadHosts) {
      const sandbox = hostId === null ? undefined : this.hosts.get(hostId);
      if (sandbox !== undefined) next.set(threadId, sandbox);
    }
    if (sameSnapshot(next, this.snapshotValue)) return;
    this.snapshotValue = next;
    for (const listener of this.listeners) listener();
  }
}

function sameSnapshot(a: ReadonlyMap<string, Sandbox>, b: ReadonlyMap<string, Sandbox>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || other.hostId !== value.hostId || other.name !== value.name || other.phase !== value.phase) {
      return false;
    }
  }
  return true;
}
