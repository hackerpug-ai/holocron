/**
 * S-UPLOAD-03 — upload-success only with CAS content hash (anti-stub).
 */
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react-native';

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    colors: {
      card: '#111',
      border: '#333',
      input: '#222',
      foreground: '#fff',
      mutedForeground: '#999',
      primary: '#4af',
      primaryForeground: '#000',
      success: '#0f0',
      destructive: '#f44',
    },
    typography: { bodySmall: { fontSize: 14 } },
    spacing: { sm: 8, md: 16, lg: 24 },
    radius: {},
    brandColors: {},
    isDark: true,
  }),
}));

import { ImageUploadStatus } from '@/components/improvements/ImageUploadStatus';

const CAS = 'db6fcc9792c6098b653269e9da2bbc54e8e75acc31ae4442c665feae25c482fb';

describe('ImageUploadStatus CAS gate', () => {
  it('does not render upload-success when phase=success without content hash', () => {
    render(
      createElement(ImageUploadStatus, {
        phase: 'success',
        zeroContentHash: '',
      })
    );
    expect(screen.queryByTestId('upload-success')).toBeNull();
  });

  it('does not render upload-success for empty-hash success (text-only anti-stub)', () => {
    render(
      createElement(ImageUploadStatus, {
        phase: 'success',
        zeroContentHash: null,
      })
    );
    expect(screen.queryByTestId('upload-success')).toBeNull();
  });

  it('renders upload-success when phase=success with 64-hex CAS hash', () => {
    render(
      createElement(ImageUploadStatus, {
        phase: 'success',
        zeroContentHash: CAS,
        zeroSynced: true,
      })
    );
    expect(screen.getByTestId('upload-success')).toBeTruthy();
    expect(screen.getByTestId('zero-file-object')).toBeTruthy();
  });
});
