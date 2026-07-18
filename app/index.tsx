import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to the chat screen (drawer layout handles finding the right conversation)
  return (
    <Redirect
      href={process.env.EXPO_PUBLIC_REFERENCE_FLOW === 'true' ? '/reference-chat' : '/chat/new'}
    />
  );
}
