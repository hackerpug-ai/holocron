/**
 * Type declarations for voice assistant dependencies.
 * These packages will be installed during Epic 2 integration.
 * Stubs allow tsc to pass before packages are available.
 */

declare module "react-native-webrtc-web-shim" {
  export const mediaDevices: {
    getUserMedia(constraints: { audio: boolean }): Promise<unknown>;
  };

  export class WebRTCDataChannel {
    readonly readyState: string;
    addEventListener(event: string, handler: (e: unknown) => void): void;
    send(data: string): void;
    close(): void;
  }

  export class RTCPeerConnection {
    constructor(config?: Record<string, unknown>);
    addTrack(track: unknown): void;
    addEventListener(event: string, handler: (e: unknown) => void): void;
    createDataChannel(name: string): WebRTCDataChannel;
    createOffer(): Promise<{ sdp?: string; type: string }>;
    setLocalDescription(desc: unknown): Promise<void>;
    setRemoteDescription(desc: unknown): Promise<void>;
    close(): void;
  }

  export class MediaStream {
    getTracks(): Array<{ stop(): void }>;
  }
}

declare module "react-native-incall-manager" {
  const InCallManager: {
    start(options: { media: string }): void;
    stop(): void;
    setForceSpeakerphoneOn(value: boolean): void;
  };
  export default InCallManager;
}
