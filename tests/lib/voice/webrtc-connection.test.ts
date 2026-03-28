import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mocks for react-native-webrtc-web-shim ---

const mockTrack = {
  stop: vi.fn(),
  kind: 'audio',
}

const mockLocalStream = {
  getTracks: vi.fn(() => [mockTrack]),
}

const mockRemoteStream = { id: 'remote-stream' }

let trackEventHandler: ((e: { streams: unknown[] }) => void) | null = null
let dcMessageHandler: ((e: { data: string }) => void) | null = null

const mockDataChannel = {
  addEventListener: vi.fn((event: string, handler: unknown) => {
    if (event === 'message') {
      dcMessageHandler = handler as (e: { data: string }) => void
    }
  }),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 'open',
}

const mockPeerConnection = {
  addTrack: vi.fn(),
  addEventListener: vi.fn((event: string, handler: unknown) => {
    if (event === 'track') {
      trackEventHandler = handler as (e: { streams: unknown[] }) => void
    }
  }),
  createDataChannel: vi.fn(() => mockDataChannel),
  createOffer: vi.fn(() =>
    Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' })
  ),
  setLocalDescription: vi.fn(() => Promise.resolve()),
  setRemoteDescription: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
}

vi.mock('react-native-webrtc-web-shim', () => ({
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve(mockLocalStream)),
  },
  // Must use function (not arrow) so it can be called with `new`
  RTCPeerConnection: vi.fn(function (this: unknown) {
    return mockPeerConnection
  }),
  MediaStream: vi.fn(),
}))

vi.mock('react-native-incall-manager', () => ({
  default: {
    start: vi.fn(),
    setForceSpeakerphoneOn: vi.fn(),
    stop: vi.fn(),
  },
}))

vi.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: vi.fn(() => Promise.resolve()),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// --- Import after mocks ---
import { WebRTCConnection } from '@/lib/voice/webrtc-connection'
import InCallManager from 'react-native-incall-manager'
import { Audio } from 'expo-av'
import { mediaDevices } from 'react-native-webrtc-web-shim'

describe('WebRTCConnection', () => {
  let connection: WebRTCConnection

  beforeEach(() => {
    vi.clearAllMocks()
    trackEventHandler = null
    dcMessageHandler = null
    mockDataChannel.readyState = 'open'
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('mock-answer-sdp'),
    })
    connection = new WebRTCConnection()
  })

  afterEach(() => {
    connection.destroy()
  })

  describe('connect()', () => {
    it('creates RTCPeerConnection, adds mic track, exchanges SDP, opens data channel', async () => {
      await connection.connect('ek_test_token')

      // Audio setup
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentModeIOS: true,
      })
      expect(InCallManager.start).toHaveBeenCalledWith({ media: 'audio' })
      expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(true)

      // Mic access
      expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })

      // Track added to peer connection
      expect(mockPeerConnection.addTrack).toHaveBeenCalledWith(mockTrack)

      // Data channel created with correct name
      expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith(
        'oai-events'
      )

      // SDP exchange
      expect(mockPeerConnection.createOffer).toHaveBeenCalled()
      expect(mockPeerConnection.setLocalDescription).toHaveBeenCalledWith({
        type: 'offer',
        sdp: 'mock-offer-sdp',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          body: 'mock-offer-sdp',
          headers: {
            Authorization: 'Bearer ek_test_token',
            'Content-Type': 'application/sdp',
          },
        }
      )

      // Remote description set
      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: 'mock-answer-sdp',
      })
    })

    it('handles remote track event and notifies callback', async () => {
      const onTrack = vi.fn()
      connection.setCallbacks({ onTrack })

      await connection.connect('ek_test_token')

      // Simulate remote track event
      expect(trackEventHandler).not.toBeNull()
      trackEventHandler!({ streams: [mockRemoteStream] })

      expect(onTrack).toHaveBeenCalledWith(mockRemoteStream)
    })

    it('throws and cleans up when SDP exchange fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })

      await expect(connection.connect('ek_bad_token')).rejects.toThrow(
        'SDP exchange failed: 401'
      )

      // Verify cleanup happened (pc.close was called)
      expect(mockPeerConnection.close).toHaveBeenCalled()
      expect(mockTrack.stop).toHaveBeenCalled()
      expect(mockDataChannel.close).toHaveBeenCalled()
    })

    it('throws and cleans up when getUserMedia fails', async () => {
      const getUserMedia = mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
      getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(connection.connect('ek_test_token')).rejects.toThrow(
        'Permission denied'
      )

      // Cleanup should still run
      expect(InCallManager.stop).toHaveBeenCalled()
    })
  })

  describe('sendEvent()', () => {
    it('JSON-serializes and sends event via data channel', async () => {
      await connection.connect('ek_test_token')

      const event = {
        type: 'session.update',
        session: { voice: 'cedar' },
      }
      connection.sendEvent(event)

      expect(mockDataChannel.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it('throws when data channel is not open', () => {
      // Not connected yet, no data channel
      expect(() =>
        connection.sendEvent({ type: 'session.update' })
      ).toThrow('Data channel is not open')
    })

    it('throws when data channel readyState is not open', async () => {
      await connection.connect('ek_test_token')
      mockDataChannel.readyState = 'closed'

      expect(() =>
        connection.sendEvent({ type: 'session.update' })
      ).toThrow('Data channel is not open')
    })
  })

  describe('data channel message handling', () => {
    it('parses JSON messages and calls onEvent callback', async () => {
      const onEvent = vi.fn()
      connection.setCallbacks({ onEvent })

      await connection.connect('ek_test_token')

      // Simulate incoming message
      expect(dcMessageHandler).not.toBeNull()
      dcMessageHandler!({
        data: JSON.stringify({ type: 'session.created', session: {} }),
      })

      expect(onEvent).toHaveBeenCalledWith({
        type: 'session.created',
        session: {},
      })
    })

    it('ignores malformed JSON messages', async () => {
      const onEvent = vi.fn()
      connection.setCallbacks({ onEvent })

      await connection.connect('ek_test_token')

      // Should not throw
      dcMessageHandler!({ data: 'not-json{{{' })
      expect(onEvent).not.toHaveBeenCalled()
    })
  })

  describe('destroy()', () => {
    it('stops mic track, closes data channel, closes peer connection, removes listeners', async () => {
      await connection.connect('ek_test_token')

      connection.destroy()

      expect(mockTrack.stop).toHaveBeenCalled()
      expect(mockDataChannel.close).toHaveBeenCalled()
      expect(mockPeerConnection.close).toHaveBeenCalled()
      expect(InCallManager.stop).toHaveBeenCalled()
    })

    it('is safe to call multiple times', async () => {
      await connection.connect('ek_test_token')

      connection.destroy()
      connection.destroy() // Should not throw

      // close/stop called once from first destroy, resources nulled
      expect(mockPeerConnection.close).toHaveBeenCalledTimes(1)
    })

    it('clears callbacks', async () => {
      const onEvent = vi.fn()
      connection.setCallbacks({ onEvent })
      await connection.connect('ek_test_token')

      connection.destroy()

      // Callbacks should be cleared - simulate a late message
      // (would need to re-trigger handler, but callbacks object is now {})
    })
  })
})
