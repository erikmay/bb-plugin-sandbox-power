# Agent instructions

A bb plugin that adds **Pause sandbox / Resume sandbox** to threads whose
machine can be suspended (exe.dev VMs, Modal sandboxes, any machine provider
with `supportsSuspend`). It has no settings and no server logic; everything
lives in the app (frontend) entry.

## Layout

| Path | Role |
|---|---|
| `app.tsx` | Registers the header button and the menu entry, runs suspend/resume, shows error toasts |
| `sandbox-store.ts` | One shared view of which visible threads run on suspendable machines; polls every 5 s while used |
| `actions.ts` | Pure mapping from machine phase and thread status to the action |
| `server.ts` | Required entry point; only logs that the plugin loaded |
| `scripts/remote-dev.sh` | Copy this checkout to a bb server on another machine, build and reload there |

## Invariants

- Both registrations share **one** `SandboxStore` per SDK instance; no
  per-registration polling.
- The action shows only for hosts whose provider reports `supportsSuspend`.
- Pausing is disabled while the thread is `active`, `starting`, `pending` or
  `stopping`; bb refuses to suspend a busy machine.
- Every failure of suspend/resume surfaces as a toast.
- `item` stays pure and synchronous (an SDK rule): fetching happens in the
  store.

## Working on it

```sh
npm install
npm run typecheck && npm test
bb plugin install .              # local bb: install this checkout, then
npm run build && bb plugin reload sandbox-power
npm run remote:reload            # bb on another machine (SSH alias bb-remote): copy, build there, reload
```

The app picks up a rebuilt frontend after a page reload. Read the real API in
`node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts`.

To check a change end to end: start a thread on an exe.dev VM; while the
agent works the header shows "Pause sandbox" disabled; when it is idle, Pause
turns the button into "Resume sandbox" and `bb machine show <host> --json`
reports `"phase": "suspended"`; Resume brings it back. A thread on your own
computer shows neither.

## Releasing

1. `npm run typecheck && npm test` pass; logic changes have tests.
2. `CHANGELOG.md` gets a `## X.Y.Z — YYYY-MM-DD` section and `package.json`
   that version. Update `README.md` for user-visible changes.
3. Push to `main`; `release.yml` tags and publishes. Never tag by hand.

## Upgrading to a newer bb

Run `bb plugin types` with the new bb installed, then `npm install`, and fix
what typecheck reports. Upstream files that matter:
`plugins/bb-guide/skills/bb-plugin-authoring/references/frontend-registration.md`
(thread action contract) and `packages/sdk/src/areas/hosts.ts`
(suspend/resume). If bb gets a native pause control next to the machine chip
(`ThreadEnvironmentSummary.tsx`), retire the header button.
