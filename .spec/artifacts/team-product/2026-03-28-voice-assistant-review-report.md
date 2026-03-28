# Product Team Report: Voice Assistant PRD Gap Analysis

**Date**: 2026-03-28
**Team**: product-manager, convex-planner, frontend-designer

---

## Objective
Review the voice-assistant PRD against current Holocron codebase to identify gaps, stale assumptions, and required plan updates before implementation begins.

## Deliverables

### 1. Product Gap Analysis
**Author**: product-manager
**File**: .spec/artifacts/team-product/product-gap-analysis.md
Overall implementation readiness is ~8%. The PRD was written in an aspirational greenfield context; reality shows zero voice infrastructure exists. Key recommendations: drop WebRTC for WebSocket-only transport, demote OpenAI Realtime API to P2, use Deepgram STT as primary, defer wake word detection entirely.

### 2. Convex Backend Gap Report
**Author**: convex-planner
**File**: .spec/artifacts/team-product/convex-backend-gap-report.md
Found 5 critical schema errors that would break deployment (including `v.id("users")` referencing a nonexistent table), plus a fundamental architecture flaw: real-time voice state must NOT be stored in Convex. Provided corrected schema, migration path, and reusable code inventory.

### 3. Frontend UI Gap Report
**Author**: frontend-designer
**File**: .spec/artifacts/team-product/frontend-ui-gap-report.md
Mapped all 6 proposed voice components against existing codebase. 4 have reusable analogs (VoiceOverlay, MicButton, ListeningIndicator, ProcessingSpinner), 2 are net-new (WaveformDisplay, StatusAnnouncer). Provided component architecture and hook hierarchy.

---

## Cross-Team Insights

All three agents independently converged on these findings:

1. **WebRTC must be dropped** — Product flagged it as high-risk, Convex confirmed it has no implementation path in Convex's serverless model, and Frontend noted it requires an uninstalled native module. WebSocket-only is the unanimous recommendation.

2. **Voice state machine must be client-side** — Both Convex and Frontend independently identified that `useReducer` (matching the existing `useNarrationState` pattern) is the correct architecture. Storing ephemeral state in Convex violates latency targets.

3. **ElevenLabs is the biggest reuse asset** — Already installed, configured, and working for narration. Product and Convex both identified that extending `convex/audio/actions.ts` with a `synthesizeForVoice` action (streaming variant) is the fastest path to TTS.

4. **The `context` array in voiceSessions is wrong** — Convex identified it duplicates `chatMessages` with inferior ergonomics. Product identified it creates a 1MB document cap risk. Both recommend using `conversationId` FK instead.

5. **Narration components provide animation primitives, not direct reuse** — Frontend found that `NarrationControlBar` itself is not reusable, but the underlying patterns (spring animations, haptics, SpinnerRing, audio session config) are directly portable.

---

## Critical PRD Updates Required

### Schema Fixes (Must Fix Before Any Implementation)
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `v.id("users")` — no users table exists | CRITICAL | Replace with `conversationId: v.optional(v.id("conversations"))` |
| 2 | `voiceSessions.state` stored in DB | CRITICAL | Remove — keep in client `useReducer` |
| 3 | `audioUrl` in context turns | CRITICAL | Remove — Convex URLs expire |
| 4 | `turnId: v.number()` cross-table join | CRITICAL | Use `commandId: v.id("voiceCommands")` |
| 5 | `context` array duplicates `chatMessages` | HIGH | Replace with `conversationId` FK |
| 6 | Missing `returns` validators | HIGH | Add to all endpoints |
| 7 | `v.any()` for actionParams/result | MEDIUM | Type properly |
| 8 | `timestamp` instead of `createdAt` | MEDIUM | Rename to match convention |

### Architecture Fixes (Must Fix Before Any Implementation)
| # | Issue | Fix |
|---|-------|-----|
| 1 | WebRTC as primary transport | Replace with WebSocket to Deepgram + HTTP streaming to ElevenLabs |
| 2 | Audio flowing through Convex | Convex is NOT in the audio data path — client connects directly to STT/TTS services |
| 3 | OpenAI Realtime API as primary stack | Demote to P2 — use Deepgram STT + ElevenLabs TTS as primary |
| 4 | On-device VAD (Silero) | Use Deepgram server-side VAD for V1 |

### Scope Reductions (Required to Hit 6-Week Appetite)
| Cut | Savings | Risk |
|-----|---------|------|
| Drop WebRTC entirely | ~30% build complexity | None — WebSocket achieves same latency targets |
| Defer wake word to Phase 2 | ~2 weeks of native module work | Users activate via tap only |
| Use Deepgram server VAD instead of on-device | ~1 week | Slightly higher latency for speech-end detection |
| Defer voiceAnalytics table to P1 | ~3 days | No per-turn metrics until Phase 2 |
| Drop noise suppression | ~1 week | Rely on Deepgram's built-in noise handling |

### Priority Reassignment
| Item | PRD Priority | New Priority | Reason |
|------|-------------|-------------|--------|
| OpenAI Realtime API | P0 (primary) | P2 | Beta, no SDK, WebRTC dependency |
| Deepgram STT (WebSocket) | P1 (fallback) | P0 | Most viable STT path |
| Wake word detection | P1 | P2 | Requires native ML model |
| On-device VAD (Silero) | P0 | P1 | Use Deepgram server VAD for V1 |
| Context persistence | P1 | P0 | Essential for multi-turn |
| Session analytics | P1 | P2 | Defer until core works |
| Noise suppression | P1 | P2 | Complex native work |

---

## Recommended Implementation Sequence

| Week | Focus | Key Deliverables |
|------|-------|-----------------|
| 1 | **Audio Capture Spike** | Validate mic→PCM→Deepgram WebSocket STT + ElevenLabs streaming TTS. Gate: end-to-end working before building anything else |
| 2 | **Session Backbone** | Add corrected schema tables, build `useVoiceSessionState` reducer, `useAudioCapture` hook, basic `STTProcessor` |
| 3 | **TTS + Interruption** | `TTSStreamer` with ElevenLabs streaming, barge-in (server VAD → TTS stop), full state cycle |
| 4 | **Query Bridge** | Intent classification via existing agent infrastructure, progress narration, result formatting |
| 5 | **Error Recovery + UI** | Network retry, recognition re-prompt, VoiceOverlay with MicButton/indicators |
| 6 | **QA + Hardening** | Latency measurement, device testing, edge cases |

---

## Recommended Next Steps

1. **Update the PRD** with all schema fixes and architecture corrections — Owner: user
2. **Run `/kb-project-plan`** to generate implementation task files from the updated PRD — Owner: user
3. **Week 1 spike** should be a standalone proof-of-concept before committing to full build — Owner: engineering
