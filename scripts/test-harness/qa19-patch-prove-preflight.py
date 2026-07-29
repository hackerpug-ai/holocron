#!/usr/bin/env python3
"""Harness-only: wrap writer preflight HEADs with MOCK_AS_WRITER under mock mode."""
from __future__ import annotations

import sys
from pathlib import Path

p = Path(sys.argv[1])
t = p.read_text()
if "qa19_preflight_mock_as_writer" in t:
    print("already patched", p, file=sys.stderr)
    raise SystemExit(0)

markers = [
    """  r2_ro_run_provider \"$wak\" \"$wsk\" \"$wst\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$in_key\" >/dev/null 2>&1
  prc_in=$?
  r2_ro_run_provider \"$wak\" \"$wsk\" \"$wst\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$out_key\" >/dev/null 2>&1
  prc_out=$?
""",
    """  r2_ro_run_provider \"$wak\" \"$wsk\" \"\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$in_key\" >/dev/null 2>&1
  prc_in=$?
  r2_ro_run_provider \"$wak\" \"$wsk\" \"\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$out_key\" >/dev/null 2>&1
  prc_out=$?
""",
]

new = """  # qa19_preflight_mock_as_writer: harness-only writer class for preflight HEADs
  _qa19_prev_as_writer=\"${HOLO_R2_PROVIDER_MOCK_AS_WRITER-}\"
  if [[ -n \"${HOLO_R2_PROVIDER_MOCK_MODE:-}\" ]]; then
    export HOLO_R2_PROVIDER_MOCK_AS_WRITER=1
    if [[ -z \"$wak\" || -z \"$wsk\" ]]; then
      wak=\"AKIA_WRITER_HARNESS\"
      wsk=\"sk_writer_harness\"
    fi
    if [[ -z \"${wst:-}\" ]]; then wst=\"\"; fi
  fi
  r2_ro_run_provider \"$wak\" \"$wsk\" \"${wst:-}\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$in_key\" >/dev/null 2>&1
  prc_in=$?
  r2_ro_run_provider \"$wak\" \"$wsk\" \"${wst:-}\" head-object \\
    --endpoint \"$endpoint\" --bucket \"$bucket\" --key \"$out_key\" >/dev/null 2>&1
  prc_out=$?
  if [[ -n \"${HOLO_R2_PROVIDER_MOCK_MODE:-}\" ]]; then
    if [[ -n \"${_qa19_prev_as_writer}\" ]]; then export HOLO_R2_PROVIDER_MOCK_AS_WRITER=\"$_qa19_prev_as_writer\"; else unset HOLO_R2_PROVIDER_MOCK_AS_WRITER; fi
  fi
"""

# Use unescaped forms matching actual file content
markers = [
    '  r2_ro_run_provider "$wak" "$wsk" "$wst" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1\n'
    "  prc_in=$?\n"
    '  r2_ro_run_provider "$wak" "$wsk" "$wst" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1\n'
    "  prc_out=$?\n",
    '  r2_ro_run_provider "$wak" "$wsk" "" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1\n'
    "  prc_in=$?\n"
    '  r2_ro_run_provider "$wak" "$wsk" "" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1\n'
    "  prc_out=$?\n",
]

new = (
    "  # qa19_preflight_mock_as_writer: harness-only writer class for preflight HEADs\n"
    '  _qa19_prev_as_writer="${HOLO_R2_PROVIDER_MOCK_AS_WRITER-}"\n'
    '  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then\n'
    "    export HOLO_R2_PROVIDER_MOCK_AS_WRITER=1\n"
    '    if [[ -z "$wak" || -z "$wsk" ]]; then\n'
    '      wak="AKIA_WRITER_HARNESS"\n'
    '      wsk="sk_writer_harness"\n'
    "    fi\n"
    '    if [[ -z "${wst:-}" ]]; then wst=""; fi\n'
    "  fi\n"
    '  r2_ro_run_provider "$wak" "$wsk" "${wst:-}" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1\n'
    "  prc_in=$?\n"
    '  r2_ro_run_provider "$wak" "$wsk" "${wst:-}" head-object \\\n'
    '    --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1\n'
    "  prc_out=$?\n"
    '  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then\n'
    '    if [[ -n "${_qa19_prev_as_writer}" ]]; then export HOLO_R2_PROVIDER_MOCK_AS_WRITER="$_qa19_prev_as_writer"; else unset HOLO_R2_PROVIDER_MOCK_AS_WRITER; fi\n'
    "  fi\n"
)

for old in markers:
    if old in t:
        p.write_text(t.replace(old, new, 1))
        print("patched", p, file=sys.stderr)
        raise SystemExit(0)

i = t.find('r2_ro_run_provider "$wak"')
raise SystemExit(f"no match near: {t[i:i+300]!r}")
