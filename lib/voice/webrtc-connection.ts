import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  type WebRTCDataChannel,
} from 'react-native-webrtc-web-shim'
import InCallManager from 'react-native-incall-manager'
import { Audio } from 'expo-av'

const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime/calls'
const DATA_CHANNEL_NAME = 'oai-events'

export type WebRTCConnectionCallbacks = {
  onEvent?: (event: unknown) => void
  onTrack?: (stream: MediaStream) => void
}

export class WebRTCConnection {
  private pc: RTCPeerConnection | null = null
  private dc: WebRTCDataChannel | null = null
  private localStream: MediaStream | null = null
  private callbacks: WebRTCConnectionCallbacks = {}

  setCallbacks(callbacks: WebRTCConnectionCallbacks): void {
    this.callbacks = callbacks
  }

  async connect(ephemeralKey: string): Promise<void> {
    try {
      // Enable audio in silent mode (iOS)
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true })

      // Force speaker output for voice assistant
      InCallManager.start({ media: 'audio' })
      InCallManager.setForceSpeakerphoneOn(true)

      // Create peer connection
      this.pc = new RTCPeerConnection()

      // Get microphone access and add track
      const ms = await mediaDevices.getUserMedia({ audio: true })
      this.localStream = ms as MediaStream
      const tracks = this.localStream.getTracks()
      if (tracks.length === 0) {
        throw new Error('No audio tracks available from microphone')
      }
      this.pc.addTrack(tracks[0])

      // Handle remote audio track from OpenAI
      this.pc.addEventListener('track', (ev: unknown) => {
        const e = ev as { streams?: MediaStream[] }
        if (e.streams && e.streams[0]) {
          this.callbacks.onTrack?.(e.streams[0])
        }
      })

      // Create data channel for events (name MUST be 'oai-events')
      const dc = this.pc.createDataChannel(DATA_CHANNEL_NAME)
      this.dc = dc
      dc.addEventListener('message', (ev: unknown) => {
        const e = ev as { data: string }
        try {
          const parsed = JSON.parse(e.data)
          this.callbacks.onEvent?.(parsed)
        } catch {
          // Ignore malformed messages
        }
      })

      // Create SDP offer
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      // Exchange SDP with OpenAI using ephemeral token
      const sdpResponse = await fetch(OPENAI_REALTIME_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      })

      if (!sdpResponse.ok) {
        throw new Error(`SDP exchange failed: ${sdpResponse.status}`)
      }

      const answerSdp = await sdpResponse.text()

      // CRITICAL: Always set remote description after SDP answer
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      } as RTCSessionDescriptionInit)
    } catch (error) {
      // Clean up partial resources on any failure
      this.destroy()
      throw error
    }
  }

  sendEvent(event: Record<string, unknown>): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Data channel is not open')
    }
    this.dc.send(JSON.stringify(event))
  }

  destroy(): void {
    // Stop all local mic tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    // Close data channel
    if (this.dc) {
      this.dc.close()
      this.dc = null
    }

    // Close peer connection
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    // Stop InCallManager
    InCallManager.stop()

    // Clear callbacks
    this.callbacks = {}
  }
}
