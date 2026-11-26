import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
  useSdk,
  type PluginThreadAction,
  type PluginThreadActionDataInput,
  type PluginThreadActionItemInput,
} from "@get-bb/plugin-sdk/app";
import { sandboxActionSpec } from "./actions.js";
import { SandboxStore, type Sandbox } from "./sandbox-store.js";

interface SandboxData {
  byThread: ReadonlyMap<string, Sandbox>;
  refresh: () => void;
}

let shared: { sdk: unknown; store: SandboxStore } | null = null;

function storeFor(sdk: ReturnType<typeof useSdk>): SandboxStore {
  if (shared?.sdk !== sdk) shared = { sdk, store: new SandboxStore(sdk) };
  return shared.store;
}

function useSandboxes({ threadIds }: PluginThreadActionDataInput): SandboxData {
  const store = storeFor(useSdk());
  const byThread = useSyncExternalStore(store.subscribe, store.snapshot);
  const idsKey = threadIds.join(",");
  useEffect(() => {
    store.request(threadIds);
  }, [store, idsKey]);
  return { byThread, refresh: () => void store.refresh() };
}

function sandboxAction({
  thread,
  data,
  sdk,
}: PluginThreadActionItemInput<SandboxData>): PluginThreadAction | null {
  const sandbox = data.byThread.get(thread.id);
  const spec = sandboxActionSpec(sandbox, thread.status);
  if (sandbox === undefined || spec === null) return null;
  const { hostId } = sandbox;
  return {
    label: spec.label,
    detail: spec.detail,
    icon: spec.icon,
    disabled: spec.disabled,
    run: async () => {
      if (spec.operation === null) return;
      try {
        if (spec.operation === "suspend") await sdk.hosts.experimental_suspend({ hostId });
        else await sdk.hosts.experimental_resume({ hostId });
      } catch (error) {
        const verb = spec.operation === "suspend" ? "pause" : "resume";
        toast.error(`Could not ${verb} ${sandbox.name}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        data.refresh();
      }
    },
  };
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction<SandboxData>({
    id: "sandbox-power-header",
    title: "Pause or resume sandbox",
    icon: "Pause",
    group: "5_sandbox",
    placement: "header",
    useData: useSandboxes,
    item: sandboxAction,
  });
  app.slots.experimental_threadAction<SandboxData>({
    id: "sandbox-power",
    title: "Pause or resume sandbox",
    icon: "Pause",
    group: experimental_THREAD_ACTION_GROUPS.settings,
    useData: useSandboxes,
    item: sandboxAction,
  });
});
