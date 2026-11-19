import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'

loadEnv({ path: resolve(process.cwd(), '.env') })

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/launchforge.db'),
  DATA_DIR: z.string().default('./data'),
  DEPLOY_DIR: z.string().default('./deployments'),
  PREVIEW_PORT: z.coerce.number().default(3100),
  MAX_ARCHIVE_BYTES: z.coerce.number().default(50 * 1024 * 1024),
  MAX_EXTRACTED_BYTES: z.coerce.number().default(200 * 1024 * 1024),
  MAX_FILE_COUNT: z.coerce.number().default(5000),
  BUILD_TIMEOUT_MS: z.coerce.number().default(120000),
  NODE_ENV: z.string().default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export const env = EnvSchema.parse(process.env)

export const paths = {
  root: process.cwd(),
  dataDir: resolve(process.cwd(), env.DATA_DIR),
  dbPath: resolve(process.cwd(), env.DATABASE_PATH),
  deployDir: resolve(process.cwd(), env.DEPLOY_DIR),
  tmpDir: resolve(process.cwd(), '.tmp'),
  templatesDir: resolve(process.cwd(), 'templates'),
}
