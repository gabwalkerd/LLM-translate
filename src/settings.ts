import type { TranslationMemoryEntry } from './translation/types'

export interface TranslationPluginSettings {
  baseUrl: string
  apiKey: string
  model: string
  targetLanguage: string
  systemPromptTemplate: string
  batchCharLimit: number
  translationMemory: TranslationMemoryState
}

export interface TranslationMemoryState {
  [filePath: string]: {
    [targetLanguage: string]: TranslationMemoryEntry[]
  }
}

export const SETTINGS_VERSION = 2

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
  translationMemory: {},
}
