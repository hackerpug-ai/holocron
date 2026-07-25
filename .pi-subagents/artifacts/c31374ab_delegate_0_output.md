```json
{
  "expanded_tasks": [
    {
      "task_id": "S-CONTRACT-01",
      "title": "Inventory every legacy Convex hook/action call site in the RN app",
      "task_type": "INFRA",
      "tdd_mode": "skipped",
      "verification_policy": {
        "requires_tests": false,
        "requires_red_evidence": false,
        "requires_seeded_evidence": true
      },
      "status": "Backlog",
      "priority": "P0",
      "effort": "M",
      "estimate_minutes": 120,
      "agent": "react-native-ui-implementer",
      "agent_rationale": "Owns React Native state and network migration and can distinguish route-level Convex hooks, actions, generated API references, and test-only imports.",
      "reviewer": "react-native-ui-reviewer",
      "reviewer_rationale": "Verifies that the inventory covers the complete RN surface, preserves source locations, and does not omit provider or generated-API dependencies needed by the rewrite.",
      "sprint_id": "sprint-21-client-data-contract",
      "proposed_by": "react-native-ui-planner",
      "prd_refs": [
        "UC-SYNC-01",
        "T-SYNC-019",
        "T-SYNC-004"
      ],
      "background": "The roadmap gate requires the 47-file RN legacy inventory to account for 105 Convex hook/action call sites before any mapping is authored. The current app still imports Convex in app/_layout.tsx and across route, component, hook, screen, and story surfaces, while the Zero schema currently exposes only the Sprint 20 thin chat surface.",
      "outcome": "Produce a deterministic, line-addressed inventory artifact containing every legacy Convex provider, useQuery, useMutation, useAction, useConvex, and generated API call site in the approved RN source roots.",
      "specification": {
        "objective": "Implement holo inventory:convex-callsites and emit a deterministic JSON inventory for the approved RN source roots.",
        "success_state": "The command reports exactly 47 source files and 105 call sites, gives every row a stable ID and source location, and produces byte-stable output on repeated runs without scanning generated or dependency directories."
      },
      "primary_test_tier": "integration",
      "touches_capabilities": [
        "CAP-SYNC-01",
        "CAP-CUT-01"
      ],
      "provides": [
        "convex-callsite-inventory-json",
        "stable-callsite-identifiers",
        "inventory-command"
      ],
      "consumes": [
        "current RN source tree",
        "legacy Convex generated API references"
      ],
      "boundary_contracts": [
        "RN source tree to migration inventory",
        "legacy hook/action call site to stable source-location identity",
        "inventory artifact to client-data-contract authoring"
      ],
      "critical_constraints": {
        "must": [
          "MUST scan app/, components/, hooks/, and screens/ using real repository files and preserve relative path, line, column, hook kind, and Convex reference.",
          "MUST count provider and hook/action call sites according to one documented counting rule so the reported 47 files and 105 call sites are reproducible.",
          "MUST emit JSON that is deterministic across two executions against the same checkout."
        ],
        "never": [
          "NEVER scan node_modules, .git, .spec task outputs, generated dependency code, or test fixtures as production RN call sites.",
          "NEVER collapse multiple hook/action invocations in one file into one record.",
          "NEVER infer a target mapping in the inventory task; target selection belongs to S-CONTRACT-02."
        ],
        "strictly": [
          "STRICTLY keep inventory semantics independent from the future Zero implementation.",
          "STRICTLY fail with a nonzero exit when a source file cannot be parsed or a required source location cannot be recorded."
        ]
      },
      "fixtures": {
        "rn_legacy_tree": {
          "description": "The checked-out Holocron RN source tree containing the roadmap's 47 legacy-call-site files and 105 Convex hook/action call sites.",
          "seed_method": "cli",
          "records": [
            "app/_layout.tsx",
            "app/articles.tsx",
            "app/document/[id].tsx",
            "app/(drawer)/_layout.tsx",
            "app/(drawer)/chat/[conversationId].tsx",
            "hooks/use-chat-history.ts",
            "hooks/useResearchSession.ts",
            "hooks/use-voice-session.ts",
            "components/chat/MessageBubble.tsx",
            "components/notifications/NotificationToastProvider.tsx",
            "screens/article-detail.tsx",
            "screens/settings-screen.tsx"
          ]
        }
      },
      "acceptance_criteria": [
        {
          "id": "AC-1",
          "num": 1,
          "name": "Complete legacy inventory",
          "given": "The repository contains the approved RN source roots and the legacy Convex imports described by UC-SYNC-01.",
          "when": "An operator runs the inventory command against the repository root.",
          "then": "The command exits 0 and reports file_count=47, call_site_count=105, and an inventory artifact containing 105 call-site records.",
          "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
          "test_tier": "integration",
          "verification_service": "bun-cli+filesystem",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+filesystem",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the scanner disconnects from the repository filesystem",
                "the implementation returns a static 47/105 result",
                "the scanner silently omits a legacy call site",
                "the output artifact is empty"
              ]
            },
            "evidence": {
              "artifact_type": "file_artifact",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "rn_legacy_tree",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
                    "read the emitted JSON summary and records"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "file_count=47",
                    "call_site_count=105",
                    "JSON records length=105",
                    "artifact file size > 0 bytes"
                  ],
                  "must_not_observe": [
                    "file_count=0",
                    "call_site_count=0",
                    "empty inventory artifact",
                    "static or hardcoded summary with no source paths"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-2",
          "num": 2,
          "name": "Line-addressed stable records",
          "given": "The inventory has discovered 105 legacy call sites across the RN roots.",
          "when": "An operator inspects the emitted records.",
          "then": "Every record has a unique call_site_id, source_path, line, column, hook_kind, and legacy_ref, and no two records share the same source location.",
          "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105; assert len({x['call_site_id'] for x in r})==105; assert all(x['source_path'] and x['line']>0 and x['column']>0 and x['hook_kind'] and x['legacy_ref'] for x in r); assert len({(x['source_path'],x['line'],x['column']) for x in r})==105\"",
          "test_tier": "integration",
          "verification_service": "python3+inventory-artifact",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "python3+inventory-artifact",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the parser emits duplicate call_site_id values",
                "source locations are omitted",
                "the inventory uses an empty static record list"
              ]
            },
            "evidence": {
              "artifact_type": "db_query",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "rn_legacy_tree",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run the inventory command",
                    "run the JSON uniqueness and required-field assertion"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "105 unique call_site_id values",
                    "105 unique source_path/line/column tuples",
                    "105 records with line > 0 and column > 0"
                  ],
                  "must_not_observe": [
                    "duplicate call_site_id",
                    "missing source_path",
                    "line=0",
                    "empty record list"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-3",
          "num": 3,
          "name": "Deterministic rerun",
          "given": "The source checkout is unchanged after a successful inventory run.",
          "when": "The operator runs the command twice and hashes both artifacts.",
          "then": "Both runs report 47 files and 105 call sites and produce the same SHA-256 digest.",
          "verify": "rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test \"$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)\" = \"$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)\"",
          "test_tier": "integration",
          "verification_service": "bun-cli+shasum",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+shasum",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "record ordering changes between runs",
                "the command uses a timestamp or random identifier",
                "the second artifact is empty"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "rn_legacy_tree",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run the inventory command twice against the unchanged checkout",
                    "compute SHA-256 for both JSON artifacts"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "run count=2",
                    "both summaries report 47 files",
                    "both summaries report 105 call sites",
                    "SHA-256 digest equality"
                  ],
                  "must_not_observe": [
                    "different artifact digests",
                    "timestamp-only output",
                    "empty second artifact"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-4",
          "num": 4,
          "name": "Approved source-root boundary",
          "given": "The repository contains production RN files, generated Convex code, dependencies, and tests.",
          "when": "The inventory command completes with its default source-root policy.",
          "then": "The artifact records the four approved roots app/, components/, hooks/, and screens/ and excludes node_modules, convex/_generated, and test-only files.",
          "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert p['source_roots']==['app','components','hooks','screens']; paths=[x['source_path'] for x in p['call_sites']]; assert not any(x.startswith(('node_modules/','convex/_generated/')) or x.endswith(('.test.ts','.test.tsx')) for x in paths)\"",
          "test_tier": "integration",
          "verification_service": "python3+inventory-artifact",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "python3+inventory-artifact",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the scanner includes dependency code",
                "the scanner includes generated code",
                "the scanner scans an empty source-root set"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "rn_legacy_tree",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run the inventory command with default roots",
                    "assert the source_roots and path exclusions in the JSON artifact"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "source root count=4",
                    "app/ is listed",
                    "components/ is listed",
                    "hooks/ is listed",
                    "screens/ is listed"
                  ],
                  "must_not_observe": [
                    "node_modules/ in call-site paths",
                    "convex/_generated/ in call-site paths",
                    "test-only source path in call-site paths",
                    "source root count=0"
                  ]
                }
              }
            ]
          }
        }
      ],
      "test_criteria": [
        {
          "id": "TC-1",
          "num": 1,
          "statement": "Inventory command reports 47 source files and 105 call sites when run against the checked-out RN source tree",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
          "type": "happy_path"
        },
        {
          "id": "TC-2",
          "num": 2,
          "statement": "Inventory artifact contains 105 unique line-addressed records",
          "maps_to_ac": "AC-2",
          "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105 and len({x['call_site_id'] for x in r})==105 and all(x['line']>0 and x['column']>0 for x in r)\"",
          "type": "structural"
        },
        {
          "id": "TC-3",
          "num": 3,
          "statement": "Two unchanged inventory runs produce the same SHA-256 digest",
          "maps_to_ac": "AC-3",
          "verify": "rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test \"$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)\" = \"$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)\"",
          "type": "determinism"
        },
        {
          "id": "TC-4",
          "num": 4,
          "statement": "Inventory artifact contains exactly four approved source roots",
          "maps_to_ac": "AC-4",
          "verify": "python3 -c \"import json; assert json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots']==['app','components','hooks','screens']\"",
          "type": "boundary"
        }
      ],
      "requirements": [
        {
          "id": "AC-1",
          "type": "acceptance_criterion",
          "description": "GIVEN the approved RN source roots WHEN the inventory command runs THEN it reports 47 files and 105 call sites and emits a non-empty artifact.",
          "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
          "scenario": "AC-1"
        },
        {
          "id": "AC-2",
          "type": "acceptance_criterion",
          "description": "GIVEN 105 discovered call sites WHEN records are inspected THEN each has a unique stable ID and line-addressed source location.",
          "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105 and len({x['call_site_id'] for x in r})==105\"",
          "scenario": "AC-2"
        },
        {
          "id": "AC-3",
          "type": "acceptance_criterion",
          "description": "GIVEN an unchanged checkout WHEN inventory runs twice THEN both artifacts have equal SHA-256 digests.",
          "verify": "shasum -a 256 .tmp/client-contract/rerun/one.json .tmp/client-contract/rerun/two.json",
          "scenario": "AC-3"
        },
        {
          "id": "AC-4",
          "type": "acceptance_criterion",
          "description": "GIVEN production RN files and dependency/generated/test files WHEN the default scan runs THEN only four approved source roots are included.",
          "verify": "python3 -c \"import json; assert json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots']==['app','components','hooks','screens']\"",
          "scenario": "AC-4"
        },
        {
          "id": "TC-1",
          "type": "test_criterion",
          "description": "Inventory command reports 47 source files and 105 call sites when run against the checked-out RN source tree.",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json"
        },
        {
          "id": "TC-2",
          "type": "test_criterion",
          "description": "Inventory artifact contains 105 unique line-addressed records.",
          "maps_to_ac": "AC-2",
          "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert len(p['call_sites'])==105\""
        },
        {
          "id": "TC-3",
          "type": "test_criterion",
          "description": "Two unchanged inventory runs produce the same SHA-256 digest.",
          "maps_to_ac": "AC-3",
          "verify": "shasum -a 256 .tmp/client-contract/rerun/one.json .tmp/client-contract/rerun/two.json"
        },
        {
          "id": "TC-4",
          "type": "test_criterion",
          "description": "Inventory artifact contains exactly four approved source roots.",
          "maps_to_ac": "AC-4",
          "verify": "python3 -c \"import json; assert len(json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots'])==4\""
        }
      ],
      "reading_list": [
        {
          "path": ".spec/prds/mk6-migration/ROADMAP.md",
          "lines": "1190-1235",
          "focus": "Sprint 21 gate, 47-file/105-call-site inventory, task dependency and capability coverage"
        },
        {
          "path": ".spec/prds/mk6-migration/08-uc-sync.md",
          "lines": "20-30",
          "focus": "UC-SYNC-01 migration contract and one-mapping-per-call-site requirement"
        },
        {
          "path": ".spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md",
          "lines": "8-38",
          "focus": "RN source roots, current Convex/Zero split, and 105 call-site scope"
        },
        {
          "path": "app/_layout.tsx",
          "lines": "1-19,37-49,132-166",
          "focus": "ConvexProvider, ConvexReactClient, and ZeroProvider boot surfaces"
        },
        {
          "path": "app/articles.tsx",
          "lines": "1-75",
          "focus": "Representative useQuery/useAction call-site shape"
        },
        {
          "path": "hooks/use-voice-session.ts",
          "lines": "17-20,100-115",
          "focus": "Representative useAction/useMutation/useConvex call-site shape"
        },
        {
          "path": "services/platform/src/cli/holo.ts",
          "lines": "1-150,684-700",
          "focus": "CLI command conventions, help output, parser, and dispatch switch"
        },
        {
          "path": "/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py",
          "lines": "1-260",
          "focus": "Valid scenario fields, real seed methods, concrete observations, negative controls, and evidence"
        }
      ],
      "guardrails": {
        "write_allowed": [
          "services/platform/src/cli/holo.ts (MODIFY)",
          "services/platform/src/sync/client-callsite-inventory.ts (NEW)",
          "services/platform/src/cli/__tests__/client-callsite-inventory.test.ts (NEW)",
          ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json (NEW)",
          ".tmp/client-contract/** (NEW verification artifacts)"
        ],
        "write_prohibited": [
          "app/** - inventory only; do not rewrite RN surfaces",
          "components/** - inventory only; do not rewrite components",
          "hooks/** - inventory only; do not rewrite hooks",
          "screens/** - inventory only; do not rewrite screens",
          "app/zero/schema.ts - Zero schema authoring belongs to later rewrite work",
          ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml - authored by S-CONTRACT-02"
        ]
      },
      "writeAllowed": [
        "services/platform/src/cli/holo.ts",
        "services/platform/src/sync/client-callsite-inventory.ts",
        "services/platform/src/cli/__tests__/client-callsite-inventory.test.ts",
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
        ".tmp/client-contract/**"
      ],
      "writeProhibited": [
        "app/**",
        "components/**",
        "hooks/**",
        "screens/**",
        "app/zero/schema.ts",
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml"
      ],
      "design": {
        "references": [
          ".spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md",
          ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md"
        ],
        "interaction_notes": [
          "Inventory is a read-only source analysis boundary consumed by the contract authoring task."
        ],
        "pattern": "Use a deterministic source walker and a parser-backed call-site extractor, then sort records by source_path, line, column, and hook_kind before assigning stable IDs.",
        "pattern_source": "services/platform/src/cli/holo.ts:684-700",
        "anti_pattern": "Do not use a grep-only count, a hardcoded 47/105 summary, or a directory-wide scan that includes generated code and dependencies."
      },
      "verification_gates": [
        {
          "gate": "Complete inventory",
          "command": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
          "expected": "Exit 0; stdout reports file_count=47 and call_site_count=105."
        },
        {
          "gate": "Inventory artifact schema",
          "command": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert len(p['call_sites'])==105 and all(x['source_path'] and x['line']>0 and x['column']>0 for x in p['call_sites'])\"",
          "expected": "Exit 0."
        },
        {
          "gate": "Determinism",
          "command": "rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test \"$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)\" = \"$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)\"",
          "expected": "Exit 0."
        },
        {
          "gate": "Scenario validation",
          "command": "python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-01-scenarios.json",
          "expected": "Exit 0 with zero CRITICAL or HIGH violations."
        },
        {
          "gate": "Typecheck and lint",
          "command": "pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/sync/client-callsite-inventory.ts",
          "expected": "Both commands exit 0."
        }
      ],
      "coding_standards": [
        "RULES.md#react--react-native-rules",
        "/Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md",
        "/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md",
        "/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md"
      ],
      "dependencies": {
        "depends_on": [
          "Sprint 04",
          "Sprint 05",
          "Sprint 18"
        ],
        "blocks": [
          "S-CONTRACT-02"
        ]
      }
    },
    {
      "task_id": "S-CONTRACT-02",
      "title": "Author 13-client-data-contract.yaml mapping every call site to its target",
      "task_type": "CONFIG",
      "tdd_mode": "skipped",
      "verification_policy": {
        "requires_tests": false,
        "requires_red_evidence": false,
        "requires_seeded_evidence": true
      },
      "status": "Backlog",
      "priority": "P0",
      "effort": "XL",
      "estimate_minutes": 300,
      "agent": "react-native-ui-implementer",
      "agent_rationale": "Owns the client-side migration semantics and can map Convex reads/writes to Zero projections, Zero mutators, and authoritative Hono commands without changing UI behavior.",
      "reviewer": "react-native-ui-reviewer",
      "reviewer_rationale": "Reviews each mapping for route ownership, identifier compatibility, offline behavior, optimistic rollback, conflict semantics, and alignment with the RN rewrite.",
      "sprint_id": "sprint-21-client-data-contract",
      "proposed_by": "react-native-ui-planner",
      "prd_refs": [
        "UC-SYNC-01",
        "T-SYNC-019",
        "T-SYNC-004"
      ],
      "background": "The migration constitution requires 13-client-data-contract.yaml to map every legacy Convex hook/action call site to one published Zero query, Zero mutator, or authoritative Hono command. Each mapping must declare projection, response/error shape, ordering/cursor behavior, optimistic behavior, conflict/rejection behavior, offline policy, identifier compatibility, and a linked T-SYNC criterion.",
      "outcome": "Author the machine-readable client data contract from the completed 105-row inventory and the live zero_pub/Hono surfaces.",
      "specification": {
        "objective": "Create 10-technical-requirements/13-client-data-contract.yaml with exactly one complete mapping for each inventory call site.",
        "success_state": "The contract contains 105 unique call-site mappings, every mapping has all required semantic fields, every target resolves to the published Zero surface or Hono route, and every entry links a valid T-SYNC criterion."
      },
      "primary_test_tier": "integration",
      "touches_capabilities": [
        "CAP-SYNC-01",
        "CAP-CUT-01"
      ],
      "provides": [
        "13-client-data-contract.yaml",
        "per-call-site-target-mappings",
        "offline-optimistic-conflict-rejection-contract"
      ],
      "consumes": [
        "13-client-callsite-inventory.json",
        "services/platform/src/db/schema/zero-pub.ts",
        "app/zero/schema.ts",
        "services/platform/src/http/hono-app.ts",
        "T-SYNC-004",
        "T-SYNC-019"
      ],
      "boundary_contracts": [
        "legacy call-site identity to exactly one client contract entry",
        "contract target to live zero_pub table or Hono route",
        "client operation to offline/optimistic/conflict/rejection/identifier semantics",
        "contract entry to linked E2E criterion"
      ],
      "critical_constraints": {
        "must": [
          "MUST preserve every inventory call_site_id exactly once and retain its consuming route and source location.",
          "MUST declare target kind, target name, projection, response/error shape, ordering/cursor behavior, optimistic behavior, conflict behavior, rejection behavior, offline policy, identifier compatibility, and linked E2E criterion for every entry.",
          "MUST use Zero reactive queries for published reads, registered Zero mutators for simple client-visible CRUD, and authoritative Hono commands for chat, mission, and upload operations."
        ],
        "never": [
          "NEVER invent a target absent from zero_pub or the Hono command surface.",
          "NEVER mark authoritative Hono commands as optimistically applied database mutators.",
          "NEVER use a blanket offline policy or omit rejection/conflict semantics to make entries pass validation."
        ],
        "strictly": [
          "STRICTLY keep one mapping per call_site_id; duplicate mappings and orphaned inventory rows are errors.",
          "STRICTLY preserve legacy IDs only through an explicit alias and expiry declaration.",
          "STRICTLY link each entry to T-SYNC-019 or another criterion present in 11-e2e-testing-criteria.md."
        ]
      },
      "fixtures": {
        "contract_inputs": {
          "description": "A completed 105-row legacy inventory plus the current Zero publication and Hono route surfaces used to author the contract.",
          "seed_method": "cli",
          "records": [
            ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
            "app/zero/schema.ts",
            "services/platform/src/db/schema/zero-pub.ts",
            "services/platform/src/http/hono-app.ts",
            "services/platform/src/http/chat-runs.ts",
            "T-SYNC-004",
            "T-SYNC-019"
          ]
        }
      },
      "acceptance_criteria": [
        {
          "id": "AC-1",
          "num": 1,
          "name": "One complete entry per call site",
          "given": "The S-CONTRACT-01 inventory contains 105 unique call_site_id values.",
          "when": "The contract authoring command consumes the inventory and writes 13-client-data-contract.yaml.",
          "then": "The artifact contains exactly 105 unique entries and every inventory call_site_id appears exactly once.",
          "verify": "bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
          "test_tier": "integration",
          "verification_service": "bun-cli+yaml+inventory",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+yaml+inventory",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the authoring command disconnects from the inventory",
                "one mapping is silently omitted",
                "the YAML contains duplicate call_site_id values",
                "the generated contract is empty"
              ]
            },
            "evidence": {
              "artifact_type": "file_artifact",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "contract_inputs",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
                    "parse the emitted YAML entry list and compare IDs with the inventory"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "contract entry count=105",
                    "unique call_site_id count=105",
                    "inventory-to-contract difference count=0",
                    "YAML artifact size > 0 bytes"
                  ],
                  "must_not_observe": [
                    "entry count=0",
                    "duplicate call_site_id",
                    "orphaned inventory call site",
                    "empty YAML artifact"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-2",
          "num": 2,
          "name": "Required semantic contract fields",
          "given": "The contract contains 105 call-site entries.",
          "when": "The schema verifier checks every entry.",
          "then": "All 105 entries declare target, projection, response_error_shape, ordering_cursor, optimistic, conflict, rejection, offline, identifier, and e2e_criterion fields.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "test_tier": "integration",
          "verification_service": "bun-cli+yaml-schema",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+yaml-schema",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "required schema fields are omitted",
                "the verifier accepts an empty mapping",
                "a static field-count result replaces per-entry validation"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "contract_inputs",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run verify:client-contract --schema against the authored contract",
                    "capture the per-field and per-entry summary"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "schema entries checked=105",
                    "missing target fields=0",
                    "missing offline fields=0",
                    "missing optimistic fields=0",
                    "missing conflict fields=0",
                    "missing rejection fields=0",
                    "missing identifier fields=0"
                  ],
                  "must_not_observe": [
                    "schema entries checked=0",
                    "missing required field count > 0",
                    "empty verifier output",
                    "static pass without reading YAML"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-3",
          "num": 3,
          "name": "Live target resolution",
          "given": "The current zero_pub table lists, RN Zero schema, and Hono route implementation are available in the checkout.",
          "when": "The target verifier resolves each contract target.",
          "then": "All 105 targets resolve to a live published Zero table/query/mutator or Hono route and unresolved_target_count=0.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "test_tier": "integration",
          "verification_service": "bun-cli+zero-pub+hono",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+zero-pub+hono",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "a target is stale or disconnected from the live schema",
                "the verifier accepts an invented route",
                "zero_pub is replaced by an empty target registry"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "contract_inputs",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run verify:client-contract --targets",
                    "capture target resolution counts and unresolved target names"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "targets checked=105",
                    "resolved target count=105",
                    "unresolved_target_count=0",
                    "zero_pub or Hono target names in the report"
                  ],
                  "must_not_observe": [
                    "targets checked=0",
                    "unresolved target count > 0",
                    "invented target name",
                    "empty target registry"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-4",
          "num": 4,
          "name": "Offline and E2E semantics",
          "given": "Each entry has a declared operation class and linked E2E criterion.",
          "when": "The contract verifier runs its E2E-link and offline-behavior checks.",
          "then": "All 105 entries link a valid criterion, and the report proves declared airplane-mode reads, queued writes/reconnect, server rejection rollback, duplicate replay, and concurrent-edit behavior are represented.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "test_tier": "e2e",
          "verification_service": "bun-cli+contract-inventory",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "e2e",
            "verification_service": "bun-cli+contract-inventory",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "T-SYNC-019 is omitted from the contract",
                "offline policies are all blank or static",
                "duplicate replay and rejection rollback are not declared",
                "the verifier does not read the E2E criteria file"
              ]
            },
            "evidence": {
              "artifact_type": "api_response",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "contract_inputs",
                "action": {
                  "actor": "maestro_operator",
                  "steps": [
                    "run verify:client-contract --e2e-links",
                    "inspect the linked criterion and offline-behavior summary",
                    "exercise the seeded read, queue/reconnect, rejection, duplicate, and concurrent-edit cases through the real app/Zero boundary"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "E2E links checked=105",
                    "invalid e2e link count=0",
                    "T-SYNC-019 linked entry count=105 or an explicit valid criterion for each entry",
                    "offline behavior case count=5"
                  ],
                  "must_not_observe": [
                    "E2E links checked=0",
                    "invalid e2e link count > 0",
                    "airplane-mode policy missing",
                    "duplicate replay policy missing",
                    "server rejection rollback policy missing"
                  ]
                }
              }
            ]
          }
        }
      ],
      "test_criteria": [
        {
          "id": "TC-1",
          "num": 1,
          "statement": "Client data contract contains 105 unique mappings matching the inventory",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "happy_path"
        },
        {
          "id": "TC-2",
          "num": 2,
          "statement": "Every contract entry declares all required data-contract semantics",
          "maps_to_ac": "AC-2",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "schema"
        },
        {
          "id": "TC-3",
          "num": 3,
          "statement": "Every contract target resolves to a live Zero or Hono surface",
          "maps_to_ac": "AC-3",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "target_resolution"
        },
        {
          "id": "TC-4",
          "num": 4,
          "statement": "Every contract entry links a valid E2E criterion and declares offline behavior",
          "maps_to_ac": "AC-4",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "e2e_link"
        }
      ],
      "requirements": [
        {
          "id": "AC-1",
          "type": "acceptance_criterion",
          "description": "GIVEN a 105-row inventory WHEN the contract authoring command runs THEN exactly 105 unique mappings are written.",
          "verify": "bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
          "scenario": "AC-1"
        },
        {
          "id": "AC-2",
          "type": "acceptance_criterion",
          "description": "GIVEN 105 contract entries WHEN schema validation runs THEN all required semantic fields exist on every entry.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "scenario": "AC-2"
        },
        {
          "id": "AC-3",
          "type": "acceptance_criterion",
          "description": "GIVEN live zero_pub and Hono surfaces WHEN target resolution runs THEN all 105 targets resolve.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "scenario": "AC-3"
        },
        {
          "id": "AC-4",
          "type": "acceptance_criterion",
          "description": "GIVEN operation semantics and E2E criteria WHEN link/offline validation runs THEN all entries link valid criteria and represent five required offline/replay/conflict cases.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "scenario": "AC-4"
        },
        {
          "id": "TC-1",
          "type": "test_criterion",
          "description": "Client data contract contains 105 unique mappings matching the inventory.",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        },
        {
          "id": "TC-2",
          "type": "test_criterion",
          "description": "Every contract entry declares all required data-contract semantics.",
          "maps_to_ac": "AC-2",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        },
        {
          "id": "TC-3",
          "type": "test_criterion",
          "description": "Every contract target resolves to a live Zero or Hono surface.",
          "maps_to_ac": "AC-3",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        },
        {
          "id": "TC-4",
          "type": "test_criterion",
          "description": "Every contract entry links a valid E2E criterion and declares offline behavior.",
          "maps_to_ac": "AC-4",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        }
      ],
      "reading_list": [
        {
          "path": ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md",
          "lines": "17-26",
          "focus": "Required client-data-contract fields and inventory comparison rule"
        },
        {
          "path": ".spec/prds/mk6-migration/10-technical-requirements/04-api-design.md",
          "lines": "10-40",
          "focus": "Live Hono routes and Zero offline/mutator/authoritative-command semantics"
        },
        {
          "path": ".spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md",
          "lines": "8-38",
          "focus": "Current Convex call-site categories and client migration scope"
        },
        {
          "path": ".spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md",
          "lines": "73-94",
          "focus": "CAP-SYNC-01 and CAP-CUT-01 boundary contracts and real-service proof"
        },
        {
          "path": ".spec/prds/mk6-migration/11-e2e-testing-criteria.md",
          "lines": "191-198",
          "focus": "T-SYNC-004 and T-SYNC-019 pass/fail criteria"
        },
        {
          "path": "app/zero/schema.ts",
          "lines": "1-41",
          "focus": "Current published RN Zero schema and table columns"
        },
        {
          "path": "app/zero/queries.ts",
          "lines": "1-18",
          "focus": "Current Zero query builder and ordering convention"
        },
        {
          "path": "services/platform/src/db/schema/zero-pub.ts",
          "lines": "1-180",
          "focus": "Live zero_pub table and excluded-table declarations"
        },
        {
          "path": "services/platform/src/http/hono-app.ts",
          "lines": "85-390",
          "focus": "Live Hono routes, command responses, and error surfaces"
        },
        {
          "path": "/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py",
          "lines": "1-260",
          "focus": "Scenario contract validation"
        }
      ],
      "guardrails": {
        "write_allowed": [
          ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml (NEW)",
          ".tmp/client-contract/** (NEW verification artifacts)",
          "services/platform/src/cli/__tests__/client-data-contract-author.test.ts (NEW, only if needed for artifact validation)"
        ],
        "write_prohibited": [
          "app/** - full RN rewrite is Sprint 24",
          "components/** - full RN rewrite is Sprint 24",
          "hooks/** - full RN rewrite is Sprint 24",
          "screens/** - full RN rewrite is Sprint 24",
          "app/zero/schema.ts - schema expansion is outside this contract-authoring task",
          "services/platform/src/db/schema/zero-pub.ts - do not make stale targets appear live",
          "services/platform/src/http/hono-app.ts - route implementation belongs to service tasks",
          ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json - read-only input from S-CONTRACT-01"
        ]
      },
      "writeAllowed": [
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
        ".tmp/client-contract/**",
        "services/platform/src/cli/__tests__/client-data-contract-author.test.ts"
      ],
      "writeProhibited": [
        "app/**",
        "components/**",
        "hooks/**",
        "screens/**",
        "app/zero/schema.ts",
        "services/platform/src/db/schema/zero-pub.ts",
        "services/platform/src/http/hono-app.ts",
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
      ],
      "design": {
        "references": [
          ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md",
          ".spec/prds/mk6-migration/10-technical-requirements/04-api-design.md"
        ],
        "interaction_notes": [
          "The contract is an approval artifact consumed by the verifier and Sprint 24 rewrite tasks.",
          "Target names must be derived from zero_pub and Hono route registries, not handwritten guesses."
        ],
        "pattern": "Represent each operation as a discriminated target with a normalized projection and explicit offline/optimistic/conflict/rejection/identifier fields; preserve legacy IDs through explicit aliases only.",
        "pattern_source": "app/zero/queries.ts:4-15",
        "anti_pattern": "Do not create one generic catch-all mapping, omit semantic fields, or point every action at a fake Zero mutator."
      },
      "verification_gates": [
        {
          "gate": "Author contract",
          "command": "bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
          "expected": "Exit 0; artifact contains 105 entries."
        },
        {
          "gate": "Schema completeness",
          "command": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "expected": "Exit 0; all required field omission counts are 0."
        },
        {
          "gate": "Target resolution",
          "command": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "expected": "Exit 0; resolved target count=105 and unresolved_target_count=0."
        },
        {
          "gate": "E2E links and offline semantics",
          "command": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "expected": "Exit 0; invalid E2E link count=0 and all five offline/replay/conflict behaviors represented."
        },
        {
          "gate": "Scenario validation",
          "command": "python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-02-scenarios.json",
          "expected": "Exit 0 with zero CRITICAL or HIGH violations."
        },
        {
          "gate": "YAML and type quality",
          "command": "pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/cli/__tests__/client-data-contract-author.test.ts",
          "expected": "Both commands exit 0."
        }
      ],
      "coding_standards": [
        "RULES.md#react--react-native-rules",
        "/Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md",
        "/Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md",
        "/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md"
      ],
      "dependencies": {
        "depends_on": [
          "S-CONTRACT-01",
          "Sprint 04",
          "Sprint 05",
          "Sprint 18"
        ],
        "blocks": [
          "S-CONTRACT-03",
          "Sprint 24"
        ]
      }
    },
    {
      "task_id": "S-CONTRACT-03",
      "title": "CI contract-inventory gate: `holo verify:client-contract`",
      "task_type": "FEATURE",
      "tdd_mode": "red_first",
      "verification_policy": {
        "requires_tests": true,
        "requires_red_evidence": true,
        "requires_seeded_evidence": true
      },
      "status": "Backlog",
      "priority": "P0",
      "effort": "M",
      "estimate_minutes": 120,
      "agent": "red-test-generator",
      "agent_rationale": "Owns fail-closed RED tests and CI gate behavior, including proving that deleted mappings, stale targets, malformed schema fields, and stale inventories cannot pass.",
      "reviewer": "mastra-reviewer",
      "reviewer_rationale": "Verifies the platform CLI gate reads real inventory/YAML/schema surfaces, exits correctly, and is wired into CI without a fake or mock-only proof.",
      "sprint_id": "sprint-21-client-data-contract",
      "proposed_by": "react-native-ui-planner",
      "prd_refs": [
        "UC-SYNC-01",
        "T-SYNC-019",
        "T-SYNC-004"
      ],
      "background": "The Sprint 21 human gate requires an operator command that compares the legacy inventory to 13-client-data-contract.yaml, resolves targets against zero_pub/Hono, validates required semantics, and links every entry to E2E criteria. The current services/platform/src/cli/holo.ts help and dispatcher do not yet expose verify:client-contract or inventory:convex-callsites.",
      "outcome": "Implement the fail-closed client-contract verifier, its RED/GREEN test suite, and the CI invocation.",
      "specification": {
        "objective": "Add holo verify:client-contract and wire its full gate into CI so every missing, duplicate, stale, malformed, or unmapped call site fails closed.",
        "success_state": "A valid 105-entry contract exits 0 and reports 105/105 mapped; deleting one mapping, changing one target, removing one required field, or using a stale inventory exits nonzero and names the offending record."
      },
      "primary_test_tier": "integration",
      "touches_capabilities": [
        "CAP-SYNC-01",
        "CAP-CUT-01"
      ],
      "provides": [
        "verify:client-contract CLI gate",
        "contract-inventory RED tests",
        "ci-fast contract gate"
      ],
      "consumes": [
        "13-client-callsite-inventory.json",
        "13-client-data-contract.yaml",
        "services/platform/src/db/schema/zero-pub.ts",
        "app/zero/schema.ts",
        "services/platform/src/http/hono-app.ts",
        "11-e2e-testing-criteria.md"
      ],
      "boundary_contracts": [
        "inventory and contract set equality",
        "contract target to live Zero/Hono surface",
        "contract schema to required semantic fields",
        "contract entry to T-SYNC criterion",
        "CLI exit status to CI pass/fail"
      ],
      "critical_constraints": {
        "must": [
          "MUST run against real repository artifacts and live source registries; tests must not mock YAML parsing, filesystem reads, Zero schema, Hono routes, or process exit.",
          "MUST fail closed with nonzero exit and an actionable call_site_id/path for an orphaned mapping, duplicate mapping, stale target, missing required field, or stale inventory.",
          "MUST provide the default gate plus --targets, --schema, and --e2e-links modes and report machine-readable JSON when --json is supplied."
        ],
        "never": [
          "NEVER treat a missing contract, empty inventory, malformed YAML, or unresolved target as a warning-only condition.",
          "NEVER use a hardcoded 105/105 success path or a static fixture that bypasses the actual artifacts.",
          "NEVER wire a CI step that ignores the command exit code or permits missing nonproduction contract files."
        ],
        "strictly": [
          "STRICTLY preserve the roadmap command spelling verify:client-contract and the inventory command spelling inventory:convex-callsites.",
          "STRICTLY keep negative controls in the test suite for deleted mappings, stale targets, missing fields, and stale inventory.",
          "STRICTLY run the gate before the general unit lane in CI so contract drift is visible as a dedicated failure."
        ]
      },
      "fixtures": {
        "valid_contract": {
          "description": "A real 105-entry inventory and matching 13-client-data-contract.yaml generated from the checked-out repository.",
          "seed_method": "cli",
          "records": [
            ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
            ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
            "services/platform/src/db/schema/zero-pub.ts",
            "services/platform/src/http/hono-app.ts",
            "T-SYNC-004",
            "T-SYNC-019"
          ]
        }
      },
      "acceptance_criteria": [
        {
          "id": "AC-1",
          "num": 1,
          "name": "Valid contract passes",
          "given": "The checked-out repository contains a valid 105-row inventory and matching complete contract.",
          "when": "An operator runs holo verify:client-contract.",
          "then": "The command exits 0 and reports 105/105 call sites mapped with zero errors.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "test_tier": "integration",
          "verification_service": "bun-cli+filesystem+live-source",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+filesystem+live-source",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the verifier disconnects from the contract artifact",
                "the verifier returns a static 105/105 result",
                "the valid contract is treated as empty",
                "the CLI is a no-op stub"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "valid_contract",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
                    "capture stdout and the process exit code"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "exit code 0",
                    "mapped call sites=105/105",
                    "error count=0",
                    "JSON field ok=true"
                  ],
                  "must_not_observe": [
                    "exit code 1",
                    "mapped call sites=0/105",
                    "missing contract artifact",
                    "no-op or static output"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-2",
          "num": 2,
          "name": "Verification modes cover targets schema and E2E links",
          "given": "The valid contract references the current Zero and Hono surfaces and T-SYNC criteria.",
          "when": "The operator runs --targets, --schema, and --e2e-links modes.",
          "then": "Each mode exits 0 and reports 105 checked entries with zero failures in its respective dimension.",
          "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done",
          "test_tier": "integration",
          "verification_service": "bun-cli+zero-pub+hono+prd",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+zero-pub+hono+prd",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "one verification mode is disconnected from the contract",
                "the target registry is empty",
                "the schema verifier accepts missing fields",
                "the E2E criteria file is omitted"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "valid_contract",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "run verify:client-contract --targets",
                    "run verify:client-contract --schema",
                    "run verify:client-contract --e2e-links",
                    "capture each JSON report"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "mode count=3",
                    "targets checked=105",
                    "schema entries checked=105",
                    "E2E links checked=105",
                    "failure count=0 in all 3 reports"
                  ],
                  "must_not_observe": [
                    "mode count=0",
                    "targets checked=0",
                    "schema entries checked=0",
                    "E2E links checked=0",
                    "empty target registry"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-3",
          "num": 3,
          "name": "Deleted mapping fails closed",
          "given": "A temporary copy of the valid contract has one of its 105 mappings removed.",
          "when": "The verifier runs against the modified contract and the unchanged inventory.",
          "then": "The command exits nonzero and identifies the orphaned call_site_id and source path.",
          "verify": "rm -rf .tmp/client-contract/negative && mkdir -p .tmp/client-contract/negative && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/deleted.yaml && python3 -c \"from pathlib import Path; p=Path('.tmp/client-contract/negative/deleted.yaml'); s=p.read_text(); p.write_text(s.replace('call_site_id: site-001', 'call_site_id: deleted-site-001', 1))\" && ! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "test_tier": "integration",
          "verification_service": "bun-cli+negative-fixture",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+negative-fixture",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "a deleted mapping is ignored",
                "the verifier returns a static success",
                "the orphaned call site is not reported",
                "the negative fixture is empty"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "valid_contract",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "copy the valid contract to a temporary negative fixture",
                    "delete one mapping from the temporary fixture",
                    "run verify:client-contract against the unchanged inventory"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "exit code=1",
                    "orphaned call_site_id reported",
                    "source path reported",
                    "error category=unmapped_call_site"
                  ],
                  "must_not_observe": [
                    "exit code 0",
                    "mapped call sites=105/105",
                    "empty diagnostic output",
                    "false green result"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-4",
          "num": 4,
          "name": "Malformed schema and stale target fail closed",
          "given": "Temporary copies of the valid contract are modified once with a missing required field and once with a stale target.",
          "when": "The operator runs --schema and --targets against the modified artifacts.",
          "then": "Both commands exit nonzero and identify the entry and specific failure category.",
          "verify": "rm -rf .tmp/client-contract/negative/schema.yaml .tmp/client-contract/negative/target.yaml && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/schema.yaml && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/target.yaml && python3 -c \"from pathlib import Path; p=Path('.tmp/client-contract/negative/schema.yaml'); s=p.read_text(); p.write_text(s.replace('offline:', 'offline_removed:', 1)); p=Path('.tmp/client-contract/negative/target.yaml'); s=p.read_text(); p.write_text(s.replace('target_name: conversations', 'target_name: stale_target', 1))\" && ! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json && ! bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .tmp/client-contract/negative/target.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "test_tier": "integration",
          "verification_service": "bun-cli+negative-fixtures+zero-pub",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "bun-cli+negative-fixtures+zero-pub",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "missing schema fields are accepted",
                "stale targets are accepted",
                "the verifier uses a static target list",
                "negative fixture files are empty"
              ]
            },
            "evidence": {
              "artifact_type": "stdout",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "valid_contract",
                "action": {
                  "actor": "cli_user",
                  "steps": [
                    "create one contract copy with the offline field removed",
                    "create one contract copy with a stale target name",
                    "run --schema on the first copy and --targets on the second copy"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "schema exit code=1",
                    "targets exit code=1",
                    "missing field diagnostic count=1",
                    "unresolved target diagnostic count=1"
                  ],
                  "must_not_observe": [
                    "schema exit code=0",
                    "targets exit code=0",
                    "stale_target reported as resolved",
                    "empty diagnostics"
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "AC-5",
          "num": 5,
          "name": "CI wiring",
          "given": "The repository's fast CI workflow runs quality gates on push and pull request.",
          "when": "The client contract gate is added to the workflow and the workflow command is executed locally.",
          "then": "ci-fast.yml contains the exact fail-closed command and the command exits 0 against the valid contract.",
          "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml && bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "test_tier": "integration",
          "verification_service": "github-actions+ bun-cli",
          "unit_test_justified": null,
          "scenario": {
            "tier": "visible",
            "test_tier": "integration",
            "verification_service": "github-actions+ bun-cli",
            "topology": "single-node",
            "negative_control": {
              "would_fail_if": [
                "the CI workflow omits the contract command",
                "the workflow ignores a nonzero verifier exit",
                "the valid contract artifact is empty",
                "the CI step is a static echo"
              ]
            },
            "evidence": {
              "artifact_type": "file_artifact",
              "required_capture": true
            },
            "cases": [
              {
                "start_ref": "valid_contract",
                "action": {
                  "actor": "ci_user",
                  "steps": [
                    "read .github/workflows/ci-fast.yml for the exact contract command",
                    "run the same command locally against the valid artifacts",
                    "capture the command exit status"
                  ]
                },
                "end_state": {
                  "must_observe": [
                    "workflow command occurrence count=1",
                    "local verifier exit code=0",
                    "mapped call sites=105/105",
                    "CI step uses fail-closed shell semantics"
                  ],
                  "must_not_observe": [
                    "workflow command occurrence count=0",
                    "local verifier exit code=1",
                    "echo-only CI step",
                    "ignored verifier failure"
                  ]
                }
              }
            ]
          }
        }
      ],
      "test_criteria": [
        {
          "id": "TC-1",
          "num": 1,
          "statement": "Valid 105-entry contract exits 0 with 105/105 mappings",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "type": "happy_path"
        },
        {
          "id": "TC-2",
          "num": 2,
          "statement": "Targets schema and E2E-link modes each check 105 entries with zero failures",
          "maps_to_ac": "AC-2",
          "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done",
          "type": "mode_matrix"
        },
        {
          "id": "TC-3",
          "num": 3,
          "statement": "Deleted contract mapping exits nonzero and reports the orphaned call site",
          "maps_to_ac": "AC-3",
          "verify": "test -f .tmp/client-contract/negative/deleted.yaml && ! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "negative_control"
        },
        {
          "id": "TC-4",
          "num": 4,
          "statement": "Missing required field and stale target each exit nonzero with diagnostic categories",
          "maps_to_ac": "AC-4",
          "verify": "test -f .tmp/client-contract/negative/schema.yaml && test -f .tmp/client-contract/negative/target.yaml && ! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "type": "negative_control"
        },
        {
          "id": "TC-5",
          "num": 5,
          "statement": "ci-fast.yml invokes the client contract verifier and preserves its exit status",
          "maps_to_ac": "AC-5",
          "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml",
          "type": "ci_wiring"
        }
      ],
      "requirements": [
        {
          "id": "AC-1",
          "type": "acceptance_criterion",
          "description": "GIVEN valid 105-row inventory and contract WHEN the default verifier runs THEN it exits 0 with 105/105 mapped and zero errors.",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "scenario": "AC-1"
        },
        {
          "id": "AC-2",
          "type": "acceptance_criterion",
          "description": "GIVEN valid contract and live surfaces WHEN all verifier modes run THEN targets, schema, and E2E links each pass for 105 entries.",
          "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done",
          "scenario": "AC-2"
        },
        {
          "id": "AC-3",
          "type": "acceptance_criterion",
          "description": "GIVEN one mapping is deleted WHEN verification runs THEN it exits nonzero and names the orphaned call site.",
          "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "scenario": "AC-3"
        },
        {
          "id": "AC-4",
          "type": "acceptance_criterion",
          "description": "GIVEN one missing required field and one stale target WHEN schema and target modes run THEN both fail with diagnostics.",
          "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
          "scenario": "AC-4"
        },
        {
          "id": "AC-5",
          "type": "acceptance_criterion",
          "description": "GIVEN ci-fast.yml is the push and pull-request fast lane WHEN the workflow is inspected and command is run THEN the verifier is wired fail-closed.",
          "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml",
          "scenario": "AC-5"
        },
        {
          "id": "TC-1",
          "type": "test_criterion",
          "description": "Valid 105-entry contract exits 0 with 105/105 mappings.",
          "maps_to_ac": "AC-1",
          "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json"
        },
        {
          "id": "TC-2",
          "type": "test_criterion",
          "description": "Targets schema and E2E-link modes each check 105 entries with zero failures.",
          "maps_to_ac": "AC-2",
          "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done"
        },
        {
          "id": "TC-3",
          "type": "test_criterion",
          "description": "Deleted contract mapping exits nonzero and reports the orphaned call site.",
          "maps_to_ac": "AC-3",
          "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        },
        {
          "id": "TC-4",
          "type": "test_criterion",
          "description": "Missing required field and stale target each exit nonzero with diagnostic categories.",
          "maps_to_ac": "AC-4",
          "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
        },
        {
          "id": "TC-5",
          "type": "test_criterion",
          "description": "ci-fast.yml invokes the client contract verifier and preserves its exit status.",
          "maps_to_ac": "AC-5",
          "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml"
        }
      ],
      "reading_list": [
        {
          "path": ".spec/prds/mk6-migration/ROADMAP.md",
          "lines": "1202-1212",
          "focus": "Human gate commands and required negative controls"
        },
        {
          "path": ".spec/prds/mk6-migration/11-e2e-testing-criteria.md",
          "lines": "191-198",
          "focus": "T-SYNC-004 and T-SYNC-019 pass/fail assertions"
        },
        {
          "path": "services/platform/src/cli/holo.ts",
          "lines": "1-150,684-700,3914-3964",
          "focus": "CLI help, argument parsing, dispatch conventions, and CI/status command patterns"
        },
        {
          "path": "services/platform/src/db/schema/zero-pub.ts",
          "lines": "1-180",
          "focus": "Live published and excluded relation registries"
        },
        {
          "path": "app/zero/schema.ts",
          "lines": "1-41",
          "focus": "RN Zero schema boundary"
        },
        {
          "path": "services/platform/src/http/hono-app.ts",
          "lines": "85-390",
          "focus": "Hono route surface and structured error behavior"
        },
        {
          "path": ".github/workflows/ci-fast.yml",
          "lines": "1-83",
          "focus": "Fast CI lane and fail-closed shell conventions"
        },
        {
          "path": "services/platform/src/cli/__tests__/prd-consistency.test.ts",
          "lines": "1-160",
          "focus": "Existing CLI test style and real filesystem assertions"
        },
        {
          "path": "/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py",
          "lines": "1-260",
          "focus": "Scenario validation and negative-control requirements"
        }
      ],
      "guardrails": {
        "write_allowed": [
          "services/platform/src/cli/holo.ts (MODIFY)",
          "services/platform/src/sync/client-contract.ts (NEW)",
          "services/platform/src/cli/__tests__/client-contract.test.ts (NEW)",
          "services/platform/tests/integration/client-contract.test.ts (NEW)",
          ".github/workflows/ci-fast.yml (MODIFY)",
          ".tmp/client-contract/** (NEW test artifacts)"
        ],
        "write_prohibited": [
          "app/** - rewrite is Sprint 24",
          "components/** - rewrite is Sprint 24",
          "hooks/** - rewrite is Sprint 24",
          "screens/** - rewrite is Sprint 24",
          "app/zero/schema.ts - do not expand the published client schema in the gate task",
          "services/platform/src/http/hono-app.ts - do not implement unrelated Hono routes",
          ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml - read-only input after S-CONTRACT-02"
        ]
      },
      "writeAllowed": [
        "services/platform/src/cli/holo.ts",
        "services/platform/src/sync/client-contract.ts",
        "services/platform/src/cli/__tests__/client-contract.test.ts",
        "services/platform/tests/integration/client-contract.test.ts",
        ".github/workflows/ci-fast.yml",
        ".tmp/client-contract/**"
      ],
      "writeProhibited": [
        "app/**",
        "components/**",
        "hooks/**",
        "screens/**",
        "app/zero/schema.ts",
        "services/platform/src/http/hono-app.ts",
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml"
      ],
      "design": {
        "references": [
          ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md",
          ".github/workflows/ci-fast.yml"
        ],
        "interaction_notes": [
          "The CLI library must expose one shared report model for default, targets, schema, and E2E-link modes.",
          "Negative controls must exercise the same command entrypoint and real artifact parser used in CI."
        ],
        "pattern": "Parse inventory and YAML, build indexed sets, validate semantic fields and target registries, print stable text/JSON diagnostics, and return exit 0 only when every selected dimension passes.",
        "pattern_source": "services/platform/src/cli/holo.ts:1493-1510",
        "anti_pattern": "Do not implement a grep-only gate, swallow errors, skip malformed entries, or let CI pass when the verifier exits nonzero."
      },
      "verification_gates": [
        {
          "gate": "RED then GREEN CLI tests",
          "command": "pnpm vitest run services/platform/src/cli/__tests__/client-contract.test.ts",
          "expected": "RED before implementation and Exit 0 after implementation, including valid and negative fixtures."
        },
        {
          "gate": "Valid default gate",
          "command": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
          "expected": "Exit 0; mapped call sites=105/105."
        },
        {
          "gate": "Negative controls",
          "command": "pnpm vitest run services/platform/src/cli/__tests__/client-contract.test.ts services/platform/tests/integration/client-contract.test.ts",
          "expected": "Exit 0; deleted mapping, stale target, missing field, and stale inventory cases all assert nonzero verifier status."
        },
        {
          "gate": "CI wiring",
          "command": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml",
          "expected": "Exit 0; workflow invokes the gate and does not ignore its status."
        },
        {
          "gate": "Scenario validation",
          "command": "python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-03-scenarios.json",
          "expected": "Exit 0 with zero CRITICAL or HIGH violations."
        },
        {
          "gate": "Project quality",
          "command": "pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/sync/client-contract.ts services/platform/src/cli/__tests__/client-contract.test.ts services/platform/tests/integration/client-contract.test.ts",
          "expected": "Both commands exit 0."
        }
      ],
      "coding_standards": [
        "RULES.md#pre-commit-hooks",
        "RULES.md#react--react-native-rules",
        "/Users/inference1/Projects/brain/docs/RED-FIRST-TEST-GATE.md",
        "/Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md",
        "/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md"
      ],
      "dependencies": {
        "depends_on": [
          "S-CONTRACT-01",
          "S-CONTRACT-02",
          "Sprint 04",
          "Sprint 05",
          "Sprint 18"
        ],
        "blocks": [
          "Sprint 24"
        ]
      }
    }
  ]
}
```