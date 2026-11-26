Pause and resume the sandbox machine a thread runs on, without leaving the thread.

## What you get

- A **Pause sandbox** / **Resume sandbox** button in the open thread's header
  when the thread runs on a machine whose provider supports suspend (for
  example exe.dev VMs or Modal sandboxes).
- The same action in every thread menu (header menu, sidebar row menu,
  right-click menu).
- Pausing is disabled while the thread's agent is working; errors appear as a
  toast.

## How it works

The action calls bb's own machine suspend and resume, the same path as
`bb machine suspend` and `bb machine resume`. What "pause" keeps depends on the
provider (exe.dev keeps memory and disk; Modal snapshots the filesystem).
Threads on your own computer or on machines that cannot be suspended show no
action.
