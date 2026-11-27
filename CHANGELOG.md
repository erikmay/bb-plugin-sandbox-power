# Changelog

## 0.2.1 — 2026-11-27

- Leaner repository: removed the upstream-drift watcher, the Claude Code agent
  workflow, Dependabot, issue and PR templates, the doctor script and the
  separate validation guide. `AGENTS.md` covers it in one place. No change to
  the plugin.

## 0.2.0 — 2026-11-26

- One shared store for both registrations (header button and menu entry):
  hosts and threads are fetched once instead of twice, and polling stops when
  nothing shows the action.
- Only machines whose provider supports suspend get the action (manual
  machines no longer show a button that cannot work).
- "Pause sandbox" is disabled while the thread's agent is working, because bb
  refuses to suspend a busy machine; failures now show a toast instead of
  failing silently.
- Threads whose environment is still provisioning are re-checked every 5 s for
  up to 10 minutes.
- Unit tests, CI, upstream tracking, doctor script and validation guide.

## 0.1.0 — 2026-11-26

- Pause/Resume sandbox action in the thread header and thread menus.
