#!/bin/bash
set -euo pipefail
umask 077

SYNC_URL="https://fuwari-blog.qiailmy.workers.dev/static-api/halo-sync"
REPO_DIR="/opt/fuwari-blog"
LOG_FILE="/var/log/fuwari-sync.log"
KV_NS="7403d503f71b414f946024694e746f8b"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOG_FILE"; }

if [ -f "$REPO_DIR/.env.cf" ]; then
    set -a; source "$REPO_DIR/.env.cf"; set +a
fi
: "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"

exec 9>/run/lock/fuwari-sync.lock
if ! flock -n 9; then
    log "Another sync is already running; skipping this invocation."
    exit 0
fi

log "Checking halo sync status..."
status=$(curl --fail --silent --show-error --retry 3 --retry-all-errors \
    --connect-timeout 10 --max-time 30 "$SYNC_URL")
if ! jq -e '(.pending | type) == "boolean" and (.records | type) == "number" and .records >= 0 and ((.pending == false) or (.signature | type == "string" and test("^[0-9a-f]{64}$")))' >/dev/null <<<"$status"; then
    log "Invalid sync status response."
    exit 1
fi
pending=$(jq -r '.pending' <<<"$status")
signature=$(jq -r '.signature // empty' <<<"$status")
records=$(jq -r '.records' <<<"$status")

if [ "$pending" != "true" ]; then
    log "No pending changes (${records} records)."
    exit 0
fi

log "Pending changes detected ($records records, sig: ${signature:0:16}...)"
log "Starting import and deploy..."

cd "$REPO_DIR"
HALO_ORIGIN="https://wuw.wuw.li" pnpm import:halo 2>&1 | tee -a "$LOG_FILE"
pnpm run deploy 2>&1 | tee -a "$LOG_FILE"

log "Marking deployed in KV..."
result=$(curl --fail --silent --show-error --retry 3 --retry-all-errors \
    --connect-timeout 10 --max-time 30 -X PUT \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/storage/kv/namespaces/$KV_NS/values/halo:deployed-signature" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    --data "$signature")
if [ "$(jq -r '.success' <<<"$result")" != "true" ]; then
    log "Failed to mark deployed."
    exit 1
fi

log "Sync complete."
