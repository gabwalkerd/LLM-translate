export interface TranslationTask {
  sourceText: string
  sourceHash: string
}

export interface TranslationBatch {
  tasks: TranslationTask[]
}

export interface TranslationPlan {
  entries: PlannedEntry[]
  tasks: TranslationTask[]
  skippedCount: number
  eligibleBlockCount: number
  targetLanguage: string
}

export type PlannedEntry = RawEntry | SourceEntry

export interface RawEntry {
  kind: 'raw'
  body: string
  separator: string
}

export interface SourceEntry {
  kind: 'source'
  body: string
  separator: string
  sourceHash: string
  action: 'keep' | 'insert' | 'replace'
  existingTranslation?: ExistingTranslation
}

export interface ExistingTranslation {
  body: string
  separator: string
  sourceHash: string
  lang: string
}

export interface ApplyTranslationResult {
  markdown: string
  translatedCount: number
  skippedCount: number
}
