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
npm run typecheck && npm test
bb plugin install .          # from this checkout
```

`AGENTS.md` describes the architecture, releasing, and following bb upstream.

## License

MIT
