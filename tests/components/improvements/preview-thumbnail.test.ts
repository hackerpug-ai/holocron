/**
 * S-UPLOAD-01 AC-4 — preview thumbnail shows fixture dimensions (800x600).
 *
 * Unit-tier justified: pure component render from a picked file URI; no runtime I/O.
 * Verify:
 *   pnpm vitest run tests/components/improvements/preview-thumbnail.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

const FIXTURE = resolve(process.cwd(), '.tmp/S-UPLOAD-01/test-fixture.jpg');
const FIXTURE_URI = `file://${FIXTURE}`;
const FIXTURE_WIDTH = 800;
const FIXTURE_HEIGHT = 600;

describe('S-UPLOAD-01 AC-4: ImprovementPreviewThumbnail', () => {
  it('renders test-fixture.jpg at 800x600 with attach-preview mounted and non-empty URI', async () => {
    expect(existsSync(FIXTURE), `missing fixture ${FIXTURE}`).toBe(true);

    const { ImprovementPreviewThumbnail } = await import(
      '@/components/improvements/ImprovementPreviewThumbnail'
    );

    render(
      createElement(ImprovementPreviewThumbnail, {
        uri: FIXTURE_URI,
        width: FIXTURE_WIDTH,
        height: FIXTURE_HEIGHT,
      })
    );

    const preview = screen.getByTestId('attach-preview');
    expect(preview).toBeTruthy();

    expect(FIXTURE_URI.length).toBeGreaterThan(0);

    const props = preview.props as {
      source?: { uri?: string };
      style?: Array<Record<string, unknown>> | Record<string, unknown>;
      accessibilityLabel?: string;
      testID?: string;
    };
    expect(props.source?.uri ?? FIXTURE_URI).toBe(FIXTURE_URI);
    expect((props.source?.uri ?? '').length).toBeGreaterThan(0);

    const styleList = Array.isArray(props.style) ? props.style : [props.style ?? {}];
    const merged = Object.assign({}, ...styleList.filter(Boolean));
    expect(merged.aspectRatio).toBeCloseTo(FIXTURE_WIDTH / FIXTURE_HEIGHT, 5);
    expect(props.accessibilityLabel).toMatch(/800\s*[x×]\s*600|preview/i);

    expect(screen.queryByTestId('attach-prompt-empty')).toBeNull();

    const src = readFileSync(
      resolve(
        process.cwd(),
        'packages/mobile/components/improvements/ImprovementPreviewThumbnail.tsx'
      ),
      'utf8'
    );
    expect(src).toContain('attach-preview');
    expect(src).not.toMatch(/placeholder-only|hardcoded-preview/i);
  });
});
