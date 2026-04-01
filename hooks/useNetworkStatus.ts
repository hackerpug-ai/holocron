import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Hook to monitor network connectivity status
 * Returns the current online/offline state and connection type
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const [connectionType, setConnectionType] = useState<string | null>(null)

  useEffect(() => {
    // Set up network listener
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected ?? true
      setIsOnline(isConnected)
      setConnectionType(state.type)
    })

    // Get initial state
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected ?? true)
      setConnectionType(state.type)
    })

    return unsubscribe
  }, [])

  return {
    isOnline,
    isOffline: !isOnline,
    connectionType,
  }
}
