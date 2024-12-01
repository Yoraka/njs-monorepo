import { promises as fs } from 'fs'
import { parse } from 'json5'
import type { JsonConfig } from '@/types/proxy-config'

export async function getProxyConfig(): Promise<JsonConfig> {
  const configPath = process.env.PROXY_CONFIG_PATH
  if (!configPath) {
    throw new Error('PROXY_CONFIG_PATH environment variable is not set')
  }

  const fileContent = await fs.readFile(configPath, 'utf-8')
  return parse(fileContent) as JsonConfig
}