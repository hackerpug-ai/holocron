/**
 * ReportOutline Component
 *
 * Displays research reports in a collapsible outline format.
 * Sections (## headings) can be expanded/collapsed by tapping headers.
 * Supports expand/collapse all functionality.
 *
 * AC-1: Report displays in collapsible outline format by default
 * AC-2: Tapping header expands collapsed section
 * AC-3: Tapping header collapses expanded section
 * AC-4: Expand/collapse all buttons toggle all sections
 */

import React, { useState } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { ChevronDown, ChevronUp, Plus } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export interface ReportOutlineProps {
  /** Markdown content to render as outline */
  content: string
  /** Optional test ID prefix */
  testID?: string
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean
  /** Optional class name */
  className?: string
}

/**
 * Parse markdown into outline structure
 */
interface OutlineSection {
  id: string
  title: string
  level: number
  content: string
  children: OutlineSection[]
}

function parseMarkdownToOutline(markdown: string): OutlineSection[] {
  const lines = markdown.split('\n')
  const sections: OutlineSection[] = []
  let currentSection: OutlineSection | null = null
  let currentContent: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this is a heading (## or ###)
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/)
    if (headingMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim()
        sections.push(currentSection)
      }

      // Start new section
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      currentSection = {
        id: `section-${sections.length + 1}`,
        title,
        level,
        content: '',
        children: [],
      }
      currentContent = []
    } else if (currentSection) {
      // Add content to current section
      currentContent.push(line)
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim()
    sections.push(currentSection)
  }

  return sections
}

/**
 * SectionHeader component for collapsible sections
 */
interface SectionHeaderProps {
  title: string
  isExpanded: boolean
  onToggle: () => void
  testID?: string
}

function SectionHeader({ title, isExpanded, onToggle, testID }: SectionHeaderProps) {
  return (
    <Pressable
      onPress={onToggle}
      testID={testID}
      className="flex-row items-center justify-between bg-muted/50 px-4 py-3 border-b border-border"
    >
      <Text className="text-foreground font-semibold flex-1" variant="h3">
        {title}
      </Text>
      {isExpanded ? (
        <ChevronUp size={20} className="text-muted-foreground" />
      ) : (
        <ChevronDown size={20} className="text-muted-foreground" />
      )}
    </Pressable>
  )
}

/**
 * SectionContent component for section body
 */
interface SectionContentProps {
  content: string
  isExpanded: boolean
  testID?: string
}

function SectionContent({ content, isExpanded, testID }: SectionContentProps) {
  if (!isExpanded || !content) {
    return null
  }

  return (
    <View testID={testID} className="px-4 py-3 bg-card">
      <Text className="text-foreground leading-relaxed">
        {content}
      </Text>
    </View>
  )
}

/**
 * ReportOutline main component
 */
export function ReportOutline({
  content,
  testID = 'report-outline',
  defaultExpanded = false,
  className,
}: ReportOutlineProps) {
  const sections = parseMarkdownToOutline(content)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    defaultExpanded ? new Set(sections.map(s => s.id)) : new Set()
  )

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSections(new Set(sections.map(s => s.id)))
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
  }

  if (sections.length === 0) {
    return (
      <View testID={testID} className={cn('p-4', className)}>
        <Text className="text-muted-foreground text-center">
          No sections found in report
        </Text>
      </View>
    )
  }

  return (
    <View testID={testID} className={cn('flex-1', className)}>
      {/* Expand/Collapse All Buttons */}
      {sections.length > 1 && (
        <View className="flex-row gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <Pressable
            onPress={expandAll}
            testID={`${testID}-expand-all`}
            className="flex-row items-center gap-1 px-3 py-1.5 bg-primary/10 rounded-md"
          >
            <Plus size={16} className="text-primary" />
            <Text className="text-primary text-sm font-medium">Expand All</Text>
          </Pressable>
          <Pressable
            onPress={collapseAll}
            testID={`${testID}-collapse-all`}
            className="flex-row items-center gap-1 px-3 py-1.5 bg-muted rounded-md"
          >
            <ChevronUp size={16} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm font-medium">Collapse All</Text>
          </Pressable>
        </View>
      )}

      {/* Sections */}
      <ScrollView>
        {sections.map((section, index) => {
          const sectionNumber = index + 1
          const isExpanded = expandedSections.has(section.id)

          return (
            <View
              key={section.id}
              testID={`${testID}-section-${sectionNumber}`}
              className="mb-2 border border-border rounded-lg overflow-hidden bg-card"
            >
              <SectionHeader
                title={section.title}
                isExpanded={isExpanded}
                onToggle={() => toggleSection(section.id)}
                testID={`${testID}-section-${sectionNumber}-header`}
              />
              <SectionContent
                content={section.content}
                isExpanded={isExpanded}
                testID={`${testID}-section-${sectionNumber}-content`}
              />
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}
