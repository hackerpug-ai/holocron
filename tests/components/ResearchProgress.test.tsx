// @ts-expect-error - test dependency not installed
import { render, screen } from '@testing-library/react-native'
import { describe, it, expect } from 'vitest'
import { ResearchProgressWithConvex } from '@/components/ResearchProgressWithConvex'

/**
 * TDD Test for AC-1: Research started → Shows waiting indicator
 *
 * GIVEN: Research session with status 'pending'
 * WHEN: Component renders
 * THEN: Shows waiting indicator
 */
describe('ResearchProgressWithConvex - AC-1: Pending State', () => {
  it('should show waiting indicator when session status is pending', () => {
    const mockSession = {
      _id: 'test-session-id' as any,
      query: 'Test research query',
      researchType: 'deep',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    render(<ResearchProgressWithConvex sessionId={mockSession._id} />)

    // Should show waiting/loading indicator
    expect(screen.getByTestId('research-progress-waiting')).toBeTruthy()

    // Should show query text
    expect(screen.getByText('Test research query')).toBeTruthy()

    // Should show pending message
    expect(screen.getByText(/starting/i)).toBeTruthy()
  })
})

/**
 * TDD Test for AC-2: Research running → Progress bar animates
 *
 * GIVEN: Research session with status 'running'
 * WHEN: Component renders
 * THEN: Shows progress bar with animation
 */
describe('ResearchProgressWithConvex - AC-2: Running State', () => {
  it('should show progress bar when session status is running', () => {
    const mockSession = {
      _id: 'test-session-id' as any,
      query: 'Test research query',
      researchType: 'deep',
      status: 'running',
      currentIteration: 1,
      maxIterations: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    render(<ResearchProgressWithConvex sessionId={mockSession._id} />)

    // Should show progress bar
    expect(screen.getByTestId('research-progress-bar')).toBeTruthy()

    // Should show iteration info
    expect(screen.getByText(/iteration 1\/5/i)).toBeTruthy()

    // Should show searching message
    expect(screen.getByText(/searching|analyzing|synthesizing/i)).toBeTruthy()
  })
})

/**
 * TDD Test for AC-3: Research complete → Shows results
 *
 * GIVEN: Research session with status 'completed'
 * WHEN: Component renders
 * THEN: Shows results view
 */
describe('ResearchProgressWithConvex - AC-3: Completed State', () => {
  it('should show results when session status is completed', () => {
    const mockSession = {
      _id: 'test-session-id' as any,
      query: 'Test research query',
      researchType: 'deep',
      status: 'completed',
      findings: {
        report: '# Test Report\n\nThis is the result.',
      },
      currentIteration: 5,
      maxIterations: 5,
      coverageScore: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
    }

    render(<ResearchProgressWithConvex sessionId={mockSession._id} />)

    // Should show results container
    expect(screen.getByTestId('research-progress-results')).toBeTruthy()

    // Should show completion indicator
    expect(screen.getByText(/complete|done|finished/i)).toBeTruthy()
  })
})

/**
 * TDD Test for AC-4: Research fails → Shows error message
 *
 * GIVEN: Research session with status 'failed'
 * WHEN: Component renders
 * THEN: Shows error message
 */
describe('ResearchProgressWithConvex - AC-4: Error State', () => {
  it('should show error message when session status is failed', () => {
    const mockSession = {
      _id: 'test-session-id' as any,
      query: 'Test research query',
      researchType: 'deep',
      status: 'failed',
      errorText: 'Research failed due to network error',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    render(<ResearchProgressWithConvex sessionId={mockSession._id} />)

    // Should show error container
    expect(screen.getByTestId('research-progress-error')).toBeTruthy()

    // Should show error message
    expect(screen.getByText(/failed|error/i)).toBeTruthy()

    // Should show specific error text
    expect(screen.getByText(/network error/i)).toBeTruthy()
  })
})
