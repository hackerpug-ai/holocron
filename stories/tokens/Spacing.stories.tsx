import type { Meta, StoryObj } from '@storybook/react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { spacing } from '@/lib/theme'

const spacingScale = Object.entries(spacing).map(([name, value]) => ({
  name,
  value,
}))

function SpacingBoxes() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Spacing Scale</Text>
      <View style={styles.list}>
        {spacingScale.map(({ name, value }) => (
          <View key={name} style={styles.row}>
            <View style={styles.labelContainer}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.value}>{value}px</Text>
            </View>
            <View
              style={[
                styles.box,
                {
                  width: value,
                  height: value,
                  minWidth: 4,
                  minHeight: 4,
                },
              ]}
            />
            <View style={styles.barContainer}>
              <View style={[styles.bar, { width: value }]} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    color: 'hsl(222.2, 84%, 4.9%)',
  },
  list: {
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  labelContainer: {
    width: 80,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: 'hsl(222.2, 84%, 4.9%)',
  },
  value: {
    fontSize: 12,
    color: 'hsl(215.4, 16.3%, 46.9%)',
  },
  box: {
    backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
    borderRadius: 4,
  },
  barContainer: {
    flex: 1,
    height: 4,
    backgroundColor: 'hsl(210, 40%, 96.1%)',
    borderRadius: 2,
  },
  bar: {
    height: '100%',
    backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
    borderRadius: 2,
  },
})

const meta: Meta = {
  title: 'Design System/Spacing',
  component: SpacingBoxes,
}

export default meta

type Story = StoryObj

export const Scale: Story = {}
