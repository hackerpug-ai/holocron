/**
 * Agent Client for Zai LLM API
 *
 * Provides a type-safe client wrapper for interacting with the Zai LLM API
 * in Supabase Edge Functions. Supports simple text completions, structured
 * JSON responses with schema validation, and streaming responses.
 *
 * @example
 * ```ts
 * const client = new AgentClient()
 * const response = await client.chat('Hello, world!')
 * console.log(response.content)
 *
 * const structured = await client.chatStructured(
 *   'Extract key facts',
 *   { type: 'object', properties: { facts: { type: 'array' } } }
 * )
 * ```
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see supabase/functions/deep-research-iterate/index.ts
 */

// ============================================================
// Constants
// ============================================================

/**
 * Default base URL for Zai LLM API
 * Can be overridden via constructor or ZAI_BASE_URL environment variable
 */
export const ZAI_BASE_URL = 'https://api.zai.ai/v1'

/**
 * Default model identifier for Zai LLM API
 * Can be overridden via constructor or ZAI_MODEL environment variable
 */
export const ZAI_MODEL = 'zai-1'

// ============================================================
// Types
// ============================================================

/**
 * Chat message role
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * Chat message in the conversation
 */
export interface ChatMessage {
  role: MessageRole
  content: string
}

/**
 * Simple chat response
 */
export interface ChatResponse {
  content: string
  model: string
  finishReason: 'stop' | 'length' | 'content_filter'
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * JSON Schema definition for structured outputs
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  additionalProperties?: boolean
  description?: string
}

/**
 * Structured chat response with validated JSON
 */
export interface StructuredChatResponse<T = unknown> extends ChatResponse {
  data: T
}

/**
 * Streaming chat chunk
 */
export interface ChatChunk {
  content: string
  done: boolean
  model: string
}

/**
 * Error response from API
 */
interface APIError {
  error: {
    message: string
    type: string
    code?: string
  }
}

/**
 * Configuration options for AgentClient
 */
export interface AgentClientConfig {
  baseUrl?: string
  model?: string
  apiKey?: string
  timeout?: number
  maxRetries?: number
}

// ============================================================
// Agent Client Class
// ============================================================

/**
 * Client for interacting with Zai LLM API
 *
 * Supports three modes of operation:
 * - chat(): Simple text completions
 * - chatStructured(): JSON responses with schema validation
 * - chatStream(): Streaming responses as AsyncGenerator
 */
export class AgentClient {
  private readonly baseUrl: string
  private readonly model: string
  private readonly apiKey: string | null
  private readonly timeout: number
  private readonly maxRetries: number

  constructor(config?: AgentClientConfig) {
    // Priority: constructor arg > env var > default
    this.baseUrl = config?.baseUrl ?? Deno.env.get('ZAI_BASE_URL') ?? ZAI_BASE_URL
    this.model = config?.model ?? Deno.env.get('ZAI_MODEL') ?? ZAI_MODEL
    this.apiKey = config?.apiKey ?? Deno.env.get('ZAI_API_KEY') ?? null
    this.timeout = config?.timeout ?? 30000 // 30 seconds default
    this.maxRetries = config?.maxRetries ?? 3
  }

  // ============================================================
  // Simple Chat
  // ============================================================

  /**
   * Send a simple text prompt and get a text completion
   *
   * @param prompt - The user prompt to send
   * @param system - Optional system message to set context
   * @returns Promise with chat response containing generated text
   *
   * @example
   * ```ts
   * const response = await client.chat('Explain quantum computing')
   * console.log(response.content)
   * ```
   */
  async chat(prompt: string, system?: string): Promise<ChatResponse> {
    const messages: ChatMessage[] = []

    if (system) {
      messages.push({ role: 'system', content: system })
    }

    messages.push({ role: 'user', content: prompt })

    return this.makeRequest<ChatResponse>('/chat/completions', {
      messages,
      model: this.model,
      stream: false,
    })
  }

  // ============================================================
  // Structured Chat
  // ============================================================

  /**
   * Send a prompt and get a structured JSON response validated against a schema
   *
   * @param prompt - The user prompt to send
   * @param schema - JSON Schema for response validation
   * @param system - Optional system message to set context
   * @returns Promise with validated structured data
   *
   * @example
   * ```ts
   * const response = await client.chatStructured(
   *   'Extract key facts from this text',
   *   {
   *     type: 'object',
   *     properties: {
   *       facts: { type: 'array', items: { type: 'string' } },
   *       confidence: { type: 'number' }
   *     },
   *     required: ['facts', 'confidence']
   *   }
   * )
   * console.log(response.data.facts)
   * ```
   */
  async chatStructured<T>(
    prompt: string,
    schema: JSONSchema,
    system?: string
  ): Promise<StructuredChatResponse<T>> {
    const messages: ChatMessage[] = []

    if (system) {
      messages.push({ role: 'system', content: system })
    }

    messages.push({ role: 'user', content: prompt })

    const response = await this.makeRequest<StructuredChatResponse<T>>('/chat/completions', {
      messages,
      model: this.model,
      response_format: {
        type: 'json_schema',
        json_schema: schema,
      },
      stream: false,
    })

    return response
  }

  // ============================================================
  // Streaming Chat
  // ============================================================

  /**
   * Send a prompt and stream the response as an AsyncGenerator
   *
   * @param prompt - The user prompt to send
   * @param system - Optional system message to set context
   * @returns AsyncGenerator yielding chat chunks
   *
   * @example
   * ```ts
   * for await (const chunk of await client.chatStream('Tell me a story')) {
   *   process.stdout.write(chunk.content)
   *   if (chunk.done) break
   * }
   * ```
   */
  async chatStream(
    prompt: string,
    system?: string
  ): Promise<AsyncGenerator<ChatChunk>> {
    const messages: ChatMessage[] = []

    if (system) {
      messages.push({ role: 'system', content: system })
    }

    messages.push({ role: 'user', content: prompt })

    const response = await this.fetchStream('/chat/completions', {
      messages,
      model: this.model,
      stream: true,
    })

    return this.streamGenerator(response)
  }

  // ============================================================
  // HTTP Client Methods
  // ============================================================

  /**
   * Make a non-streaming API request with retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetch(endpoint, body, false)

        if (!response.ok) {
          const errorData: APIError = await response.json().catch(() => ({
            error: { message: response.statusText, type: 'unknown' }
          }))
          throw new AgentClientError(
            errorData.error.message,
            errorData.error.type,
            response.status,
            errorData.error.code
          )
        }

        return await response.json() as T
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (lastError instanceof AgentClientError) {
          const isClientError = lastError.status >= 400 && lastError.status < 500
          const isRateLimit = lastError.status === 429

          if (isClientError && !isRateLimit) {
            throw lastError
          }
        }

        // Exponential backoff before retry
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new AgentClientError('Max retries exceeded', 'retry_error')
  }

  /**
   * Make a streaming API request
   */
  private async fetchStream(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    return this.fetch(endpoint, body, true)
  }

  /**
   * Core fetch implementation
   */
  private fetch(
    endpoint: string,
    body: Record<string, unknown>,
    stream: boolean
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))
  }

  /**
   * Convert streaming response to AsyncGenerator
   */
  private async *streamGenerator(response: Response): AsyncGenerator<ChatChunk> {
    if (!response.ok) {
      const errorData: APIError = await response.json().catch(() => ({
        error: { message: response.statusText, type: 'unknown' }
      }))
      throw new AgentClientError(
        errorData.error.message,
        errorData.error.type,
        response.status,
        errorData.error.code
      )
    }

    if (!response.body) {
      throw new AgentClientError('Response body is empty', 'empty_response')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          yield { content: '', done: true, model: this.model }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            yield { content: '', done: true, model: this.model }
            return
          }

          try {
            const chunk = JSON.parse(data)
            const content = chunk.choices?.[0]?.delta?.content || ''
            const finishReason = chunk.choices?.[0]?.finish_reason

            yield {
              content,
              done: finishReason === 'stop',
              model: chunk.model || this.model,
            }

            if (finishReason === 'stop') return
          } catch {
            // Skip invalid JSON lines
            continue
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

// ============================================================
// Error Classes
// ============================================================

/**
 * Custom error class for AgentClient errors
 */
export class AgentClientError extends Error {
  constructor(
    message: string,
    public type: string,
    public status?: number,
    public code?: string
  ) {
    super(message)
    this.name = 'AgentClientError'
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Create a default AgentClient instance
 *
 * Uses environment variables or defaults for configuration
 */
export function createAgentClient(config?: AgentClientConfig): AgentClient {
  return new AgentClient(config)
}

/**
 * Check if Zai API credentials are available
 *
 * @returns true if API key is configured
 */
export function hasZaiCredentials(): boolean {
  return !!Deno.env.get('ZAI_API_KEY')
}
