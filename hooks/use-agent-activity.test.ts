import { renderHook } from '@testing-library/react-hooks'
import { useAgentActivity } from './use-agent-activity'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
}))

describe('useAgentActivity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns phase directly from query', () => {
    vi.mocked(useQuery).mockReturnValue({
      phase: 'triage',
      toolName: null,
    } as unknown as ReturnType<typeof useQuery>)

    const { result } = renderHook(() => useAgentActivity({ threadId: 'test-thread' }))
    expect(result.current.phase).toBe('triage')
  })

  it('propagates toolName', () => {
    vi.mocked(useQuery).mockReturnValue({
      phase: 'tool_execution',
      toolName: 'find_recommendations',
    } as unknown as ReturnType<typeof useQuery>)

    const { result } = renderHook(() => useAgentActivity({ threadId: 'test-thread' }))
    expect(result.current.toolName).toBe('find_recommendations')
  })

  it('returns idle when query undefined and threadId present', () => {
    vi.mocked(useQuery).mockReturnValue(undefined)

    const { result } = renderHook(() => useAgentActivity({ threadId: 'test-thread' }))
    expect(result.current.phase).toBe('idle')
    expect(result.current.loading).toBe(true)
  })

  it('returns idle when threadId is null', () => {
    const { result } = renderHook(() => useAgentActivity({ threadId: null }))
    expect(result.current.phase).toBe('idle')
    expect(result.current.loading).toBe(false)
  })

  it('passes skip to useQuery when threadId is null', () => {
    renderHook(() => useAgentActivity({ threadId: null }))
    expect(useQuery).toHaveBeenCalledWith(api.db.agentActivity.get, 'skip')
  })
})
