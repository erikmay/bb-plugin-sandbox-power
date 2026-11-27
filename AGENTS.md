# Agent instructions

This repository is a bb plugin that adds a **Pause sandbox / Resume sandbox**
thread action to [bb](https://github.com/get-bb/bb) for threads whose machine
can be suspended (exe.dev VMs, Modal sandboxes, any machine provider with
`supportsSuspend`). It has no settings and no server logic; everything lives in
the app (frontend) entry.

## Layout

| Path | Role |
|---|---|
| `app.tsx` | Registers two `app.slots.experimental_threadAction` entries (header button and menu entry), wires them to the shared store, runs suspend/resume, shows error toasts |
| `sandbox-store.ts` | `SandboxStore`: one shared, framework-free view of which visible threads run on suspendable machines. Polls hosts and providers every 5 s while subscribed; resolves thread → environment → host once per thread, retrying provisioning threads for up to 10 minutes |
| `actions.ts` | `sandboxActionSpec`: pure mapping from machine phase and thread status to label, icon, disabled state and operation |
| `server.ts` | Required entry point; only logs that the plugin loaded |
| `test/` | Unit tests for the store (fake SDK, manual clock) and the action mapping |
| `upstream.json` | bb commit this plugin is synced to, tracked upstream files, API signals |
| `scripts/check-upstream.mjs` | Reports upstream drift, new bb/SDK releases and API promotions |
| `scripts/remote-dev.sh` | Copies the checkout to a bb server on another machine, builds and reloads there |
| `scripts/doctor.mjs` | Local health check against a running bb |
| `docs/VALIDATION.md` | How to validate against a local bb, including the UI |

## Invariants

- Both registrations share **one** `SandboxStore` per SDK instance. Never add
  per-registration polling or fetching.
- The action shows only for hosts whose provider reports `supportsSuspend`.
- Pausing is disabled while the thread status is `active`, `starting`,
  `pending` or `stopping`; bb refuses to suspend a busy machine.
- Every failure of suspend/resume surfaces as a toast; nothing fails silently.
- `item` stays pure and synchronous (an SDK rule): all fetching happens in the
  store, `item` only maps state to an action.
- No `experimental_` API is used without a matching `watchForPublicApis` entry
  in `upstream.json`.

## Commands

```sh
npm install
npm run typecheck
npm test                      # unit tests, no secrets
npm run build                 # bb plugin build (needs the bb CLI)
npm run doctor                # local install check (see docs/VALIDATION.md)
npm run upstream:check        # drift against bb main
node scripts/check-upstream.mjs <ref> [--json] [--markdown out.md]
npm run remote:reload        # remote bb: copy, build there, reload (docs/VALIDATION.md)
npm run remote:logs          # remote bb: follow the plugin log
```

## Definition of done

1. `npm run typecheck` and `npm test` pass.
2. Logic changes in `sandbox-store.ts` or `actions.ts` have unit tests; UI
   changes are checked with `docs/VALIDATION.md` §3 against a local bb.
3. `README.md` and `PLUGIN_OVERVIEW.md` describe user-visible changes.
4. `CHANGELOG.md` has a `## X.Y.Z — YYYY-MM-DD` section and `package.json`
   carries that version. Below 1.0: features and behaviour changes bump the
   minor version, fixes the patch.
5. Merging to `main` releases automatically; never tag by hand.

## Adding a feature

1. Restate the goal and acceptance criteria from the issue; ask on the issue
   when a user decision is missing.
2. Decide where it goes: state and fetching in `sandbox-store.ts`, presentation
   in `actions.ts`, slot wiring and side effects in `app.tsx`. A new surface
   (for example a context segment next to the composer) is a new registration
   in `app.tsx` that reads the same store.
3. Read the exact API in
   `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts`
   before using it; the bb plugin guide is
   `plugins/bb-guide/skills/bb-plugin-authoring/references/` upstream.
4. Test first (store or action mapping), then code, then the UI check.
5. Meet the definition of done and open a PR.

## Upgrading to a newer bb

1. With the target bb installed, run `bb plugin types`, then `npm install`.
2. `npm run upstream:check` and read `upstream-diff.patch`:
   - `frontend-registration.md`: changes to the thread action contract
     (`useData`, `item`, placement, groups).
   - `packages/sdk/src/areas/hosts.ts`: suspend/resume and provider listing.
   - `ThreadEnvironmentSummary.tsx`: if bb adds a native pause control or a
     plugin slot next to the machine chip, move the action there or retire the
     header button.
3. Apply API signals (renamed `experimental_*` symbols) project-wide.
4. Verify (definition of done), update `upstream.json` (`syncedCommit`,
   `syncedAt`, `testedBbVersion`, `testedPluginSdk`), changelog, version.

## Automation

| Workflow | Trigger | What it does | Needs |
|---|---|---|---|
| `ci.yml` | push, PR, manual | typecheck + unit tests | — |
| `upstream-watch.yml` | weekly, manual | opens or updates one `upstream-drift` issue; dispatches the agent on real drift | — |
| `agent.yml` | label `agent`, owner `@claude` comment, upstream-watch | Claude Code works the issue per this file and opens a PR | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` |
| `release.yml` | push to `main` changing `package.json` | tags `vX.Y.Z` and releases from the CHANGELOG section | — |
| Dependabot | weekly | npm and Actions updates, except packages `bb plugin types` manages | — |

Agent PRs use the workflow token, so the agent dispatches `ci.yml` on its
branch itself.

## Rules

- No secrets in the repository, tests, logs or issues.
- Unit tests use the fake SDK and manual clock; they never talk to a real bb.
