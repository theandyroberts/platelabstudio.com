#!/usr/bin/env bash
# Upload a complete MMM take package, then atomically hand it to the worker.
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then echo "Usage: $0 PACKAGE_DIRECTORY [SSH_HOST]" >&2; exit 2; fi
source_dir="$(cd "$1" && pwd)"
remote="${2:-ubuntu@51.81.202.126}"
[[ "$remote" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo 'Invalid SSH host' >&2; exit 2; }
[[ -f "$source_dir/07-Delivery/website_package.json" ]] || { echo 'Missing manifest' >&2; exit 2; }
transfer="mmm-$(date -u +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)"
base=/home/ubuntu/platelab-composite-ingest/data
printf 'Uploading transfer %s\n' "$transfer"
ssh "$remote" "mkdir -m 700 '$base/uploading/$transfer'"
rsync -a --partial --no-links --exclude='.DS_Store' -- "$source_dir/" "$remote:$base/uploading/$transfer/"
ssh "$remote" "mv -T '$base/uploading/$transfer' '$base/ready/$transfer'"
printf 'Submitted %s\nStatus: ssh %s cat %s/status/%s.json\n' "$transfer" "$remote" "$base" "$transfer"
