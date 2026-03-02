import { StyleSheet, View, Text } from 'react-native'

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Explore</Text>
      <Text style={styles.subtitle}>Discover knowledge artifacts</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    opacity: 0.7,
  },
})
