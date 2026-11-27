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

The plugin has to live on the bb server. With an SSH alias `bb-remote` for it
(`BB_REMOTE` picks another), install the copy there once, then iterate:

```sh
npm run remote:reload   # copy this checkout over (rsync), build there, reload
npm run remote:logs     # follow the plugin log on the server
```

The first `remote:reload` creates `~/Code/bb-plugins/<repo>` on the server;
install it there once with `bb plugin remove sandbox-power && bb plugin install
~/Code/bb-plugins/<repo>` (removing deletes the plugin's settings). Publishing
is still a version bump merged to `main`.


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
