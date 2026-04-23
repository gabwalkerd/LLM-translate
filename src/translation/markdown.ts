import { hashText } from './hash'
import type { ApplyTranslationResult, ExistingTranslation, PlannedEntry, TranslationMemoryEntry, TranslationPlan, TranslationTask } from './types'

interface ParsedBlock {
  kind: 'eligible' | 'raw' | 'legacy-translation'
  body: string
  separator: string
  translationMeta?: {
    lang: string
    sourceHash: string
  }
}

const START_MARKER = /^<!--\s*typora-translate:start\s+lang="([^"]+)"\s+source-hash="([^"]+)"\s*-->$/
const END_MARKER = /^<!--\s*typora-translate:end\s*-->$/

export function buildTranslationPlan(
  markdown: string,
  targetLanguage: string,
  forceRetranslate = false,
  memoryEntries: TranslationMemoryEntry[] = [],
): TranslationPlan {
  const blocks = splitMarkdownIntoBlocks(markdown)
  const entries: PlannedEntry[] = []
  const tasks: TranslationTask[] = []
  let skippedCount = 0
  let eligibleBlockCount = 0
  const rememberedTranslations = new Map(memoryEntries.map(entry => [entry.sourceHash, entry.translatedHash]))
  const rememberedTranslatedHashes = new Set(memoryEntries.map(entry => entry.translatedHash))

  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index]

    if (current.kind !== 'eligible') {
      entries.push({
        kind: 'raw',
        body: current.body,
        separator: current.separator,
      })
      continue
    }

    eligibleBlockCount += 1
    const sourceHash = hashText(current.body)
    const next = blocks[index + 1]
    const nextHash = next?.kind === 'eligible' ? hashText(next.body) : undefined
    const existingTranslation = next?.kind === 'legacy-translation'
      ? toLegacyTranslation(next)
      : next?.kind === 'eligible' && nextHash && (
        rememberedTranslations.get(sourceHash) === nextHash ||
        rememberedTranslatedHashes.has(nextHash)
      )
        ? {
          body: next.body,
          separator: next.separator,
          sourceHash: rememberedTranslations.get(sourceHash) === nextHash ? sourceHash : '__mismatch__',
          lang: targetLanguage,
          translatedHash: nextHash,
          format: 'clean' as const,
        }
        : undefined

    if (existingTranslation) {
      index += 1
    }

    const action = getSourceAction({
      forceRetranslate,
      existingTranslation,
      sourceHash,
      targetLanguage,
    })

    entries.push({
      kind: 'source',
      body: current.body,
      separator: current.separator,
      sourceHash,
      action,
      existingTranslation,
    })

    if (action === 'keep') {
      skippedCount += 1
      continue
    }

    tasks.push({
      sourceText: current.body,
      sourceHash,
    })
  }

  return {
    entries,
    tasks,
    skippedCount,
    eligibleBlockCount,
    targetLanguage,
  }
}

export function applyTranslationResults(plan: TranslationPlan, translatedTexts: string[]): ApplyTranslationResult {
  const queue = [...translatedTexts]
  const chunks: string[] = []
  let translatedCount = 0
  let skippedCount = 0
  const memoryEntries: TranslationMemoryEntry[] = []

  for (const entry of plan.entries) {
    if (entry.kind === 'raw') {
      chunks.push(entry.body, entry.separator)
      continue
    }

    if (entry.action === 'keep' && entry.existingTranslation) {
      skippedCount += 1
      memoryEntries.push({
        sourceHash: entry.sourceHash,
        translatedHash: entry.existingTranslation.translatedHash,
      })
      chunks.push(entry.body, entry.separator, entry.existingTranslation.body, entry.existingTranslation.separator)
      continue
    }

    const translatedText = queue.shift()
    if (!translatedText) {
      throw new Error('Missing translated text for one or more Markdown blocks.')
    }

    translatedCount += 1

    const between = entry.existingTranslation ? entry.separator : '\n\n'
    const after = entry.existingTranslation ? entry.existingTranslation.separator : entry.separator
    const translationBlock = buildTranslationBlock(translatedText, plan.targetLanguage, entry.sourceHash)

    memoryEntries.push({
      sourceHash: entry.sourceHash,
      translatedHash: hashText(translationBlock),
    })
    chunks.push(
      entry.body,
      between,
      translationBlock,
      after,
    )
  }

  if (queue.length > 0) {
    throw new Error('Received more translated texts than expected.')
  }

  return {
    markdown: chunks.join(''),
    translatedCount,
    skippedCount,
    memoryEntries,
  }
}

export function buildStandaloneTranslationMarkdown(plan: TranslationPlan, translatedTexts: string[]) {
  const queue = [...translatedTexts]
  const chunks: string[] = []

  for (const entry of plan.entries) {
    if (entry.kind === 'raw') {
      chunks.push(entry.body, entry.separator)
      continue
    }

    if (entry.action === 'keep' && entry.existingTranslation) {
      chunks.push(entry.existingTranslation.body, entry.existingTranslation.separator)
      continue
    }

    const translatedText = queue.shift()
    if (!translatedText) {
      throw new Error('Missing translated text for one or more Markdown blocks.')
    }

    const after = entry.existingTranslation ? entry.existingTranslation.separator : entry.separator
    chunks.push(
      buildTranslationBlock(translatedText, plan.targetLanguage, entry.sourceHash),
      after,
    )
  }

  if (queue.length > 0) {
    throw new Error('Received more translated texts than expected.')
  }

  return chunks.join('')
}

export function createTranslationBatches(tasks: TranslationTask[], batchCharLimit: number) {
  const batches: TranslationTask[][] = []
  let currentBatch: TranslationTask[] = []
  let currentSize = 0

  for (const task of tasks) {
    const taskSize = task.sourceText.length
    if (currentBatch.length > 0 && currentSize + taskSize > batchCharLimit) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }

    currentBatch.push(task)
    currentSize += taskSize
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

export function buildTranslationBlock(translatedText: string, _lang: string, _sourceHash: string) {
  return translatedText.replace(/\r\n/g, '\n').trim()
}

function getSourceAction(options: {
  forceRetranslate: boolean
  existingTranslation?: ExistingTranslation
  sourceHash: string
  targetLanguage: string
}): SourceEntryAction {
  const { existingTranslation, forceRetranslate, sourceHash, targetLanguage } = options
  if (!existingTranslation) {
    return 'insert'
  }
  if (existingTranslation.format === 'legacy') {
    return 'replace'
  }
  if (forceRetranslate) {
    return 'replace'
  }
  if (existingTranslation.sourceHash === sourceHash && existingTranslation.lang === targetLanguage) {
    return 'keep'
  }
  return 'replace'
}

type SourceEntryAction = 'keep' | 'insert' | 'replace'

export function splitMarkdownIntoBlocks(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const blocks: ParsedBlock[] = []
  const lines = normalized.split('\n')
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]

    if (line.trim() === '') {
      lineIndex += 1
      continue
    }

    const endLineIndex = findBlockEnd(lines, lineIndex)
    const body = lines.slice(lineIndex, endLineIndex + 1).join('\n')
    lineIndex = endLineIndex + 1

    let blankCount = 0
    while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
      blankCount += 1
      lineIndex += 1
    }
    const separator = lineIndex < lines.length
      ? '\n'.repeat(blankCount + 1)
      : '\n'.repeat(blankCount)

    blocks.push(classifyBlock(body, separator))
  }

  return blocks
}

function classifyBlock(body: string, separator: string): ParsedBlock {
  const translationMeta = parseLegacyTranslationMeta(body)
  if (translationMeta) {
    return {
      kind: 'legacy-translation',
      body,
      separator,
      translationMeta,
    }
  }

  if (isEligibleSourceBlock(body)) {
    return {
      kind: 'eligible',
      body,
      separator,
    }
  }

  return {
    kind: 'raw',
    body,
    separator,
  }
}

function parseLegacyTranslationMeta(body: string) {
  const lines = body.split('\n')
  const startMatch = lines[0]?.match(START_MARKER)
  const isClosed = END_MARKER.test(lines.at(-1) ?? '')

  if (!startMatch || !isClosed) {
    return undefined
  }

  return {
    lang: startMatch[1],
    sourceHash: startMatch[2],
  }
}

function toLegacyTranslation(block: ParsedBlock): ExistingTranslation {
  if (block.kind !== 'legacy-translation' || !block.translationMeta) {
    throw new Error('Invalid legacy translation block.')
  }

  const lines = block.body.split('\n')
  const content = lines.slice(1, -1).filter((line, index) => !(index === 0 && line.trim() === '[译]')).join('\n').trim()

  return {
    body: content,
    separator: block.separator,
    sourceHash: block.translationMeta.sourceHash,
    lang: block.translationMeta.lang,
    translatedHash: hashText(content),
    format: 'legacy',
  }
}

function isEligibleSourceBlock(body: string) {
  const trimmed = body.trim()
  if (!trimmed) {
    return false
  }

  const lines = body.split('\n')
  const firstLine = lines[0].trim()

  if (isFrontMatter(lines)) return false
  if (isFenceStart(firstLine)) return false
  if (isMathBlock(lines)) return false
  if (isHtmlBlock(firstLine)) return false
  if (isIndentedCodeBlock(lines)) return false

  return true
}

function isFrontMatter(lines: string[]) {
  return lines[0] === '---' && lines.length > 1 && lines.includes('---', 1)
}

function isFenceStart(line: string) {
  return /^(```|~~~)/.test(line)
}

function isMathBlock(lines: string[]) {
  return lines[0].trim() === '$$' && lines.at(-1)?.trim() === '$$'
}

function isHtmlBlock(line: string) {
  return /^<\/?[A-Za-z][^>]*>$/.test(line)
}

function isIndentedCodeBlock(lines: string[]) {
  return lines.every(line => line.trim() === '' || (/^( {4,}|\t)/.test(line) && !/^( {0,3}[-+*]|\d+\.)\s/.test(line)))
}

function findBlockEnd(lines: string[], startIndex: number) {
  const firstLine = lines[startIndex]
  const trimmed = firstLine.trim()

  if (startIndex === 0 && trimmed === '---') {
    const frontMatterEnd = findClosingMarker(lines, startIndex + 1, '---')
    if (frontMatterEnd !== -1) {
      return frontMatterEnd
    }
  }

  if (isFenceStart(trimmed)) {
    const marker = trimmed.slice(0, 3)
    const fenceEnd = findFenceEnd(lines, startIndex + 1, marker)
    return fenceEnd === -1 ? lines.length - 1 : fenceEnd
  }

  if (trimmed === '$$') {
    const mathEnd = findClosingMarker(lines, startIndex + 1, '$$')
    return mathEnd === -1 ? lines.length - 1 : mathEnd
  }

  if (START_MARKER.test(trimmed)) {
    const translationEnd = findTranslationEnd(lines, startIndex + 1)
    return translationEnd === -1 ? lines.length - 1 : translationEnd
  }

  let lineIndex = startIndex + 1
  while (lineIndex < lines.length && lines[lineIndex].trim() !== '') {
    lineIndex += 1
  }
  return lineIndex - 1
}

function findClosingMarker(lines: string[], startIndex: number, marker: string) {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    if (lines[lineIndex].trim() === marker) {
      return lineIndex
    }
  }
  return -1
}

function findFenceEnd(lines: string[], startIndex: number, marker: string) {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    if (lines[lineIndex].trim().startsWith(marker)) {
      return lineIndex
    }
  }
  return -1
}

function findTranslationEnd(lines: string[], startIndex: number) {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    if (END_MARKER.test(lines[lineIndex].trim())) {
      return lineIndex
    }
  }
  return -1
}
