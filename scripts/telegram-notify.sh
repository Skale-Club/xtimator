#!/usr/bin/env bash
#
# Pushes one ops alert to the platform Telegram chat from GitHub Actions.
#
# This is the OUTSIDE-the-server half of Xtimator's alerting. The in-app half
# (lib/observability/ops-alert.ts -> notifyOps, 10 event kinds across 31 call
# sites) is far richer, but it dies with the process it is meant to report on:
# a hung or crashed app cannot tell anyone it is hung. Anything routed through
# this script runs on GitHub's infrastructure instead, so it survives the
# container, the host, and Hetzner.
#
#   bash scripts/telegram-notify.sh "<b>Title</b>" "Body, \n for newlines"
#
# Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (repo secrets) and the optional
# TELEGRAM_THREAD_ID (repo variable, only for a group with Topics enabled).
#
# ALWAYS EXITS 0. Callers are workflows whose red/green state means something
# specific -- supabase-keepalive-monitor.yml reads this repo's workflow run
# history to decide whether to open an issue -- so a Telegram problem must
# never colour the run that carries it. Failures surface as ::error::
# annotations, which are visible in the run without changing its conclusion.
set -uo pipefail

TITLE="${1:?usage: telegram-notify.sh <title> [body]}"
BODY="${2:-}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "::warning::TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — '${TITLE}' was not delivered."
  exit 0
fi

# The message is sent with parse_mode=HTML, so '<', '>' and '&' in the BODY are
# markup, not text. Bodies carry interpolated, untrusted-ish content — commit
# subjects, curl output, Telegram's own error text — and a single '<' makes
# Telegram reject the whole message:
#
#   {"ok":false,"error_code":400,"description":"Bad Request: can't parse
#    entities: Unsupported start tag \"10\" at byte offset 120"}
#
# i.e. a commit message reading "fix: 5<10" would silently kill the alert. This
# is not hypothetical — it was reproduced against the live bot while building
# this. Mirrors the esc() in formatOpsMessage() in lib/observability/ops-alert.ts,
# which escapes for the same reason on the in-app side.
#
# Only the BODY is escaped. The TITLE is written by us and intentionally
# contains <b>…</b>; no caller puts markup in a body.
# '&' MUST be substituted first, or it would re-escape the '&' of &lt;/&gt;.
esc_body=$(printf '%s' "${BODY}" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')

# printf '%b' expands the \n the caller wrote into REAL newlines.
text=$(printf '%b' "${TITLE}\n\n${esc_body}")

# Transport: a JSON body, not -d/--data-urlencode form fields.
#
# Both work on ubuntu-latest, which is the only place this actually runs. The
# JSON path is used anyway because --data-urlencode is NOT safe everywhere:
# on Git Bash / MSYS (Windows, where this repo is developed) curl transcodes
# the form field through the ANSI codepage and replaces every non-ASCII byte
# with '?'. Telegram then answers {"ok":true} for a message whose emoji have
# been eaten -- a corruption that reports success, which is the worst possible
# failure mode for an alert channel. Verified: identical UTF-8 bytes deliver as
# "?" via --data-urlencode and as "✅" via the JSON body.
#
# jq or Python does the escaping (quotes, backslashes, newlines, control
# chars). Both are preinstalled on every GitHub-hosted runner; two tiers exist
# so the JSON path also works on a bare Git Bash checkout, where jq is usually
# absent. The urlencode form is kept as a last resort so a host with neither
# still delivers rather than going silent.
payload=""
if command -v jq >/dev/null 2>&1; then
  payload=$(jq -n \
    --arg chat "${TELEGRAM_CHAT_ID}" \
    --arg text "${text}" \
    --arg thread "${TELEGRAM_THREAD_ID:-}" \
    '{chat_id: $chat, text: $text, parse_mode: "HTML", disable_web_page_preview: true}
     + (if $thread == "" then {} else {message_thread_id: ($thread | tonumber? // $thread)} end)')
else
  for py in python3 python; do
    command -v "$py" >/dev/null 2>&1 || continue
    # ensure_ascii=True escapes every non-ASCII char to \uXXXX, so the request
    # body is pure ASCII on the wire and no codepage can corrupt it.
    payload=$(CHAT="${TELEGRAM_CHAT_ID}" TEXT="${text}" THREAD="${TELEGRAM_THREAD_ID:-}" "$py" -c '
import json, os
p = {"chat_id": os.environ["CHAT"], "text": os.environ["TEXT"],
     "parse_mode": "HTML", "disable_web_page_preview": True}
t = os.environ.get("THREAD", "")
if t:
    p["message_thread_id"] = int(t) if t.lstrip("-").isdigit() else t
print(json.dumps(p, ensure_ascii=True))') && break
  done
fi

if [ -n "${payload}" ]; then
  response=$(curl -sS --max-time 20 -X POST \
    -H "Content-Type: application/json" \
    --data-binary "${payload}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>&1)
else
  echo "::warning::neither jq nor python found — falling back to form encoding (non-ASCII may be mangled)."
  thread_arg=()
  [ -n "${TELEGRAM_THREAD_ID:-}" ] && thread_arg=(-d "message_thread_id=${TELEGRAM_THREAD_ID}")
  response=$(curl -sS --max-time 20 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=HTML" \
    -d "disable_web_page_preview=true" \
    "${thread_arg[@]}" \
    --data-urlencode "text=${text}" 2>&1)
fi

case "${response}" in
  *'"ok":true'*)
    echo "Telegram alert sent: ${TITLE}"
    ;;
  *)
    # Print Telegram's own explanation: the status code alone rarely says what
    # to fix. The one that matters most is the supergroup migration -- when a
    # group is upgraded its chat id changes, every later alert fails, and ops
    # alerting dies silently unless the replacement id is surfaced. Telegram
    # puts that new id in the error text, e.g.
    #   "Bad Request: group chat was upgraded to a supergroup chat"
    #   with parameters.migrate_to_chat_id = -1001234567890
    # so echoing the raw body verbatim is what makes the failure recoverable.
    echo "::error::Telegram refused the alert: ${response}"
    ;;
esac

exit 0
