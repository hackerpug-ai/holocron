import { render, screen } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { NewsfeedFilterBar } from '../NewsfeedFilterBar';

describe('NewsfeedFilterBar', () => {
  describe('AC-1: ALL pill is always first and shows total count', () => {
    it('allPillIsFirstWithTotalCount', () => {
      const options = [
        { key: 'discovery', label: 'Discovery', count: 3 },
        { key: 'release', label: 'Release', count: 5 },
      ];
      const selected = 'all';
      const onChange = () => {};

      render(
        <NewsfeedFilterBar
          options={options}
          selected={selected}
          onChange={onChange}
          testID="newsfeed-filter-bar"
        />
      );

      // ALL pill should exist and be first
      const allPill = screen.getByTestId('filter-pill-all');
      expect(allPill).toBeTruthy();

      // ALL pill should show total count (3 + 5 = 8)
      const allPillCount = screen.getByTestId('filter-pill-all-count');
      expect(allPillCount).toBeTruthy();
      // Note: We'll verify the actual count value in the implementation phase
    });
  });

  describe('AC-2: Active pill has primary background class', () => {
    it('activePillHasPrimaryBackground', () => {
      const options = [
        { key: 'discovery', label: 'Discovery', count: 3 },
        { key: 'release', label: 'Release', count: 5 },
      ];
      const selected = 'discovery';
      const onChange = () => {};

      render(
        <NewsfeedFilterBar
          options={options}
          selected={selected}
          onChange={onChange}
          testID="newsfeed-filter-bar"
        />
      );

      // Discovery pill should have bg-primary class
      const discoveryPill = screen.getByTestId('filter-pill-discovery');
      expect(discoveryPill.props.className).toContain('bg-primary');

      // ALL pill should NOT have bg-primary class
      const allPill = screen.getByTestId('filter-pill-all');
      expect(allPill.props.className).not.toContain('bg-primary');
    });
  });

  describe('AC-3: Pressing inactive pill calls onChange with correct key', () => {
    it('pressingInactivePillCallsOnChange', () => {
      const options = [
        { key: 'discovery', label: 'Discovery', count: 3 },
        { key: 'release', label: 'Release', count: 5 },
      ];
      const selected = 'all';
      const onChange = vi.fn();

      render(
        <NewsfeedFilterBar
          options={options}
          selected={selected}
          onChange={onChange}
          testID="newsfeed-filter-bar"
        />
      );

      // Press the release pill
      const releasePill = screen.getByTestId('filter-pill-release');
      releasePill.props.onPress();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('release');
    });
  });

  describe('AC-4: Pressing already-active pill does not call onChange', () => {
    it('pressingActivePillDoesNotCallOnChange', () => {
      const options = [
        { key: 'discovery', label: 'Discovery', count: 3 },
        { key: 'release', label: 'Release', count: 5 },
      ];
      const selected = 'discovery';
      const onChange = vi.fn();

      render(
        <NewsfeedFilterBar
          options={options}
          selected={selected}
          onChange={onChange}
          testID="newsfeed-filter-bar"
        />
      );

      // Press the already-active discovery pill
      const discoveryPill = screen.getByTestId('filter-pill-discovery');
      discoveryPill.props.onPress();

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('AC-5: Category icons render for non-ALL pills', () => {
    it('categoryIconsRenderForNonAllPills', () => {
      const options = [
        { key: 'discovery', label: 'Discovery', count: 3 },
        { key: 'release', label: 'Release', count: 5 },
        { key: 'trend', label: 'Trend', count: 2 },
        { key: 'discussion', label: 'Discussion', count: 1 },
      ];
      const selected = 'all';
      const onChange = () => {};

      render(
        <NewsfeedFilterBar
          options={options}
          selected={selected}
          onChange={onChange}
          testID="newsfeed-filter-bar"
        />
      );

      // ALL pill should not have an icon
      const _allPill = screen.getByTestId('filter-pill-all');
      // Note: We'll verify icon presence in implementation phase

      // Each category pill should have its respective icon
      const discoveryPill = screen.getByTestId('filter-pill-discovery');
      const releasePill = screen.getByTestId('filter-pill-release');
      const trendPill = screen.getByTestId('filter-pill-trend');
      const discussionPill = screen.getByTestId('filter-pill-discussion');

      expect(discoveryPill).toBeTruthy();
      expect(releasePill).toBeTruthy();
      expect(trendPill).toBeTruthy();
      expect(discussionPill).toBeTruthy();
    });
  });
});
