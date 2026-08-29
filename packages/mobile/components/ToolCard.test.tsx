import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { vi } from 'vitest';

vi.mock('@/components/ui/icons', () => ({
  Code: View,
  Database: View,
  ExternalLink: View,
  Globe: View,
  Package: View,
  Terminal: View,
  Wrench: View,
}));

import { ToolCard } from './ToolCard';

describe('ToolCard', () => {
  it('renders a document-backed tool with metadata outside the curated tool enums', () => {
    render(
      <ToolCard
        id="seeded-research-document"
        title="Seeded research document"
        category={'research' as never}
        sourceType={'markdown' as never}
        status={'published' as never}
      />
    );

    expect(screen.getByLabelText('Seeded research document. Tool. Status: Complete')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
  });
});
