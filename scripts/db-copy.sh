#!/usr/bin/env bash
# SEED-056 step 4/5 - copy Xtimator's production data from Supabase to the
# self-hosted PostgreSQL (Coolify), then PROVE the copy is identical.
#
#   SOURCE_DB_URL=<supabase direct/session URL, read only>  \
#   TARGET_DB_URL=<self-hosted superuser URL>               \
#     bash scripts/db-copy.sh [--reset-target] [--verify-only] [--keep-dump] [--dump-file PATH]
#
# What it does (in order):
#   0. refuses to run when the TARGET looks like Supabase (host pattern, project
#      ref, or a supabase_admin role on the server) or equals the source;
#   1. pre-flight: pg_dump/pg_restore/psql >= 17, target has pgvector available,
#      source has no FK from public into auth/storage (those were repointed by
#      20261105000001_owned_identity.sql; anything left would break the restore);
#   2. pg_dump 17 of schemas `public` + `supabase_migrations`
#      (--no-owner --no-privileges, custom format);
#   3. applies supabase/migrations/20261107000001_postgrest_compat_shim.sql to the
#      target BEFORE the restore (the dump's policies call auth.uid() and its
#      columns use extensions.vector, so both must exist first), then pg_restore,
#      then the shim AGAIN (it re-grants on the freshly restored objects);
#   4. compares source vs target: per-table row counts, sequences, columns,
#      constraints, indexes, triggers, RLS flags + policies, functions (and, as
#      WARN only, table grants for the request roles). ANY mismatch -> exit 1.
#
# Exit codes: 0 identical | 1 mismatch or step failure | 2 usage / refused.
#
# Secrets: both URLs come from the environment only and are never printed (only
# host names are). The dump holds customer data: it is chmod 600 and deleted on
# exit unless --keep-dump is given.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIM="$HERE/../supabase/migrations/20261107000001_postgrest_compat_shim.sql"
SCHEMAS=(public supabase_migrations)
SUPABASE_REF="prmqgcrnpuvpzruyzvuv"

RESET_TARGET=0
VERIFY_ONLY=0
KEEP_DUMP=0
DUMP_FILE=""

die()  { echo "db-copy: $*" >&2; exit 2; }
fail() { echo "db-copy: FAIL: $*" >&2; exit 1; }
info() { echo "db-copy: $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --reset-target) RESET_TARGET=1 ;;
    --verify-only)  VERIFY_ONLY=1 ;;
    --keep-dump)    KEEP_DUMP=1 ;;
    --dump-file)    shift; DUMP_FILE="${1:-}"; [ -n "$DUMP_FILE" ] || die "--dump-file needs a path" ;;
    -h|--help)      sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "unknown argument: $1" ;;
  esac
  shift
done

: "${SOURCE_DB_URL:?SOURCE_DB_URL is required}"
: "${TARGET_DB_URL:?TARGET_DB_URL is required}"

# Host of a postgres:// URL, without credentials or port.
url_host() { printf '%s' "$1" | sed -E 's#^[a-zA-Z0-9+.-]+://([^@/]*@)?(\[[^]]+\]|[^:/?]+).*#\2#'; }

looks_like_supabase() {
  local url="$1" host
  host="$(url_host "$url")"
  case "$host" in
    *supabase.co|*supabase.com|*supabase.in|*supabase.net|*pooler.supabase.*|db.*.supabase.*) return 0 ;;
  esac
  case "$url" in *"$SUPABASE_REF"*) return 0 ;; esac
  return 1
}

TARGET_HOST="$(url_host "$TARGET_DB_URL")"
SOURCE_HOST="$(url_host "$SOURCE_DB_URL")"
[ -n "$TARGET_HOST" ] || die "could not parse the host of TARGET_DB_URL"
[ -n "$SOURCE_HOST" ] || die "could not parse the host of SOURCE_DB_URL"

# ---- 0. refusals -----------------------------------------------------------
if looks_like_supabase "$TARGET_DB_URL"; then
  die "REFUSED: TARGET_DB_URL host '$TARGET_HOST' looks like Supabase. This script only writes to the self-hosted database."
fi
[ "$TARGET_DB_URL" != "$SOURCE_DB_URL" ] || die "REFUSED: source and target URLs are identical."
[ "$TARGET_HOST" != "$SOURCE_HOST" ] || info "WARNING: source and target share host '$SOURCE_HOST' (different database/port?)."
case "$SOURCE_DB_URL" in
  *:6543/*|*pgbouncer=true*) die "SOURCE_DB_URL points at the transaction pooler (port 6543); pg_dump needs the direct or session-mode URL (5432)." ;;
esac

# ---- tooling ---------------------------------------------------------------
PG_BIN="${PG_BIN:-}"
bin() { if [ -n "$PG_BIN" ]; then printf '%s/%s' "$PG_BIN" "$1"; else printf '%s' "$1"; fi; }
for tool in pg_dump pg_restore psql; do
  command -v "$(bin "$tool")" >/dev/null 2>&1 || die "$tool not found (install PostgreSQL 17 client tools or set PG_BIN)"
done
major="$("$(bin pg_dump)" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
[ "${major:-0}" -ge 17 ] || die "pg_dump is version ${major:-?}; version 17 or newer is required"

# Source sessions are forced read-only; both sides use an empty search_path so
# catalog pretty-printing is identical regardless of server-level settings.
src() { PGOPTIONS='-c default_transaction_read_only=on -c search_path=' "$(bin psql)" -X -q -At -F '|' -v ON_ERROR_STOP=1 "$SOURCE_DB_URL" "$@"; }
tgt() { PGOPTIONS='-c search_path=' "$(bin psql)" -X -q -At -F '|' -v ON_ERROR_STOP=1 "$TARGET_DB_URL" "$@"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/db-copy.XXXXXX")" || die "mktemp failed"
chmod 700 "$WORK"
cleanup() {
  if [ "$KEEP_DUMP" -eq 1 ]; then info "dump kept at: ${DUMP_FILE:-$WORK/xtimator.dump} (contains customer data)"; return; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
[ -n "$DUMP_FILE" ] || DUMP_FILE="$WORK/xtimator.dump"

info "source host: $SOURCE_HOST | target host: $TARGET_HOST"
src -c 'select 1' >/dev/null || fail "cannot connect to the source"
tgt -c 'select 1' >/dev/null || fail "cannot connect to the target"

# Second line of defence: the server itself must not be a Supabase instance.
if [ "$(tgt -c "select exists(select 1 from pg_roles where rolname='supabase_admin')")" = "t" ]; then
  die "REFUSED: the target server has a supabase_admin role - it is a Supabase instance."
fi
[ "$(tgt -c "show server_version_num")" -ge 170000 ] || die "target server is older than PostgreSQL 17"
[ "$(tgt -c "select count(*) from pg_available_extensions where name='vector'")" = "1" ] \
  || die "target has no pgvector available (use the pgvector/pgvector:pg17 image)"

# ---- 1. pre-flight on the source ------------------------------------------
external_fks="$(src -c "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
  where c.contype='f' and n.nspname='public' and c.confrelid::regclass::text ~ '^(auth|storage|vault)\\.'")"
[ "$external_fks" = "0" ] || fail "source has $external_fks foreign key(s) from public into auth/storage/vault; repoint them before copying"
ext_funcs="$(src -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p') and p.prosrc ~ '(auth\\.users|vault\\.|storage\\.objects)'")"
[ "$ext_funcs" = "0" ] || info "WARN: $ext_funcs public function(s) mention auth.users/vault/storage.objects (they will exist but fail if called on the target)"

# ---- 2/3. dump, shim, restore, shim --------------------------------------
if [ "$VERIFY_ONLY" -eq 0 ]; then
  [ -f "$SHIM" ] || die "shim migration not found at $SHIM"
  existing="$(tgt -c "select count(*) from information_schema.tables where table_schema in ('public','supabase_migrations') and table_type='BASE TABLE'")"
  if [ "${existing:-0}" != "0" ]; then
    if [ "$RESET_TARGET" -eq 1 ]; then
      info "--reset-target: dropping public + supabase_migrations on the target"
      tgt -c "drop schema if exists supabase_migrations cascade; drop schema if exists public cascade; create schema public;" >/dev/null \
        || fail "could not reset the target schemas"
    else
      die "target already has $existing table(s); re-run with --reset-target to wipe public/supabase_migrations first"
    fi
  fi

  info "pg_dump (schemas: ${SCHEMAS[*]}) ..."
  ( umask 077; "$(bin pg_dump)" --format=custom --no-owner --no-privileges \
      --schema=public --schema=supabase_migrations --file="$DUMP_FILE" "$SOURCE_DB_URL" ) \
    || fail "pg_dump failed"

  info "applying the compatibility shim (before restore)"
  tgt -f "$SHIM" >/dev/null || fail "shim failed (before restore)"

  info "pg_restore ..."
  "$(bin pg_restore)" --no-owner --no-privileges --dbname="$TARGET_DB_URL" "$DUMP_FILE" 2> "$WORK/restore.err"
  # Tolerate only the benign "already exists" notices for the pre-created schemas.
  bad="$(grep -iE '^pg_restore: error:' "$WORK/restore.err" | grep -viE 'schema "(public|supabase_migrations)" already exists' || true)"
  if [ -n "$bad" ]; then
    echo "$bad" | head -20 >&2
    fail "pg_restore reported errors (see above)"
  fi

  info "applying the compatibility shim (after restore: grants on restored objects)"
  tgt -f "$SHIM" >/dev/null || fail "shim failed (after restore)"
  tgt -c "analyze" >/dev/null || info "WARN: ANALYZE failed (non-fatal)"
fi

# ---- 4. verification -------------------------------------------------------
IN_SCHEMAS="('public','supabase_migrations')"
MISMATCH=0

# name|label|SQL  (each SQL returns deterministic, sorted rows)
q_rowcounts="select table_schema||'.'||table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema in $IN_SCHEMAS and table_type='BASE TABLE' order by 1"
q_sequences="select schemaname||'.'||sequencename, coalesce(last_value::text,'unset'), increment_by, max_value
  from pg_sequences where schemaname in $IN_SCHEMAS order by 1"
q_columns="select table_schema||'.'||table_name, column_name, udt_schema||'.'||udt_name, is_nullable, coalesce(column_default,''), coalesce(is_generated,'')
  from information_schema.columns where table_schema in $IN_SCHEMAS order by table_schema, table_name, ordinal_position"
q_constraints="select c.conrelid::regclass::text, c.conname, c.contype, pg_get_constraintdef(c.oid)
  from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in $IN_SCHEMAS order by 1,2"
q_indexes="select schemaname||'.'||tablename, indexname, indexdef from pg_indexes where schemaname in $IN_SCHEMAS order by 1,2"
q_triggers="select t.tgrelid::regclass::text, t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace
  where not t.tgisinternal and n.nspname in $IN_SCHEMAS order by 1,2"
q_rls_flags="select n.nspname||'.'||c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in $IN_SCHEMAS order by 1"
q_policies="select schemaname||'.'||tablename, policyname, permissive, array_to_string(roles,','), cmd, coalesce(qual,''), coalesce(with_check,'')
  from pg_policies where schemaname in $IN_SCHEMAS order by 1,2"
q_functions="select p.oid::regprocedure::text, p.prokind, p.prosecdef, md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in $IN_SCHEMAS and p.prokind in ('f','p') order by 1"
q_views="select schemaname||'.'||viewname, md5(definition) from pg_views where schemaname in $IN_SCHEMAS order by 1"
q_grants="select table_schema||'.'||table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')
  group by 1,2 order by 1,2"

compare() {
  local name="$1" sql="$2" level="${3:-fail}"
  src -c "$sql" > "$WORK/$name.src" 2> "$WORK/$name.src.err" || { echo "  [$name] cannot query source: $(head -1 "$WORK/$name.src.err")"; MISMATCH=1; return; }
  tgt -c "$sql" > "$WORK/$name.tgt" 2> "$WORK/$name.tgt.err" || { echo "  [$name] cannot query target: $(head -1 "$WORK/$name.tgt.err")"; MISMATCH=1; return; }
  local n; n="$(wc -l < "$WORK/$name.src" | tr -d ' ')"
  if diff -q "$WORK/$name.src" "$WORK/$name.tgt" >/dev/null; then
    echo "  [$name] OK ($n rows)"
  else
    if [ "$level" = "warn" ]; then echo "  [$name] WARN: differs"; else echo "  [$name] MISMATCH"; MISMATCH=1; fi
    diff "$WORK/$name.src" "$WORK/$name.tgt" | head -40 | sed 's/^/      /'
  fi
}

info "verifying source vs target ..."
compare rowcounts   "$q_rowcounts"
compare sequences   "$q_sequences"
compare columns     "$q_columns"
compare constraints "$q_constraints"
compare indexes     "$q_indexes"
compare triggers    "$q_triggers"
compare rls_flags   "$q_rls_flags"
compare policies    "$q_policies"
compare functions   "$q_functions"
compare views       "$q_views"
compare grants      "$q_grants" warn

pol_src="$(wc -l < "$WORK/policies.src" | tr -d ' ')"
pol_tgt="$(wc -l < "$WORK/policies.tgt" | tr -d ' ')"
info "RLS policies: source=$pol_src target=$pol_tgt | tables compared: $(wc -l < "$WORK/rowcounts.src" | tr -d ' ')"

# The request roles and the JWT helpers must exist on the target.
[ "$(tgt -c "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')")" = "4" ] \
  || { echo "  [roles] MISMATCH: anon/authenticated/service_role/authenticator not all present"; MISMATCH=1; }
[ "$(tgt -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','role','jwt')")" = "3" ] \
  || { echo "  [auth fns] MISMATCH: auth.uid/role/jwt not all present"; MISMATCH=1; }

if [ "$MISMATCH" -ne 0 ]; then
  fail "source and target differ - DO NOT cut over"
fi
info "OK: target is identical to source (row counts, sequences, columns, constraints, indexes, triggers, RLS, functions)."
info "Next: ALTER ROLE authenticator PASSWORD '<authenticator-password>'; start PostgREST; run the smoke list in docs/runbooks/db-to-coolify.md"
exit 0
