import { describe, it, expect } from 'vitest'
import { computeNarrationMap } from '../../lib/mdast-utils'
import type { Root } from 'mdast'

// Helper to build a minimal MDAST Root with typed children
 
function makeAst(children: any[]): Root {
  return { type: 'root', children } as Root
}

function textNode(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] }
}

function headingNode(text: string, depth = 1) {
  return { type: 'heading', depth, children: [{ type: 'text', value: text }] }
}

function codeNode(value: string) {
  return { type: 'code', value }
}

function htmlNode(value: string) {
  return { type: 'html', value }
}

// Image-only paragraph: paragraph > image (image has no text value for extractTextFromNode)
function imageOnlyNode() {
  return { type: 'paragraph', children: [{ type: 'image', url: 'https://example.com/img.png', alt: 'photo' }] }
}

describe('computeNarrationMap', () => {
  it('maps simple document 1:1', () => {
    const ast = makeAst([
      headingNode('Title'),
      textNode('First paragraph.'),
      textNode('Second paragraph.'),
    ])
    const backendParagraphs = [
      { index: 0, text: 'Title' },
      { index: 1, text: 'First paragraph.' },
      { index: 2, text: 'Second paragraph.' },
    ]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.get(0)).toBe(0) // heading → backend 0
    expect(map.get(1)).toBe(1) // para 1 → backend 1
    expect(map.get(2)).toBe(2) // para 2 → backend 2
    expect(map.size).toBe(3)
  })

  it('skips code blocks (no mapping for code nodes)', () => {
    const ast = makeAst([
      textNode('Before code.'),
      codeNode('console.log("hello")'),
      textNode('After code.'),
    ])
    const backendParagraphs = [
      { index: 0, text: 'Before code.' },
      { index: 1, text: 'After code.' },
    ]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.get(0)).toBe(0) // before code → backend 0
    expect(map.has(1)).toBe(false) // code node → no mapping
    expect(map.get(2)).toBe(1) // after code → backend 1
  })

  it('skips image-only paragraphs that produce no text', () => {
    const ast = makeAst([
      textNode('Before image.'),
      imageOnlyNode(),
      textNode('After image.'),
    ])
    const backendParagraphs = [
      { index: 0, text: 'Before image.' },
      { index: 1, text: 'After image.' },
    ]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.get(0)).toBe(0) // before → backend 0
    expect(map.has(1)).toBe(false) // image → no mapping (no text)
    expect(map.get(2)).toBe(1) // after → backend 1
  })

  it('handles HTML blocks that backend strips', () => {
    // HTML nodes have a 'value' property with the raw HTML
    // extractTextFromNode will return the raw HTML string
    // But backend strips HTML tags, so the text won't match
    const ast = makeAst([
      textNode('Before HTML.'),
      htmlNode('<div class="widget">Embedded</div>'),
      textNode('After HTML.'),
    ])
    // Backend strips HTML tags: '<div class="widget">Embedded</div>' → 'Embedded'
    // But that becomes part of a paragraph if surrounded by text, or its own block
    const backendParagraphs = [
      { index: 0, text: 'Before HTML.' },
      { index: 1, text: 'Embedded' },
      { index: 2, text: 'After HTML.' },
    ]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.get(0)).toBe(0) // before → backend 0
    // HTML node text '<div class="widget">Embedded</div>' won't match 'Embedded' after normalization
    // So it should be skipped or matched via scan-ahead
    expect(map.get(2)).toBe(2) // after → backend 2
  })

  it('handles heading prefix stripping', () => {
    const ast = makeAst([
      headingNode('Introduction'),
      textNode('Content here.'),
    ])
    // Backend strips heading prefix: '# Introduction' → 'Introduction'
    const backendParagraphs = [
      { index: 0, text: 'Introduction' },
      { index: 1, text: 'Content here.' },
    ]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.get(0)).toBe(0)
    expect(map.get(1)).toBe(1)
  })

  it('handles empty backend paragraphs gracefully', () => {
    const ast = makeAst([textNode('Some text.')])
    const backendParagraphs: { index: number; text: string }[] = []

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.size).toBe(0)
  })

  it('handles empty AST gracefully', () => {
    const ast = makeAst([])
    const backendParagraphs = [{ index: 0, text: 'Orphaned.' }]

    const map = computeNarrationMap(ast, backendParagraphs)
    expect(map.size).toBe(0)
  })
})
