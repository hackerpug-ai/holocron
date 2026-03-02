import type { Meta, StoryObj } from '@storybook/react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { colors } from '@/lib/theme'

interface ColorSwatchProps {
  name: string
  color: string
}

function ColorSwatch({ name, color }: ColorSwatchProps) {
  return (
    <View style={styles.swatchContainer}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.swatchName}>{name}</Text>
      <Text style={styles.swatchValue}>
        {color.replace('hsl(', '').replace(')', '')}
      </Text>
    </View>
  )
}

function ColorsGallery() {
  const colorGroups = [
    {
      title: 'Primary',
      items: [
        { name: 'primary', color: colors.light.primary },
        { name: 'primaryForeground', color: colors.light.primaryForeground },
      ],
    },
    {
      title: 'Secondary',
      items: [
        { name: 'secondary', color: colors.light.secondary },
        { name: 'secondaryForeground', color: colors.light.secondaryForeground },
      ],
    },
    {
      title: 'Accent',
      items: [
        { name: 'accent', color: colors.light.accent },
        { name: 'accentForeground', color: colors.light.accentForeground },
      ],
    },
    {
      title: 'Muted',
      items: [
        { name: 'muted', color: colors.light.muted },
        { name: 'mutedForeground', color: colors.light.mutedForeground },
      ],
    },
    {
      title: 'Destructive',
      items: [
        { name: 'destructive', color: colors.light.destructive },
        { name: 'destructiveForeground', color: colors.light.destructiveForeground },
      ],
    },
    {
      title: 'Surface',
      items: [
        { name: 'background', color: colors.light.background },
        { name: 'foreground', color: colors.light.foreground },
        { name: 'card', color: colors.light.card },
        { name: 'cardForeground', color: colors.light.cardForeground },
      ],
    },
    {
      title: 'UI',
      items: [
        { name: 'border', color: colors.light.border },
        { name: 'input', color: colors.light.input },
        { name: 'ring', color: colors.light.ring },
      ],
    },
  ]

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Color Palette</Text>
      {colorGroups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.swatchRow}>
            {group.items.map((item) => (
              <ColorSwatch key={item.name} name={item.name} color={item.color} />
            ))}
          </View>
        </View>
      ))}
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
  group: {
    marginBottom: 32,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: 'hsl(215.4, 16.3%, 46.9%)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatchContainer: {
    alignItems: 'center',
    margin: 8,
  },
  swatch: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'hsl(214.3, 31.8%, 91.4%)',
  },
  swatchName: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
    color: 'hsl(222.2, 84%, 4.9%)',
  },
  swatchValue: {
    fontSize: 10,
    color: 'hsl(215.4, 16.3%, 46.9%)',
    marginTop: 2,
  },
})

const meta: Meta = {
  title: 'Design System/Colors',
  component: ColorsGallery,
}

export default meta

type Story = StoryObj

export const Palette: Story = {}
