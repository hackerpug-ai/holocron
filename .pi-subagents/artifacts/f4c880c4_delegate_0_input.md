# Task for delegate

Act as the same logical `react-native-ui-planner` specialist for a mandatory fakeability remediation pass. The consolidated Sprint 21 task proposals are at /Users/inference1/Projects/holocron/.pi-subagents/artifacts/outputs/c31374ab/.tmp/sprint21-planner-output.md. The deterministic validator /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py failed because each task's REQUIREMENT-CONTRACT `requirements[].scenario` was emitted as a string like "AC-1" instead of the full scenario object. Do not write files. Return ONLY one fenced ```json block {"expanded_tasks":[...]} containing all three complete corrected task objects, preserving the prior task content and Proposed By attribution `react-native-ui-planner`, but replace every acceptance requirement's scenario string with its full scenario object and add `id` to each scenario (AC-N), preserving fixtures/start_ref/action/end_state/negative_control/evidence/test_tier. Ensure every corrected scenario passes the validator: real seed_method, concrete non-degenerate must_observe, must_not_observe, action steps, evidence, integration/e2e tier. Do not hand-wave or omit any task. No prose or acceptance wrapper.

---
**Output:**
Write your findings to exactly this path: /Users/inference1/Projects/holocron/.pi-subagents/artifacts/outputs/f4c880c4/.tmp/sprint21-planner-remediated-output.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.