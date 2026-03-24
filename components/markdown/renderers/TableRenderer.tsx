import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { theme } from '@/lib/theme'
import type { Table, TableRow, TableCell } from 'mdast'
import * as React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

/**
 * TableRenderer handles GitHub Flavored Markdown tables
 * Editorial design with horizontal dividers only, refined typography
 *
 * Layout strategy:
 * 1. Calculate column widths from the MDAST node directly (not React children)
 * 2. Apply consistent widths to all cells in the same column
 * 3. Set explicit table width to enable proper horizontal scrolling
 */

interface TableProps {
  node: Table
  children: React.ReactNode
  testID?: string
}

interface TableContextValue {
  columnWidths: number[]
}

const TableContext = React.createContext<TableContextValue | null>(null)

const COLUMN_MIN_WIDTH = 100
const COLUMN_PADDING = 32 // paddingHorizontal * 2 + some buffer
const CHAR_WIDTH = 8.5 // average character width in pixels

/**
 * Extract plain text from MDAST node recursively
 */
function extractTextFromNode(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.value || ''
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(extractTextFromNode).join('')
  }
  return ''
}

export const TableRenderer = React.memo(({ node, children, testID }: TableProps) => {
  const { colors, spacing, radius } = useTheme()
  const styles = useStyles()

  // Calculate column widths from MDAST node directly
  const columnWidths = React.useMemo(() => {
    if (!node.children || node.children.length === 0) return []

    // Collect all text for each column
    const allColumns: string[][] = []

    node.children.forEach((row) => {
      if (row.type === 'tableRow' && row.children) {
        row.children.forEach((cell, colIndex) => {
          if (!allColumns[colIndex]) allColumns[colIndex] = []
          const cellText = extractTextFromNode(cell)
          allColumns[colIndex].push(cellText)
        })
      }
    })

    // Calculate width for each column based on longest content
    return allColumns.map((columnCells) => {
      const longestText = columnCells.reduce((longest, text) =>
        text.length > longest.length ? text : longest, ''
      )
      // Estimate width: character count * average char width + padding
      const estimatedWidth = Math.max(
        COLUMN_MIN_WIDTH,
        longestText.length * CHAR_WIDTH + COLUMN_PADDING
      )
      return Math.ceil(estimatedWidth)
    })
  }, [node])

  // Calculate total table width (minimum of container width handled by flex)
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0)

  return (
    <View
      testID={testID}
      style={[
        styles.tableContainer,
        {
          marginVertical: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={[styles.table, { minWidth: tableWidth }]}>
          <TableContext.Provider value={{ columnWidths }}>
            {children}
          </TableContext.Provider>
        </View>
      </ScrollView>
    </View>
  )
})
TableRenderer.displayName = 'TableRenderer'

interface TableRowProps {
  node: TableRow
  children: React.ReactNode
  isHeader?: boolean
  testID?: string
}

export const TableRowRenderer = React.memo(
  ({ node: _node, children, isHeader, testID }: TableRowProps) => {
    const { colors } = useTheme()
    const styles = useStyles()

    return (
      <View
        testID={testID}
        style={[
          styles.row,
          {
            borderBottomWidth: isHeader ? 2 : 1,
            borderBottomColor: colors.border,
            backgroundColor: isHeader ? colors.muted : 'transparent',
          },
        ]}
      >
        {children}
      </View>
    )
  }
)
TableRowRenderer.displayName = 'TableRowRenderer'

interface TableCellProps {
  node: TableCell
  children: React.ReactNode
  isHeader?: boolean
  testID?: string
  columnIndex?: number
}

export const TableCellRenderer = React.memo(
  ({ node: _node, children, isHeader, testID, columnIndex = 0 }: TableCellProps) => {
    const { colors, spacing } = useTheme()
    const styles = useStyles()
    const context = React.useContext(TableContext)

    const typo = isHeader ? theme.typography.body : theme.typography.bodySmall

    // Get column width from context, fallback to minimum
    const columnWidth = context?.columnWidths[columnIndex] || COLUMN_MIN_WIDTH

    return (
      <View
        testID={testID}
        style={[
          styles.cell,
          {
            width: columnWidth,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <Text
          style={{
            color: isHeader ? colors.tableHeader : colors.tableBody,
            fontWeight: isHeader ? '600' : '400',
            fontSize: typo.fontSize,
            lineHeight: typo.fontSize * typo.lineHeight,
          }}
          numberOfLines={0}
        >
          {children}
        </Text>
      </View>
    )
  }
)
TableCellRenderer.displayName = 'TableCellRenderer'

const useStyles = () => {
  return StyleSheet.create({
    tableContainer: {
      width: '100%',
    },
    table: {
      flexDirection: 'column',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cell: {
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
  })
}
