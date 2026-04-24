import type { TranslationMemoryEntry } from './translation/types'

export interface TranslationPluginSettings {
  baseUrl: string
  apiKey: string
  model: string
  targetLanguage: string
  systemPromptTemplate: string
  batchCharLimit: number
  autoTranslateSelection: boolean
  autoTranslateDelayMs: number
  translationMemory: TranslationMemoryState
}

export interface TranslationMemoryState {
  [filePath: string]: {
    [targetLanguage: string]: TranslationMemoryEntry[]
  }
}

export const SETTINGS_VERSION = 3
export const MAX_AUTO_TRANSLATE_DELAY_MS = 2000

export const DEFAULT_PROMPT_TEMPLATE = [
  'You are a professional translation engine.',
  'Translate each Markdown block into {targetLanguage}.',
  'Preserve Markdown structure, tables, links, emphasis, inline code, and list markers.',
  'Translate only natural language text. Keep code, formulas, and identifiers unchanged. Do not explain your work.',
  'Return only a valid JSON array of translated strings in the same order as the input.',
].join(' ')

export const DEFAULT_SETTINGS: TranslationPluginSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  targetLanguage: 'zh-CN',
  systemPromptTemplate: DEFAULT_PROMPT_TEMPLATE,
  batchCharLimit: 4000,
  autoTranslateSelection: false,
  autoTranslateDelayMs: 300,
  translationMemory: {},
}

export function normalizeAutoTranslateDelayMs(value: number | string | undefined) {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseInt(String(value ?? ''), 10)

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.autoTranslateDelayMs
  }

  return Math.max(0, Math.min(MAX_AUTO_TRANSLATE_DELAY_MS, Math.round(parsed)))
}
