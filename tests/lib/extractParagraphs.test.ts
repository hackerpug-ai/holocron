import { describe, it, expect } from 'vitest'
import { extractParagraphs, extractParagraphCount } from '../../lib/extractParagraphs'

describe('extractParagraphs', () => {
  it('extracts basic paragraphs', () => {
    const md = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'First paragraph.' },
      { index: 1, text: 'Second paragraph.' },
      { index: 2, text: 'Third paragraph.' },
    ])
  })

  it('strips fenced code blocks', () => {
    const md = 'Before code.\n\n```js\nconsole.log("hello")\n```\n\nAfter code.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'Before code.' },
      { index: 1, text: 'After code.' },
    ])
  })

  it('strips inline images', () => {
    const md = 'Text before.\n\n![Alt text](https://example.com/image.png)\n\nText after.'
    const result = extractParagraphs(md)
    // Image-only paragraph becomes empty after stripping → skipped
    expect(result).toEqual([
      { index: 0, text: 'Text before.' },
      { index: 1, text: 'Text after.' },
    ])
  })

  it('strips HTML tags', () => {
    const md = 'Normal text.\n\n<div>HTML content</div>\n\nMore text.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'Normal text.' },
      { index: 1, text: 'HTML content' },
      { index: 2, text: 'More text.' },
    ])
  })

  it('strips heading prefix', () => {
    const md = '# Main Title\n\nSome content.\n\n## Sub Heading\n\nMore content.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'Main Title' },
      { index: 1, text: 'Some content.' },
      { index: 2, text: 'Sub Heading' },
      { index: 3, text: 'More content.' },
    ])
  })

  it('collapses internal newlines in paragraphs', () => {
    const md = 'Line one\nline two\nline three.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'Line one line two line three.' },
    ])
  })

  it('skips empty blocks', () => {
    const md = 'First.\n\n\n\n\n\nSecond.'
    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'First.' },
      { index: 1, text: 'Second.' },
    ])
  })

  it('handles mixed content with sequential indices', () => {
    const md = [
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '```python',
      'print("hello")',
      '```',
      '',
      '![screenshot](img.png)',
      '',
      'After image.',
      '',
      '## Section Two',
      '',
      'Final paragraph.',
    ].join('\n')

    const result = extractParagraphs(md)
    expect(result).toEqual([
      { index: 0, text: 'Title' },
      { index: 1, text: 'Intro paragraph.' },
      { index: 2, text: 'After image.' },
      { index: 3, text: 'Section Two' },
      { index: 4, text: 'Final paragraph.' },
    ])
    // Indices are sequential with no gaps
    expect(result.map(r => r.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('handles empty markdown', () => {
    expect(extractParagraphs('')).toEqual([])
  })
})

describe('extractParagraphCount', () => {
  it('returns correct count matching extractParagraphs length', () => {
    const md = '# Title\n\nParagraph.\n\n```code```\n\nAnother.'
    expect(extractParagraphCount(md)).toBe(extractParagraphs(md).length)
  })
})
