#!/usr/bin/env python3
"""Gate runner — reads literal_cmds from gate-plan.json and executes each step,
capturing evidence with @@GATE-META@@ / @@GATE-EXIT@@ markers.

This is the exec-pane runner; it runs in the cmux split's shell with the
provisioned environment (DATABASE_URL, FLEET_MANIFEST_PATH, FLEET_URL, etc.).
"""
import json, os, re, subprocess, sys, time, hashlib, datetime

EVIDENCE_DIR = os.environ["GATE_EVIDENCE_DIR"]
SPRINT_DIR = os.path.dirname(os.path.dirname(EVIDENCE_DIR))
PLAN_PATH = os.path.join(SPRINT_DIR, "gate-plan.json")
PROJECT_ROOT = "/Users/inference1/Projects/holocron"

with open(PLAN_PATH) as f:
    plan = json.load(f)

print("=" * 60)
print(f"GATE RUN STARTED: {datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}")
print(f"EVIDENCE_DIR={EVIDENCE_DIR}")
print(f"DATABASE_URL={os.environ.get('DATABASE_URL','<unset>')}")
print(f"FLEET_MANIFEST_PATH={os.environ.get('FLEET_MANIFEST_PATH','<unset>')}")
print(f"FLEET_URL={os.environ.get('FLEET_URL','<unset>')}")
print("=" * 60)
sys.stdout.flush()

results = []

for step in plan["steps"]:
    n = step["n"]
    literal_cmd = step["literal_cmd"]
    assertion = step["assertion"]
    text = step["text"]
    typ = step["type"]
    method = step["method"]

    cmd_sha = hashlib.sha256(literal_cmd.encode()).hexdigest()

    log_path = os.path.join(EVIDENCE_DIR, f"step{n}.log")
    exit_path = os.path.join(EVIDENCE_DIR, f"step{n}.exit")
    assertion_path = os.path.join(EVIDENCE_DIR, f"step{n}.assertion.json")
    cmd_file = os.path.join(EVIDENCE_DIR, f"step{n}.command.sh")

    # Write the exact command file for audit
    with open(cmd_file, "w") as f:
        f.write(f"#!/usr/bin/env bash\n")
        f.write(f"# @@GATE-META step={n} cmd_sha={cmd_sha}@@\n")
        f.write(f"# Literal command (byte-identical to gate-plan.json step.literal_cmd):\n")
        f.write(literal_cmd + "\n")

    # Write log header
    start_ms = int(time.time() * 1000)
    with open(log_path, "w") as f:
        f.write(f"@@GATE-META step={n} cmd_sha={cmd_sha}@@\n")
        f.write(f"# literal_cmd: {literal_cmd}\n")
        f.write(f"# started_at: {datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
        f.write(f"---\n")

    print(f"\n--- Step {n}: {text[:80]}... ---")
    print(f"cmd_sha={cmd_sha}")
    sys.stdout.flush()

    # Run the literal command via bash, inheriting the provisioned env
    env = os.environ.copy()
    try:
        proc = subprocess.Popen(
            ["bash", "-c", literal_cmd],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=PROJECT_ROOT,
            env=env,
        )
        try:
            stdout, _ = proc.communicate(timeout=300)
            exit_code = proc.returncode
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, _ = proc.communicate()
            exit_code = 124
    except Exception as e:
        stdout = str(e).encode()
        exit_code = 1

    end_ms = int(time.time() * 1000)
    duration_ms = end_ms - start_ms

    output = stdout.decode("utf-8", errors="replace")

    # Append output + trailer to log
    with open(log_path, "a") as f:
        f.write(output)
        if not output.endswith("\n"):
            f.write("\n")
        f.write(f"---\n")
        f.write(f"@@GATE-EXIT={exit_code}@@\n")

    with open(exit_path, "w") as f:
        f.write(str(exit_code))

    # Evaluate assertion
    expected_exit = assertion.get("expected_exit", 0)
    exit_ok = (exit_code == expected_exit)

    expect_re = assertion.get("expect_log_regex", "")
    expect_not_re = assertion.get("expect_not_log_regex", "")

    regex_ok = True
    regex_not_ok = True
    if expect_re:
        regex_ok = re.search(expect_re, output) is not None
    if expect_not_re:
        regex_not_ok = re.search(expect_not_re, output) is None

    if assertion.get("kind") == "manual":
        result = "manual"
    elif exit_ok and regex_ok and regex_not_ok:
        result = "pass"
    else:
        result = "fail"

    details = {
        "expected_exit": expected_exit,
        "actual_exit": exit_code,
        "exit_ok": exit_ok,
        "expect_log_regex": expect_re,
        "log_regex_matched": regex_ok,
        "expect_not_log_regex": expect_not_re,
        "log_not_regex_ok": regex_not_ok,
        "result": result,
        "duration_ms": duration_ms,
        "cmd_sha": cmd_sha,
    }
    with open(assertion_path, "w") as f:
        json.dump(details, f, indent=2)

    print(f"Step {n}: exit={exit_code} result={result} duration_ms={duration_ms}")
    sys.stdout.flush()

    results.append({"n": n, "result": result, "exit_code": exit_code, "duration_ms": duration_ms, "cmd_sha": cmd_sha})

# Summary
passed = sum(1 for r in results if r["result"] == "pass")
failed = sum(1 for r in results if r["result"] == "fail")
print("\n" + "=" * 60)
print(f"GATE RUN COMPLETE: {datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}")
print(f"Steps: {passed}/{len(results)} passed, {failed} failed")
for r in results:
    print(f"  step {r['n']}: {r['result']:6s} exit={r['exit_code']} dur={r['duration_ms']}ms sha={r['cmd_sha'][:12]}")
print("=" * 60)
print("@@GATE-RUN-DONE@@")
