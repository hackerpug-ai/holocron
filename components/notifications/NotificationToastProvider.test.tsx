import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { AppState, View } from 'react-native';
import { NotificationToastProvider } from './NotificationToastProvider';

const convexMocks = vi.hoisted(() => ({
  markRead: vi.fn(() => Promise.resolve()),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('convex/react', () => ({
  useMutation: convexMocks.useMutation,
  useQuery: convexMocks.useQuery,
}));

vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'Success' },
}));

vi.mock('@/convex/_generated/api', () => ({
  api: {
    notifications: {
      mutations: { markRead: 'markRead' },
      queries: { listUnread: 'listUnread' },
    },
  },
}));

vi.mock('./NotificationToast', () => ({
  NotificationToast: ({
    notification,
    testID,
  }: {
    notification: { title: string };
    testID?: string;
  }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return React.createElement(
      View,
      { testID },
      React.createElement(Text, null, notification.title)
    );
  },
}));

interface TestNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  route: string;
  read: boolean;
  createdAt: number;
}

function notification(type: string): TestNotification {
  return {
    _id: `${type}-1`,
    type,
    title: `${type} title`,
    body: `${type} body`,
    route: '/document/test',
    read: false,
    createdAt: Date.now(),
  };
}

describe('NotificationToastProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convexMocks.useMutation.mockReturnValue(convexMocks.markRead);
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
  });

  it('does not render a foreground toast for audio completion notifications', async () => {
    convexMocks.useQuery.mockReturnValue([notification('audio_complete')]);

    render(
      <NotificationToastProvider>
        <View testID="child" />
      </NotificationToastProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('notification-toast-provider-toast')).toBeNull();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('still renders a foreground toast for high-importance completion notifications', async () => {
    convexMocks.useQuery.mockReturnValue([notification('research_complete')]);

    render(
      <NotificationToastProvider>
        <View testID="child" />
      </NotificationToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('notification-toast-provider-toast')).toBeTruthy();
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success
    );
  });
});
