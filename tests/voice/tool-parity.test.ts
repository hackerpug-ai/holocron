import { describe, it, expect } from 'vitest'
import { agentTools } from '@/convex/chat/tools'
import { TOOL_NAMES } from '@/lib/voice/tool-definitions'

describe('Voice-Text Tool Parity', () => {
  const chatToolNames = Object.keys(agentTools)

  // Tools intentionally excluded from voice
  const VOICE_EXCLUSIONS = ['create_plan']

  // Voice-only tools not in chat
  const VOICE_ONLY = ['navigate_app']

  it('voice tools include all chat tools except exclusions', () => {
    const expectedInVoice = chatToolNames.filter(
      (name) => !VOICE_EXCLUSIONS.includes(name)
    )

    for (const toolName of expectedInVoice) {
      expect(TOOL_NAMES, `Missing chat tool in voice: ${toolName}`).toContain(toolName)
    }
  })

  it('voice-only tools exist', () => {
    for (const toolName of VOICE_ONLY) {
      expect(TOOL_NAMES, `Missing voice-only tool: ${toolName}`).toContain(toolName)
    }
  })

  it('excluded tools are not in voice', () => {
    for (const toolName of VOICE_EXCLUSIONS) {
      expect(TOOL_NAMES, `Excluded tool should not be in voice: ${toolName}`).not.toContain(toolName)
    }
  })

  it('voice tool count matches expected', () => {
    const expected = chatToolNames.length - VOICE_EXCLUSIONS.length + VOICE_ONLY.length
    expect(TOOL_NAMES).toHaveLength(expected)
  })
})
