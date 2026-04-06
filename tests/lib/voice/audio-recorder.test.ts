import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Id } from '@/convex/_generated/dataModel'

interface MockRecorderInstance {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  state: string
  ondataavailable: ((event: BlobEvent) => void) | null
  onstop: (() => void) | null
  onerror: (() => void) | null
}

// Track all created recorder instances
const recorderInstances: MockRecorderInstance[] = []

function createMockRecorder(): MockRecorderInstance {
  const instance = {
    start: vi.fn(),
    stop: vi.fn(),
    state: 'inactive' as string,
    ondataavailable: null as ((event: BlobEvent) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null as (() => void) | null,
  }
  instance.start.mockImplementation(() => {
    instance.state = 'recording'
  })
  instance.stop.mockImplementation(() => {
    instance.state = 'inactive'
    setTimeout(() => instance.onstop?.(), 0)
  })
  recorderInstances.push(instance)
  return instance
}

// Must use `function` (not arrow) so it can be called with `new`
const MockMediaRecorder = vi.fn(function (this: unknown) { return createMockRecorder() })
vi.stubGlobal('MediaRecorder', MockMediaRecorder)

// Mock fetch for upload
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocks
import { createAudioRecorder } from '@/lib/voice/audio-recorder'

/** Get the last MediaRecorder instance created */
function lastRecorder() {
  return recorderInstances[recorderInstances.length - 1]!
}

describe('createAudioRecorder', () => {
  const mockSessionId = 'session-123' as Id<'voiceSessions'>
  const mockGenerateUploadUrl = vi.fn()
  const mockAttachAudio = vi.fn()

  const mockStream = {
    getTracks: vi.fn(() => []),
  } as unknown as MediaStream

  beforeEach(() => {
    recorderInstances.length = 0
    MockMediaRecorder.mockClear()
    MockMediaRecorder.mockImplementation(function (this: unknown) { return createMockRecorder() })
    mockFetch.mockReset()
    mockGenerateUploadUrl.mockReset()
    mockAttachAudio.mockReset()
    mockGenerateUploadUrl.mockResolvedValue('https://upload.example.com/url')
    mockAttachAudio.mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: 'storage-abc' }),
    })
  })

  it('starts MediaRecorder on the provided stream', () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)

    expect(MockMediaRecorder).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/webm' })
    expect(lastRecorder().start).toHaveBeenCalledWith(1000)
  })

  it('is a no-op if start is called twice', () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)
    recorder.start(mockStream)

    expect(MockMediaRecorder).toHaveBeenCalledTimes(1)
  })

  it('uploads audio blob and attaches to session on stopAndUpload', async () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)
    const mr = lastRecorder()

    // Simulate data arriving
    const blob = new Blob(['audio-data'], { type: 'audio/webm' })
    mr.ondataavailable?.({ data: blob } as BlobEvent)

    await recorder.stopAndUpload()

    expect(mockGenerateUploadUrl).toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://upload.example.com/url',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
      })
    )
    expect(mockAttachAudio).toHaveBeenCalledWith({
      sessionId: mockSessionId,
      storageId: 'storage-abc',
    })
  })

  it('does nothing on stopAndUpload if never started', async () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    await recorder.stopAndUpload()

    expect(mockGenerateUploadUrl).not.toHaveBeenCalled()
  })

  it('does not throw when MediaRecorder constructor fails', () => {
    MockMediaRecorder.mockImplementationOnce(function (this: unknown) {
      throw new Error('MediaRecorder not supported')
    })

    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    expect(() => recorder.start(mockStream)).not.toThrow()
  })

  it('does not throw when upload fails', async () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)
    const mr = lastRecorder()

    const blob = new Blob(['data'], { type: 'audio/webm' })
    mr.ondataavailable?.({ data: blob } as BlobEvent)

    // Override fetch for this test to simulate failure
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await recorder.stopAndUpload()

    expect(mockAttachAudio).not.toHaveBeenCalled()
  })

  it('handles MediaRecorder error event gracefully', async () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)
    const mr = lastRecorder()

    // Simulate error — clears internal state
    mr.onerror?.()

    await recorder.stopAndUpload()
    expect(mockGenerateUploadUrl).not.toHaveBeenCalled()
  })

  it('skips upload when no data chunks were collected', async () => {
    const recorder = createAudioRecorder({
      generateUploadUrl: mockGenerateUploadUrl,
      attachAudio: mockAttachAudio,
      sessionId: mockSessionId,
    })

    recorder.start(mockStream)

    await recorder.stopAndUpload()

    expect(mockGenerateUploadUrl).not.toHaveBeenCalled()
  })
})
