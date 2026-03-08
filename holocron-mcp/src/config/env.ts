import { z } from 'zod'

const EnvSchema = z.object({
  CONVEX_URL: z.string().url(),
  CONVEX_DEPLOY_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

type Env = z.infer<typeof EnvSchema>

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('Environment validation failed:', parsed.error.format())
    process.exit(1)
  }

  return parsed.data
}

export const env = loadEnv()
