# 02 - Session Configuration

## Session Update Event

Sent via data channel after connection established:

```json
{
  "type": "session.update",
  "session": {
    "model": "gpt-realtime",
    "modalities": ["text", "audio"],
    "voice": "cedar",
    "instructions": "You are the Holocron voice assistant. You help users search their knowledge base, manage tasks, check on research, and navigate the app. Before calling any function tool, briefly announce what you're about to do. When a function call is pending and the user asks about it, say you're still waiting on the result.",
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 500,
      "idle_timeout_ms": 30000
    },
    "tools": [],
    "tool_choice": "auto",
    "truncation": { "type": "retention_ratio", "retention_ratio": 0.8 },
    "input_audio_transcription": { "model": "gpt-4o-transcribe" }
  }
}
```

## VAD Options

### server_vad (V1 Default)

```json
{
  "type": "server_vad",
  "threshold": 0.5,
  "prefix_padding_ms": 300,
  "silence_duration_ms": 500,
  "idle_timeout_ms": 30000,
  "create_response": true,
  "interrupt_response": true
}
```

- `threshold`: 0.0–1.0 (default 0.5). Higher = requires louder audio.
- `prefix_padding_ms`: Audio captured before speech detected (default 300ms)
- `silence_duration_ms`: Silence before end of turn (default 500ms)
- `idle_timeout_ms`: Triggers "Are you still there?" after silence (NEW)

### semantic_vad (P1 Upgrade)

```json
{
  "type": "semantic_vad",
  "eagerness": "medium",
  "create_response": true,
  "interrupt_response": true
}
```

- `eagerness`: `"low"` | `"medium"` | `"high"` | `"auto"`
- Chunks audio based on meaning, not just silence
- `"low"` = lets user take their time; `"high"` = faster response

### Disable VAD (Push-to-Talk)

```json
{ "turn_detection": null }
```

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

## Context Truncation

When conversation exceeds the 32K token limit, OpenAI auto-truncates oldest messages. Configure with `retention_ratio`:

```json
{
  "truncation": {
    "type": "retention_ratio",
    "retention_ratio": 0.8
  }
}
```

This truncates 20% of context at once (rather than trimming a little each time), which is more cache-friendly and reduces cost.
