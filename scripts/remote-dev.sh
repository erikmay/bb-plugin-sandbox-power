#!/bin/sh
# Try plugin changes on a bb server that runs on another machine, without a
# release: copy this checkout there, build, reload. The server runs the plugin
# as a path install of ~/Code/bb-plugins/<repo>. See docs/VALIDATION.md.
#
#   scripts/remote-dev.sh [reload]   copy, build on the server, reload
#   scripts/remote-dev.sh logs       follow the plugin log on the server
#
# BB_REMOTE (default bb-remote) is the SSH host of the bb server.
set -eu
host=${BB_REMOTE:-bb-remote}
root=$(cd "$(dirname "$0")/.." && pwd)
dir="Code/bb-plugins/$(basename "$root")"
id=$(node -p "require('$root/package.json').name.replace(/^bb-plugin-/, '')")
remote() { ssh "$host" "export PATH=\$HOME/.local/bin:\$PATH; cd $dir && $1"; }

case "${1:-reload}" in
  reload)
    ssh "$host" "mkdir -p $dir"
    rsync -a --delete --exclude=.git --exclude=node_modules --exclude=dist "$root/" "$host:$dir/"
    remote "npm ci --ignore-scripts --no-fund --no-audit --loglevel=error >/dev/null && bb plugin build . >/dev/null && bb plugin reload $id"
    ;;
  logs)
    remote "bb plugin logs $id --follow"
    ;;
  *)
    echo "usage: $0 [reload|logs]" >&2
    exit 2
    ;;
esac
