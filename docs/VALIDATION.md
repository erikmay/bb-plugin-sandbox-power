# Validating the plugin locally

Everything here runs against your own bb on this computer. The desktop app and
`npx bb-app` serve bb at **http://127.0.0.1:38886/**; a bb source checkout uses
its own ports (`bb status`).

## 1. Health check

```sh
npm run doctor
```

| Check | Expected |
|---|---|
| plugin | `sandbox-power <version> running` |
| suspendable providers | at least one, e.g. `exe-dev, modal-sandbox` |
| machines | each provider machine with the action it would show: `Pause sandbox` (active), `Resume sandbox` (suspended), disabled while changing |
| plugin log | `loaded` after each reload |

## 2. Development loop

```sh
bb plugin install .                    # once
npm run build && bb plugin reload sandbox-power
```

The app picks up a rebuilt frontend after a page reload.

### When bb runs on another machine

When your bb server runs on another machine (a VM, a home server), the plugin
has to live there. You keep editing this checkout, without releases:

1. Give the server an SSH alias, `bb-remote` by default (`BB_REMOTE` picks
   another), and install [Mutagen](https://mutagen.io) here.
2. `sh scripts/remote-dev.sh setup` mirrors this checkout to
   `~/Code/bb-plugins/<repo>` on the server (one way, this computer wins;
   `node_modules`, `dist` and `.git` stay out). Then install the mirror there
   once: `bb plugin remove sandbox-power && bb plugin install ~/Code/bb-plugins/<repo>`.
   Removing deletes the plugin's settings, so set them again.
3. The loop:

```sh
npm run remote:reload   # sync, build on the server, reload (a few seconds)
npm run remote:dev      # sync on save; bb plugin dev rebuilds and reloads there
npm run remote:logs     # follow the plugin log on the server
npm run remote:doctor   # the health check, run on the server
```

The server runs whatever this checkout holds, so it is live for you at once.
Publishing is still a version bump merged to `main`; the server keeps its path
install.


## 3. End to end in the UI

You need a suspendable provider, e.g. the
[exe.dev plugin](https://github.com/erikmay/bb-plugin-environment-exe-dev).
With [agent-browser](https://github.com/vercel-labs/agent-browser):

```sh
S=sandbox-power-e2e
agent-browser --session $S open http://127.0.0.1:38886/
agent-browser --session $S snapshot -i -c
```

1. Start a thread on a sandbox: `Project: …` → a project or **Don't work in a
   project**, `Environment` → **exe.dev VM**, prompt
   `Run sleep 20, then reply done.`, Enter.
2. While the agent works, the header shows `button "Pause sandbox" [disabled]`
   and the menu entry's detail reads `… · agent is working`.
3. When the thread is idle, click **Pause sandbox**. Expect the button to turn
   into **Resume sandbox**, `bb machine show <host> --json` to report
   `"phase": "suspended"`, and the provider to show the VM paused
   (`ssh exe.dev ls`).
4. Click **Resume sandbox**: back to **Pause sandbox**, phase `active`.
5. A thread on your own computer shows neither entry.
6. Clean up: `bb thread archive <thread-id>` (id in the URL);
   `agent-browser --session $S close`.

## Where state lives

All state is in the browser: `SandboxStore` keeps thread → host lookups and the
latest host list per app session. Nothing is persisted; reloading the page
starts fresh.
