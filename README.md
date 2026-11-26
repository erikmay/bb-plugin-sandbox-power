# Sandbox Power for bb

A [bb](https://github.com/get-bb/bb) plugin that adds **Pause sandbox** /
**Resume sandbox** to threads that run on a suspendable machine, such as an
[exe.dev VM](https://github.com/erikmay/bb-plugin-environment-exe-dev) or a
Modal sandbox.

- **In the thread header** as a button, and in every thread menu (header menu,
  sidebar row menu, right-click menu).
- **Only where it works:** machines whose provider supports suspend. Threads on
  your own computer show nothing.
- **Safe:** pausing is disabled while the agent is working (bb would refuse
  it); errors show as a toast.

It calls bb's own `hosts.experimental_suspend` / `experimental_resume`, the
same as `bb machine suspend` / `bb machine resume`. bb's idle pause and the
next message in the thread keep working as before.

> [!NOTE]
> Experimental. Built on bb's `experimental_threadAction` slot and
> `experimental_suspend`/`experimental_resume`, which may change. Not
> affiliated with bb.

## Install

```sh
bb plugin install git:https://github.com/erikmay/bb-plugin-sandbox-power.git@^0.2.0
```

No settings. Requires bb ≥ 0.50 and at least one machine provider plugin with
suspend support.

## Development

```sh
npm install
npm run typecheck
npm test
bb plugin install .          # from this checkout
npm run doctor               # check a local install
```

[docs/VALIDATION.md](docs/VALIDATION.md) covers checking the plugin against a
local bb, including a UI run against http://127.0.0.1:38886/. `AGENTS.md`
describes the architecture, the definition of done, and how upstream bb changes
are tracked (`npm run upstream:check`). Maintenance is mostly automated: a
weekly job opens an issue when bb changes something this plugin depends on, an
optional Claude Code workflow turns issues labelled `agent` into pull
requests, and merging a version bump publishes the release.

## License

MIT
