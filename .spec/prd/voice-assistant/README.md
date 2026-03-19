# Voice Assistant PRD

**Product**: Holocron Voice Assistant
**Version**: 1.0
**Created**: 2026-03-18
**Appetite**: 6 weeks (Full)
**Status**: Draft

## Document Index

| File | Description |
|------|-------------|
| [00-overview.md](./00-overview.md) | Product vision and description |
| [01-scope.md](./01-scope.md) | Appetite, in-scope, out-of-scope |
| [02-roles.md](./02-roles.md) | User personas and roles |
| [03-functional-groups.md](./03-functional-groups.md) | Functional group definitions |
| [UC-VSESS.md](./UC-VSESS.md) | Voice Session Management use cases |
| [UC-AUDIO.md](./UC-AUDIO.md) | Audio Capture & Playback use cases |
| [UC-SPEECH.md](./UC-SPEECH.md) | Speech Processing use cases |
| [UC-QUERY.md](./UC-QUERY.md) | Query & Action Execution use cases |
| [UC-ERREC.md](./UC-ERREC.md) | Error Recovery use cases |
| [team-contributions.md](./team-contributions.md) | Team phase outputs |
| [technical-requirements.md](./technical-requirements.md) | Architecture and technical specs |

## Research Reference

Holocron document: `js7ecpzbs9bqe0k11837j6y` - Voice Assistant Implementation Guide

## Key Decisions

- **UX Paradigm**: Hands-Free Continuous - voice stays active like a co-pilot
- **Wait Behavior**: Audio Feedback Loop - progress narration, interruptible
- **Primary Stack**: OpenAI Realtime API + ElevenLabs TTS + Deepgram STT
- **Fallback Stack**: Pipecat framework for modular pipeline control
