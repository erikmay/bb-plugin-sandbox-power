#!/bin/sh
# Fast plugin loop against a remote bb server, without a GitHub release.
#
# The checkout is mirrored to the bb server with Mutagen (one-way, this
# computer wins); the server runs the plugin from that mirror as a path
# install. See AGENTS.md, "Developing against a remote bb".
#
#   scripts/remote-dev.sh reload   push changes, build on the server, reload
#   scripts/remote-dev.sh dev      push changes, then rebuild+reload on every save
#   scripts/remote-dev.sh logs     follow the plugin's log on the server
#   scripts/remote-dev.sh doctor   run scripts/doctor.mjs on the server
#   scripts/remote-dev.sh setup    create the Mutagen sync and the path install
#
# BB_REMOTE (default bb-remote) is the SSH host of the bb server;
# BB_REMOTE_DIR (default ~/Code/bb-plugins) holds the mirrors there.
set -eu
host=${BB_REMOTE:-bb-remote}
root=$(cd "$(dirname "$0")/.." && pwd)
name=$(basename "$root")
remote_dir=${BB_REMOTE_DIR:-'~/Code/bb-plugins'}/$name
id=$(node -p "require('$root/package.json').name.replace(/^bb-plugin-/, '')")
remote() { ssh "$host" "export PATH=\$HOME/.local/bin:\$PATH; cd $remote_dir && $1"; }

flush() {
  mutagen sync flush "$name" >/dev/null
  # package.json changed? keep the server's node_modules in step.
  remote '[ node_modules/.package-lock.json -nt package-lock.json ] || npm ci --ignore-scripts --no-fund --no-audit --loglevel=error'
}

case "${1:-reload}" in
  setup)
    ssh "$host" "mkdir -p $remote_dir"
    mutagen sync list "$name" >/dev/null 2>&1 || mutagen sync create --name="$name" \
      --sync-mode=one-way-replica --ignore-vcs --ignore=node_modules --ignore=dist \
      --ignore=.DS_Store --ignore=upstream-diff.patch --ignore=coverage \
      "$root" "$host:$remote_dir"
    flush
    echo "Now, once (this deletes the plugin's settings): bb plugin remove $id && bb plugin install $remote_dir on $host"
    ;;
  reload)
    flush
    remote "bb plugin build . >/dev/null && bb plugin reload $id"
    ;;
  dev)
    flush
    echo "Saving here syncs to $host; bb plugin dev rebuilds and reloads there. Ctrl+C stops."
    ssh -t "$host" "export PATH=\$HOME/.local/bin:\$PATH; cd $remote_dir && bb plugin dev ."
    ;;
  doctor)
    flush
    remote "node scripts/doctor.mjs"
    ;;
  logs)
    ssh "$host" "export PATH=\$HOME/.local/bin:\$PATH; bb plugin logs $id --follow"
    ;;
  *)
    echo "usage: $0 reload|dev|logs|doctor|setup" >&2
    exit 2
    ;;
esac
