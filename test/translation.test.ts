import test from 'node:test'
import assert from 'node:assert/strict'
import { extractAssistantContent, parseTranslationArray, renderPromptTemplate, resolveChatCompletionEndpoint } from '../src/translation/api'
import { applyTranslationResults, buildTranslationPlan, buildTranslationBlock, createTranslationBatches } from '../src/translation/markdown'
import { hashText } from '../src/translation/hash'

test('buildTranslationPlan detects eligible blocks and inserts translations after them', () => {
  const markdown = [
    '# Heading',
    '',
    'Paragraph text',
    '',
    '| Name | Description |',
    '| --- | --- |',
    '| API | OpenAI compatible |',
    '',
    '```ts',
    'const x = 1',
    '```',
    '',
    '- List item',
  ].join('\n')

  const plan = buildTranslationPlan(markdown, 'zh-CN', false)

  assert.equal(plan.eligibleBlockCount, 4)
  assert.equal(plan.tasks.length, 4)
})

test('existing translation with matching hash is skipped', () => {
  const sourceHash = hashText('Hello')
  const rebuilt = buildTranslationBlock('你好', 'zh-CN', sourceHash)
  const sourceMarkdown = ['Hello', '', rebuilt].join('\n')
  const plan = buildTranslationPlan(sourceMarkdown, 'zh-CN', false)

  assert.equal(plan.tasks.length, 0)
  assert.equal(plan.skippedCount, 1)
})

test('changed source replaces old translation instead of duplicating it', () => {
  const oldBlock = buildTranslationBlock('旧译文', 'zh-CN', 'deadbeef')
  const markdown = [
    'Hello world',
    '',
    oldBlock,
    '',
    'Next paragraph',
  ].join('\n')

  const plan = buildTranslationPlan(markdown, 'zh-CN', false)
  const result = applyTranslationResults(plan, ['你好，世界', '下一段'])

  assert.match(result.markdown, new RegExp(`source-hash="${hashText('Hello world')}"`))
  assert.match(result.markdown, /Hello world\n\n<!-- typora-translate:start/)
  assert.equal((result.markdown.match(/typora-translate:start/g) ?? []).length, 2)
  assert.equal(result.translatedCount, 2)
})

test('translation blocks can contain tables and are still parsed as a single managed block', () => {
  const sourceTable = [
    '| Name | Description |',
    '| --- | --- |',
    '| API | Compatible endpoint |',
  ].join('\n')
  const block = buildTranslationBlock([
    '| 名称 | 描述 |',
    '| --- | --- |',
    '| API | 兼容接口 |',
  ].join('\n'), 'zh-CN', hashText(sourceTable))

  const markdown = [
    sourceTable,
    '',
    block,
    '',
    'Next paragraph',
  ].join('\n')

  const plan = buildTranslationPlan(markdown, 'zh-CN', false)

  assert.equal(plan.tasks.length, 1)
  assert.equal(plan.skippedCount, 1)
})

test('createTranslationBatches preserves order and size boundaries', () => {
  const batches = createTranslationBatches([
    { sourceText: '1234', sourceHash: '1' },
    { sourceText: '12', sourceHash: '2' },
    { sourceText: '12345', sourceHash: '3' },
  ], 6)

  assert.equal(batches.length, 2)
  assert.deepEqual(batches[0].map(item => item.sourceHash), ['1', '2'])
  assert.deepEqual(batches[1].map(item => item.sourceHash), ['3'])
})

test('parseTranslationArray accepts plain JSON or fenced JSON', () => {
  assert.deepEqual(parseTranslationArray('["a","b"]'), ['a', 'b'])
  assert.deepEqual(parseTranslationArray('```json\n["a","b"]\n```'), ['a', 'b'])
})

test('extractAssistantContent handles string and structured content', () => {
  assert.equal(extractAssistantContent({
    choices: [{ message: { content: '["ok"]' } }],
  }), '["ok"]')

  assert.equal(extractAssistantContent({
    choices: [{ message: { content: [{ text: '["ok"]' }] } }],
  }), '["ok"]')
})

test('renderPromptTemplate and endpoint resolution normalize settings', () => {
  assert.equal(renderPromptTemplate('Translate to {targetLanguage}', 'en'), 'Translate to en')
  assert.equal(resolveChatCompletionEndpoint('https://example.com/v1/'), 'https://example.com/v1/chat/completions')
  assert.equal(resolveChatCompletionEndpoint('https://example.com/chat/completions'), 'https://example.com/chat/completions')
})
