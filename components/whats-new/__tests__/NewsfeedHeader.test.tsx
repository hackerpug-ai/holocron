/**
 * TDD Suite: NEWSFEED-001 - NewsfeedHeader Component
 *
 * Tests follow RED → GREEN → REFACTOR cycle per acceptance criterion.
 * All tests use real rendering via @testing-library/react-native.
 */

import { render, screen } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { NewsfeedHeader } from '../NewsfeedHeader';

describe('NewsfeedHeader', () => {
  /**
   * AC-1: Null report renders without crash
   * TDD_STATE: [✓] RED  [✓] VERIFY_RED  [✓] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
   */
  it('nullReportRendersWithoutCrash', () => {
    render(<NewsfeedHeader report={null} />);

    const header = screen.getByTestId('newsfeed-header');
    expect(header).toBeTruthy();
  });

  /**
   * AC-2: Date formatted correctly
   * TDD_STATE: [✓] RED  [✓] VERIFY_RED  [✓] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
   */
  it('dateFormattedCorrectly', () => {
    const report = {
      createdAt: 1745078400000, // 2025-04-19
      findingsCount: 12,
    };

    render(<NewsfeedHeader report={report} />);

    const dateEl = screen.getByTestId('newsfeed-header-date');
    expect(dateEl).toBeTruthy();
    expect(dateEl.props.children).toMatch(/Sat, Apr \d+/i);
  });

  /**
   * AC-3: Freshness dot is green for recent report
   * TDD_STATE: [✓] RED  [✓] VERIFY_RED  [✓] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
   */
  it('freshnessDotGreenWhenRecent', () => {
    const report = {
      createdAt: Date.now() - 7200000, // 2 hours ago
      findingsCount: 5,
    };

    render(<NewsfeedHeader report={report} />);

    const dot = screen.getByTestId('newsfeed-header-freshness-dot');
    expect(dot).toBeTruthy();
    expect(dot.props.style).toMatchObject(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#22C55E' })])
    );
  });

  /**
   * AC-4: Freshness dot is amber for report aged 8 h
   * TDD_STATE: [✓] RED  [✓] VERIFY_RED  [✓] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
   */
  it('freshnessDotAmberWhenAged', () => {
    const report = {
      createdAt: Date.now() - 28800000, // 8 hours ago
      findingsCount: 5,
    };

    render(<NewsfeedHeader report={report} />);

    const dot = screen.getByTestId('newsfeed-header-freshness-dot');
    expect(dot).toBeTruthy();
    expect(dot.props.style).toMatchObject(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#F59E0B' })])
    );
  });

  /**
   * AC-5: Stats line shows correct counts
   * TDD_STATE: [✓] RED  [✓] VERIFY_RED  [✓] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
   */
  it('statsLineShowsCorrectCounts', () => {
    const report = {
      createdAt: Date.now() - 3600000, // 1 hour ago
      findingsCount: 12,
      summaryJson: { sources: [{ url: 'https://example.com' }] },
    };

    render(<NewsfeedHeader report={report} />);

    const stats = screen.getByTestId('newsfeed-header-stats');
    expect(stats).toBeTruthy();
    expect(stats.props.children).toContain('12 findings');
    expect(stats.props.children).toContain('1 sources');
    expect(stats.props.children).toContain('Generated');
  });
});
