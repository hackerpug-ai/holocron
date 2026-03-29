/**
 * Type declarations for voice-related vendor packages that are not yet installed.
 * These will be replaced by actual package types once the packages are added.
 */

declare module 'react-native-webrtc-web-shim' {
  export class MediaStream {
    getTracks(): MediaStreamTrack[]
    addTrack(track: MediaStreamTrack): void
  }

  export interface WebRTCDataChannel {
    addEventListener(event: string, handler: (e: unknown) => void): void
    send(data: string): void
    close(): void
    readyState: string
  }

  export class RTCPeerConnection {
    addTrack(track: MediaStreamTrack): void
    addEventListener(event: string, handler: (e: unknown) => void): void
    createDataChannel(label: string): WebRTCDataChannel
    createOffer(): Promise<RTCSessionDescriptionInit>
    setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>
    setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>
    close(): void
  }

  export const mediaDevices: {
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  }
}

declare module 'react-native-incall-manager' {
  const InCallManager: {
    start(options?: { media?: string }): void
    stop(): void
    setForceSpeakerphoneOn(flag: boolean): void
  }
  export default InCallManager
}
