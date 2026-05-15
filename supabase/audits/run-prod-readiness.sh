#!/usr/bin/env bash
# supabase/audits/run-prod-readiness.sh
# Composite production-readiness check for Phase 61.
#
# Usage:
#   export PROD_DB_URL="<your-prod-pooler-connection-string>"
#   bash supabase/audits/run-prod-readiness.sh
#
# Exit codes:
#   0 — all four checks passed
#   1 — RLS audit returned FAIL rows
#   2 — migration count != 21
#   3 — storage bucket count != 5
#   4 — super-admin row missing
#   5 — PROD_DB_URL not set
set -euo pipefail

if [[ -z "${PROD_DB_URL:-}" ]]; then
  echo "ERROR: PROD_DB_URL is not set. Export it from .env.production (gitignored)." >&2
  exit 5
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Phase 61 Production Readiness Check ==="
echo

# 1. RLS audit — must return zero FAIL rows
echo "[1/4] RLS audit (rls-audit.sql)..."
FAIL_COUNT="$(psql "$PROD_DB_URL" -At -f "$SCRIPT_DIR/rls-audit.sql" | grep -cE '\|FAIL' || true)"
if [[ "$FAIL_COUNT" -ne 0 ]]; then
  echo "  FAIL: $FAIL_COUNT rows with FAIL posture (expected 0)"
  psql "$PROD_DB_URL" -f "$SCRIPT_DIR/rls-audit.sql" | grep FAIL >&2
  exit 1
fi
echo "  OK (zero FAIL rows)"

# 2. Migration count — must equal 21
echo "[2/4] Migration count..."
MIGRATION_COUNT="$(bunx supabase migration list --db-url "$PROD_DB_URL" 2>/dev/null | grep -cE '^\s*[0-9]{14}' || true)"
if [[ "$MIGRATION_COUNT" -ne 21 ]]; then
  echo "  FAIL: $MIGRATION_COUNT migrations applied (expected 21)"
  exit 2
fi
echo "  OK (21 migrations applied)"

# 3. Storage buckets — must equal 5
echo "[3/4] Storage buckets..."
BUCKET_COUNT="$(psql "$PROD_DB_URL" -At -c "SELECT count(*) FROM storage.buckets WHERE id IN ('audio','photos','pdfs','logos','platform_brand_assets');")"
if [[ "$BUCKET_COUNT" -ne 5 ]]; then
  echo "  FAIL: $BUCKET_COUNT expected buckets present (expected 5)"
  exit 3
fi
echo "  OK (5 buckets present)"

# 4. Super-admin presence
echo "[4/4] Super-admin bootstrap..."
ADMIN_COUNT="$(psql "$PROD_DB_URL" -At -c "SELECT count(*) FROM platform_admins pa JOIN auth.users u ON u.id = pa.user_id WHERE u.email = 'skale.club@gmail.com';")"
if [[ "$ADMIN_COUNT" -ne 1 ]]; then
  echo "  FAIL: super-admin row missing for skale.club@gmail.com (count=$ADMIN_COUNT)"
  exit 4
fi
echo "  OK (super-admin present)"

echo
echo "=== All four checks PASSED ==="
