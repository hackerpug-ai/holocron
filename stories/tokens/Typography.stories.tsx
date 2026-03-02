import type { Meta, StoryObj } from '@storybook/react'
import { View, Text, StyleSheet, ScrollView, TextStyle } from 'react-native'
import { typography } from '@/lib/theme'

const typeScale = [
  { name: 'display', ...typography.display, sample: 'Display Heading' },
  { name: 'h1', ...typography.h1, sample: 'Heading One' },
  { name: 'h2', ...typography.h2, sample: 'Heading Two' },
  { name: 'h3', ...typography.h3, sample: 'Heading Three' },
  { name: 'h4', ...typography.h4, sample: 'Heading Four' },
  { name: 'bodyLarge', ...typography.bodyLarge, sample: 'The quick brown fox jumps over the lazy dog' },
  { name: 'body', ...typography.body, sample: 'The quick brown fox jumps over the lazy dog' },
  { name: 'bodySmall', ...typography.bodySmall, sample: 'The quick brown fox jumps over the lazy dog' },
  { name: 'caption', ...typography.caption, sample: 'Caption text for metadata and small details' },
  { name: 'label', ...typography.label, sample: 'LABEL TEXT' },
]

function TypographyScale() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Typography Scale</Text>
      <View style={styles.list}>
        {typeScale.map((item) => {
          const { name, fontSize, fontWeight, lineHeight, sample } = item
          const textTransform = 'textTransform' in item ? item.textTransform : undefined

          const sampleStyle: TextStyle = {
            fontSize,
            fontWeight: fontWeight as TextStyle['fontWeight'],
            lineHeight,
            textTransform: textTransform as TextStyle['textTransform'],
            color: 'hsl(222.2, 84%, 4.9%)',
          }

          return (
            <View key={name} style={styles.row}>
              <View style={styles.labelContainer}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.meta}>
                  {fontSize}px / {fontWeight}
                </Text>
              </View>
              <Text style={sampleStyle}>{sample}</Text>
            </View>
          )
        })}
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
    gap: 24,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: 'hsl(214.3, 31.8%, 91.4%)',
    paddingBottom: 16,
    gap: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: 'hsl(222.2, 84%, 4.9%)',
  },
  meta: {
    fontSize: 11,
    color: 'hsl(215.4, 16.3%, 46.9%)',
  },
})

const meta: Meta = {
  title: 'Design System/Typography',
  component: TypographyScale,
}

export default meta

type Story = StoryObj

export const FontScale: Story = {}
