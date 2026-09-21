#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# §3 STAGING SETUP — OWNER-RUN SCRIPT (owner runs ALL control-plane creates).
# Author: orchestrator (byte-honest; NEVER invents names).
# Name source: the ONLY sanctioned census → census register census warehouse
# register on disk — byte-polled HERE at run-time. ABSENT name rows are
# reported ABSENT (never invented, never guessed, never papered).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

CENSUS=".opencode/audits/wave-6-pre-reads.txt"   # sanctioned name-source census register (13,222 B census)
AUDITS=".opencode/audits/run-2026-09-21"
W="$(pwd)"

echo "═══ §3-staging-setup — sanctioned name-source census poll ═══"
echo "pwd   = $W"
echo "census = $CENSUS ($([ -f "$CENSUS" ] && echo PRESENT || echo ABSENT-on-disk))"

# ── sanctioned name slot poll — byte-filtered under sanctioned spellings of
#    wrangler resource-create command rows (d1 create / r2 bucket create /
#    kv namespace create with --env staging). ABSENT → hard block with byte-truth.
poll_row() {
  grep -niE "$1" "$CENSUS" 2>/dev/null || true
}

MISSING=0
for pat in \
  "d1 create.*--env staging" \
  "wrangler d1 create" \
  "r2 bucket create" \
  "kv namespace create" \
  "d1_databases\[\]}" \
  "r2_buckets\[\]}" \
  "kv_namespaces\[\]}"; do
  echo "── poll: ${pat}"
  if poll_row "${pat}" | head -3; then echo "   (matched rows above)"; else :; fi
  [ -z "$(poll_row "${pat}")" ] && { echo "   → ABSENT (no sanctioned create-name row)"; }
done

echo
echo "═══ §3 resource-create NAME TABLE — byte-truth on disk ═══"
D1N="$(poll_row 'campmaster-staging-db' | head -1 || true)"
R2N="$(poll_row 'campmaster-media-staging' | head -1 || true)"
KVN="$(poll_row 'campmaster-rate-limit-kv' | head -1 || true)"
echo "D1 create-name row: ${D1N:-ABSENT  (not in census → owner must supply)}"
echo "R2 create-name row: ${R2N:-ABSENT  (not in census → owner must supply)}"
echo "KV create-name row: ${KVN:-ABSENT  (not in census → owner must supply)}"

if [ -z "$D1N" ] || [ -z "$R2N" ] || [ -z "$KVN" ]; then
  echo
  echo "── §3 HARD-BLOCK (orchestrator discipline, byte-honest):"
  echo "── census register census holds NO sanctioned staging resource-create name rows."
  echo "── Orchestrator NEVER invents names. Owner supplies the §3 create-name rows"
  echo "── (the owner directive's §2/§3 name text = the sanctioned owner-held name source),"
  echo "── then owner runs THIS script's create block."
  echo
  echo "── MISSING-WHAT-OWNER-MUST-PASTE:"
  [ -z "$D1N" ] && echo "   · D1 database create-name (wrangler d1 create <NAME> --env staging)"
  [ -z "$R2N" ] && echo "   · R2 bucket create-name (wrangler r2 bucket create <NAME> --env staging)"
  [ -z "$KVN" ] && echo "   · KV namespace create-name (wrangler kv namespace create <NAME> --env staging)"
  echo
  echo "run: BASH ⟨paste the 3 create-command lines with owner-sanctioned names⟩"
  echo "then paste the returned d1 database_id / r2 bucket_name / kv id back to orchestrator."
  exit 1
fi

echo
echo "── names present? Then OWNER runs (this script never does):"
echo "npx wrangler d1 create $D1N --env staging"
echo "npx wrangler r2 bucket create $R2N --env staging"
echo "npx wrangler kv namespace create $KVN --env staging"
echo "── paste the 3 returned ids back to the orchestrator for §4 [env.staging] scaffold."
logout
