# 06 - Performance, Cost & Security

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| End-to-End Latency | <800ms | Single-service speech-to-speech |
| Interruption Response | <100ms | OpenAI server-side VAD handles this |
| Activation Latency | <500ms | Tap to listening state |
| WebRTC Connection | <2s | SDP offer/answer + ICE |

## Cost Estimate

| Component | Cost |
|-----------|------|
| Audio input | $0.06/min ($0.04/min cached) |
| Audio output | $0.24/min |
| Text input | $5.00/1M tokens ($2.50 cached) |
| Text output | $20.00/1M tokens |
| **10-minute session** | **~$3.00** |

## Session Limits

| Limit | Value |
|-------|-------|
| Max session duration | 60 minutes |
| Token context window | 32,768 tokens |
| Max response tokens | 4,096 tokens |
| Max input tokens | 28,672 tokens |
| Instructions + tools max | 16,384 tokens |
| Ephemeral token lifetime | ~60 seconds |
| Audio format | PCM 24kHz |
| Speed range | 0.25–1.5 (default 1.0) |

## Security Considerations

### API Keys

- OpenAI API key stored in Convex environment variables (never on client)
- Client receives only ephemeral tokens (~60s lifetime)
- Ephemeral tokens generated per-session via Convex action

### Audio Data

- Audio NOT stored beyond session (WebRTC streams are ephemeral)
- Transcripts persisted to chatMessages if user opts in
- Session context cleared by OpenAI after session ends

### Permissions

- Microphone: Required, prompt on first use
- Background Audio: Optional, enhances experience
