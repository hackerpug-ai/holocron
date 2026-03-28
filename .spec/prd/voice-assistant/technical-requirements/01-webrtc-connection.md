# 01 - WebRTC Connection

## Ephemeral Token Generation

Client NEVER holds the OpenAI API key. A Convex action generates a short-lived token:

```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer ${OPENAI_API_KEY}
Content-Type: application/json

{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "audio": { "output": { "voice": "cedar" } }
  }
}

→ Response: { "value": "ek_abc123", "expires_at": 1234567890 }
```

- Token prefix: `ek_`
- Lifetime: ~60 seconds — client must connect immediately
- **Note**: `/v1/realtime/sessions` is deprecated. Use `/v1/realtime/client_secrets`.

## Connection Flow

```
1. Client calls Convex action: voice.createSession
   → Convex POSTs to https://api.openai.com/v1/realtime/client_secrets
   → Returns ephemeral key (expires in ~60s)

2. Client creates RTCPeerConnection
   const pc = new RTCPeerConnection();

3. Client gets mic
   const ms = await mediaDevices.getUserMedia({ audio: true });
   pc.addTrack(ms.getTracks()[0]);

4. Client handles remote audio
   pc.addEventListener('track', (e) => remoteStream.addTrack(e.track));

5. Client creates data channel
   const dc = pc.createDataChannel('oai-events');  // name MUST be 'oai-events'

6. SDP offer/answer exchange
   const offer = await pc.createOffer();
   await pc.setLocalDescription(offer);

   const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
     method: 'POST',
     body: offer.sdp,
     headers: {
       Authorization: `Bearer ${EPHEMERAL_KEY}`,
       'Content-Type': 'application/sdp',
     },
   });

   await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });

7. Audio flows via WebRTC, events via data channel
```

## Audio Setup (React Native)

```typescript
import { mediaDevices, RTCPeerConnection, MediaStream } from 'react-native-webrtc-web-shim';
import InCallManager from 'react-native-incall-manager';
import { Audio } from 'expo-av';

// Enable audio in silent mode
await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

// Force speaker output
InCallManager.start({ media: 'audio' });
InCallManager.setForceSpeakerphoneOn(true);
```

## Data Channel Events

All communication happens over the `oai-events` data channel as JSON:

```typescript
// SENDING events to OpenAI
dc.send(JSON.stringify({ type: 'session.update', session: { /* config */ } }));

// RECEIVING events from OpenAI
dc.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);
  // Handle by event.type
});
```

## External API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/realtime/client_secrets` | POST | Generate ephemeral token (server-side) |
| `/v1/realtime/calls` | POST | SDP exchange (client-side, with ephemeral token) |

## Available Voices

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`

**Recommended**: `cedar` or `marin` for best assistant quality (per OpenAI, Sep 2025)
