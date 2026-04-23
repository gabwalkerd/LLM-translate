import type { TranslationPluginSettings } from '../settings'
import { createTranslationBatches } from './markdown'
import type { TranslationTask } from './types'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string, text?: string }>
    }
  }>
}

export async function translateInBatches(
  settings: TranslationPluginSettings,
  tasks: TranslationTask[],
  fetchImpl: typeof fetch = fetch,
) {
  const batches = createTranslationBatches(tasks, settings.batchCharLimit)
  const translatedTexts: string[] = []

  for (const batch of batches) {
    const items = await translateBatch(settings, batch, fetchImpl)
    translatedTexts.push(...items)
  }

  return translatedTexts
}

export async function translateBatch(
  settings: TranslationPluginSettings,
  tasks: TranslationTask[],
  fetchImpl: typeof fetch = fetch,
) {
  const endpoint = resolveChatCompletionEndpoint(settings.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: renderPromptTemplate(settings.systemPromptTemplate, settings.targetLanguage),
          },
          {
            role: 'user',
            content: JSON.stringify({
              targetLanguage: settings.targetLanguage,
              items: tasks.map((task, index) => ({
                index,
                markdown: task.sourceText,
              })),
            }),
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }

    const json = await response.json() as ChatCompletionResponse
    const content = extractAssistantContent(json)
    const translations = parseTranslationArray(content)

    if (translations.length !== tasks.length) {
      throw new Error(`Expected ${tasks.length} translations but received ${translations.length}.`)
    }

    if (translations.some(item => item.trim() === '')) {
      throw new Error('The model returned one or more empty translations.')
    }

    return translations
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The translation request timed out.')
    }
    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}

export function resolveChatCompletionEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('Base URL is empty.')
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed
  }
  if (/\/v\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`
  }
  return `${trimmed}/chat/completions`
}

export function renderPromptTemplate(template: string, targetLanguage: string) {
  return template.replace(/\{targetLanguage\}/g, targetLanguage)
}

export function extractAssistantContent(response: ChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('The API response did not include assistant content.')
  }
  if (typeof content === 'string') {
    return content
  }
  const text = content
    .map(part => part.text ?? '')
    .join('')
    .trim()
  if (!text) {
    throw new Error('The API response did not include readable assistant text.')
  }
  return text
}

export function parseTranslationArray(content: string) {
  const stripped = stripCodeFence(content.trim())
  const parsed = JSON.parse(stripped) as string[] | { translations?: string[] }

  if (Array.isArray(parsed)) {
    return parsed
  }
  if (Array.isArray(parsed.translations)) {
    return parsed.translations
  }
  throw new Error('The model response was not a JSON array of strings.')
}

function stripCodeFence(content: string) {
  if (!content.startsWith('```')) {
    return content
  }
  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}
