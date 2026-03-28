# 07 - Testing Strategy

## Unit Tests

- Voice session state machine transitions (`useVoiceSessionState` reducer)
- Data channel event parsing (all `response.*` event types)
- Function call dispatch and result formatting
- Ephemeral token generation (Convex action)
- Tool argument parsing and validation

## Integration Tests

- WebRTC connection establishment (RTCPeerConnection lifecycle)
- Data channel message round-trip
- Convex mutation/query flows for all voice endpoints
- Function call → Convex query → result → `conversation.item.create` flow
- Session timeout cron behavior

## E2E Tests

- Full conversation flow (tap → speak → response → end)
- Function calling (search knowledge, create note, navigate)
- Agent dispatcher with polling (start research, check status)
- Error recovery (network failure, service unavailable)
- Session timeout handling (orphaned sessions cleaned up)
- Interruption / barge-in behavior

## Performance Tests

- End-to-end latency measurement (speech end → response audio start)
- WebRTC connection time (tap → listening state)
- Function call round-trip time (function_call event → response audio)
- Concurrent session prevention (getActiveSession query)
