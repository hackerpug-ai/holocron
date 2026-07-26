import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockRecorderInstance {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
}

const recorderInstances: MockRecorderInstance[] = [];

function createMockRecorder(): MockRecorderInstance {
  const instance = {
    start: vi.fn(),
    stop: vi.fn(),
    state: 'inactive' as string,
    ondataavailable: null as ((event: BlobEvent) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  instance.start.mockImplementation(() => {
    instance.state = 'recording';
  });
  instance.stop.mockImplementation(() => {
    instance.state = 'inactive';
    setTimeout(() => instance.onstop?.(), 0);
  });
  recorderInstances.push(instance);
  return instance;
}

const MockMediaRecorder = vi.fn(function (this: unknown) {
  return createMockRecorder();
});
vi.stubGlobal('MediaRecorder', MockMediaRecorder);

import { createAudioRecorder } from '@/lib/voice/audio-recorder';

function lastRecorder() {
  return recorderInstances[recorderInstances.length - 1]!;
}

describe('createAudioRecorder', () => {
  const mockSessionId = 'session-123';
  const mockUploadAudio = vi.fn();
  const mockGetSessionId = vi.fn(() => mockSessionId);

  const mockStream = {
    getTracks: vi.fn(() => []),
  } as unknown as MediaStream;

  beforeEach(() => {
    recorderInstances.length = 0;
    MockMediaRecorder.mockClear();
    MockMediaRecorder.mockImplementation(function (this: unknown) {
      return createMockRecorder();
    });
    mockUploadAudio.mockReset();
    mockGetSessionId.mockReset();
    mockGetSessionId.mockReturnValue(mockSessionId);
    mockUploadAudio.mockResolvedValue(null);
  });

  it('starts MediaRecorder on the provided stream', () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);

    expect(MockMediaRecorder).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/webm' });
    expect(lastRecorder().start).toHaveBeenCalledWith(1000);
  });

  it('is a no-op if start is called twice', () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);
    recorder.start(mockStream);

    expect(MockMediaRecorder).toHaveBeenCalledTimes(1);
  });

  it('uploads audio blob through lifecycle callback on stopAndUpload', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);
    const mr = lastRecorder();

    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    mr.ondataavailable?.({ data: blob } as BlobEvent);

    await recorder.stopAndUpload();

    expect(mockGetSessionId).toHaveBeenCalled();
    expect(mockUploadAudio).toHaveBeenCalledWith({
      sessionId: mockSessionId,
      blob: expect.any(Blob),
    });
  });

  it('does nothing on stopAndUpload if never started', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    await recorder.stopAndUpload();

    expect(mockUploadAudio).not.toHaveBeenCalled();
  });

  it('does not throw when MediaRecorder constructor fails', () => {
    MockMediaRecorder.mockImplementationOnce(function (this: unknown) {
      throw new Error('MediaRecorder not supported');
    });

    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    expect(() => recorder.start(mockStream)).not.toThrow();
  });

  it('silently skips recording when MediaRecorder is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    expect(() => recorder.start(mockStream)).not.toThrow();
    expect(MockMediaRecorder).not.toHaveBeenCalled();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  it('does not throw when upload fails', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);
    const mr = lastRecorder();

    const blob = new Blob(['data'], { type: 'audio/webm' });
    mr.ondataavailable?.({ data: blob } as BlobEvent);

    mockUploadAudio.mockRejectedValueOnce(new Error('upload failed'));

    await expect(recorder.stopAndUpload()).resolves.toBeUndefined();
  });

  it('handles MediaRecorder error event gracefully', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);
    const mr = lastRecorder();

    mr.onerror?.();

    await recorder.stopAndUpload();
    expect(mockUploadAudio).not.toHaveBeenCalled();
  });

  it('skips upload when no data chunks were collected', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);

    await recorder.stopAndUpload();

    expect(mockUploadAudio).not.toHaveBeenCalled();
  });

  it('stopAndDiscard never calls uploadAudio (cancel/orphan safety)', async () => {
    const recorder = createAudioRecorder({
      uploadAudio: mockUploadAudio,
      getSessionId: mockGetSessionId,
    });

    recorder.start(mockStream);
    const mr = lastRecorder();
    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    mr.ondataavailable?.({ data: blob } as BlobEvent);

    await recorder.stopAndDiscard();

    expect(mockUploadAudio).not.toHaveBeenCalled();
  });
});
