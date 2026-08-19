import * as z from 'zod/v4'

export const automationSchema = z.object({
  id: z.string().trim().min(1).max(64),
  enabled: z.boolean().default(false),
  prompt: z.string().trim().min(1).max(128),
  classification: z.string().trim().min(1).max(64),
  minConfidence: z.number().min(0).max(1).default(0.9),
  action: z.literal('draft'),
  approval: z.enum(['telegram', 'cli', 'mcp']).default('telegram'),
})

export const automationsConfigSchema = z.object({
  automations: z.array(automationSchema).max(100),
})
export type AutomationsConfig = z.infer<typeof automationsConfigSchema>
