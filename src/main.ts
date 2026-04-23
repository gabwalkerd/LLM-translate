import './style.scss'
import { Notice, Plugin, PluginSettings } from '@typora-community-plugin/core'
import { editor, File, getMarkdown, isInputComponent, JSBridge } from 'typora'
import { i18n } from './i18n'
import { TranslationSettingTab } from './setting-tab'
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type TranslationMemoryState, type TranslationPluginSettings } from './settings'
import { StatusBarButton } from './status-bar'
import { translateInBatches } from './translation/api'
import { applyTranslationResults, buildTranslationBlock, buildTranslationPlan } from './translation/markdown'
import { hashText } from './translation/hash'
import type { TranslationMemoryEntry } from './translation/types'

export default class BilingualTranslatePlugin extends Plugin<TranslationPluginSettings> {
  i18n = i18n

  private isTranslating = false
  private statusBar?: StatusBarButton
  private hasWarnedAboutStatusBar = false

  async onload() {
    this.registerSettings(new PluginSettings(this.app, this.manifest, {
      version: SETTINGS_VERSION,
    }))
    this.settings.setDefault(DEFAULT_SETTINGS)

    this.registerSettingTab(new TranslationSettingTab(this))
    this.registerCommands()
    this.setupStatusBar()

    const remount = () => {
      setTimeout(() => {
        const mounted = this.statusBar?.mount()
        if (!mounted && !this.hasWarnedAboutStatusBar) {
          this.hasWarnedAboutStatusBar = true
          new Notice(this.i18n.t.statusBarMissing)
        }
      }, 0)
    }

    this.register(this.app.workspace.on('file:open', remount))
    window.addEventListener('focus', remount)
    this.register(() => window.removeEventListener('focus', remount))
  }

  onunload() {
    this.statusBar?.stop()
  }

  async translateDocument(forceRetranslate = false) {
    if (this.isTranslating) {
      new Notice(this.i18n.t.translateRunning)
      return
    }

    const settings = this.snapshotSettings()
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      new Notice(this.i18n.t.missingConfig)
      return
    }
    if (!Number.isInteger(settings.batchCharLimit) || settings.batchCharLimit <= 0) {
      new Notice(this.i18n.t.invalidBatchLimit)
      return
    }

    const markdown = getMarkdown()
    if (!markdown.trim()) {
      new Notice(this.i18n.t.emptyDocument)
      return
    }

    const filePath = await this.getCurrentDocumentPath()
    const plan = buildTranslationPlan(
      markdown,
      settings.targetLanguage,
      forceRetranslate,
      this.getFileTranslationMemory(filePath, settings.targetLanguage),
    )
    if (plan.eligibleBlockCount === 0) {
      new Notice(this.i18n.t.noTranslatableBlocks)
      return
    }
    if (plan.tasks.length === 0) {
      editor.EditHelper.showNotification(this.i18n.t.noPendingBlocks)
      return
    }

    this.isTranslating = true
    this.statusBar?.setBusy(true)

    try {
      const translatedTexts = await translateInBatches(settings, plan.tasks)
      const result = applyTranslationResults(plan, translatedTexts)
      await this.replaceDocumentMarkdown(result.markdown)
      this.setFileTranslationMemory(filePath, settings.targetLanguage, result.memoryEntries)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(this.i18n.t.translateFailure.replace('{message}', message))
    }
    finally {
      this.isTranslating = false
      this.statusBar?.setBusy(false)
    }
  }

  async translateSelection() {
    if (this.isTranslating) {
      new Notice(this.i18n.t.translateRunning)
      return
    }

    const settings = this.snapshotSettings()
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      new Notice(this.i18n.t.missingConfig)
      return
    }
    if (!Number.isInteger(settings.batchCharLimit) || settings.batchCharLimit <= 0) {
      new Notice(this.i18n.t.invalidBatchLimit)
      return
    }

    const selectedMarkdown = await this.captureSelectionMarkdown()
    if (!selectedMarkdown) {
      new Notice(this.i18n.t.noSelection)
      return
    }

    this.isTranslating = true
    this.statusBar?.setBusy(true)

    try {
      const sourceHash = hashText(selectedMarkdown)
      const translatedTexts = await translateInBatches(settings, [{
        sourceText: selectedMarkdown,
        sourceHash,
      }])
      const translated = translatedTexts[0]
      const replacement = this.buildSelectionReplacement(selectedMarkdown, translated, settings.targetLanguage, sourceHash)
      editor.UserOp.backspaceHandler(editor, null, 'Delete')
      editor.UserOp.pasteHandler(editor, replacement, true)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(this.i18n.t.translateFailure.replace('{message}', message))
    }
    finally {
      this.isTranslating = false
      this.statusBar?.setBusy(false)
    }
  }

  private registerCommands() {
    this.registerCommand({
      id: 'translate-document',
      title: this.i18n.t.translateDocument,
      scope: 'editor',
      hotkey: 'Alt+Ctrl+T',
      callback: () => this.translateDocument(false),
    })

    this.registerCommand({
      id: 'translate-selection',
      title: this.i18n.t.translateSelection,
      scope: 'editor',
      hotkey: 'Alt+Shift+Ctrl+T',
      callback: () => this.translateSelection(),
    })

    this.registerCommand({
      id: 'retranslate-document',
      title: this.i18n.t.retranslateDocument,
      scope: 'editor',
      callback: () => this.translateDocument(true),
    })
  }

  private setupStatusBar() {
    this.statusBar = new StatusBarButton(
      () => this.isTranslating ? this.i18n.t.statusButtonBusy : this.i18n.t.statusButton,
      () => {
        if (this.hasActiveSelection()) {
          void this.translateSelection()
          return
        }
        void this.translateDocument(false)
      },
    )
    this.statusBar.start()
    this.register(() => this.statusBar?.stop())
  }

  private snapshotSettings(): TranslationPluginSettings {
    return {
      baseUrl: this.settings.get('baseUrl').trim(),
      apiKey: this.settings.get('apiKey').trim(),
      model: this.settings.get('model').trim(),
      targetLanguage: this.settings.get('targetLanguage').trim() || DEFAULT_SETTINGS.targetLanguage,
      systemPromptTemplate: this.settings.get('systemPromptTemplate').trim() || DEFAULT_SETTINGS.systemPromptTemplate,
      batchCharLimit: this.settings.get('batchCharLimit'),
      translationMemory: this.settings.get('translationMemory'),
    }
  }

  private hasActiveSelection() {
    if (isInputComponent(document.activeElement)) {
      return false
    }
    return !editor.selection.getRangy().collapsed
  }

  private buildSelectionReplacement(sourceMarkdown: string, translatedMarkdown: string, targetLanguage: string, sourceHash: string) {
    if (!/[\r\n]/.test(sourceMarkdown.trim())) {
      const compactTranslation = translatedMarkdown.replace(/\s+/g, ' ').trim()
      return `${sourceMarkdown}（${this.i18n.t.selectionInlinePrefix}：${compactTranslation}）`
    }

    return `${sourceMarkdown}\n\n${buildTranslationBlock(translatedMarkdown, targetLanguage, sourceHash)}`
  }

  private async captureSelectionMarkdown() {
    if (!this.hasActiveSelection()) {
      return ''
    }

    const previousClipboard = await this.tryReadClipboard()
    const typoraFile = File as unknown as { copy?: () => void }
    if (typeof typoraFile.copy !== 'function') {
      throw new Error(this.i18n.t.selectionCaptureFailure)
    }

    typoraFile.copy()
    await new Promise(resolve => setTimeout(resolve, 80))

    const selected = (await this.tryReadClipboard())?.trim() ?? ''

    if (previousClipboard !== undefined) {
      await this.tryWriteClipboard(previousClipboard)
    }

    if (!selected) {
      throw new Error(this.i18n.t.selectionCaptureFailure)
    }

    return selected
  }

  private async replaceDocumentMarkdown(markdown: string) {
    const typoraFile = File as unknown as {
      reloadContent?: (markdown: string, t?: boolean, n?: boolean, i?: boolean, r?: boolean, o?: boolean) => void
      setContent?: (markdown: string, shouldKeepUndo?: boolean) => void
    }

    if (typeof typoraFile.reloadContent === 'function') {
      typoraFile.reloadContent(markdown, false, true, false, true)
      return
    }

    if (typeof typoraFile.setContent === 'function') {
      typoraFile.setContent(markdown, false)
      return
    }

    await JSBridge.invoke('document.setContent', markdown)
  }

  private getFileTranslationMemory(filePath: string, targetLanguage: string): TranslationMemoryEntry[] {
    const memory = this.settings.get('translationMemory') as TranslationMemoryState
    return memory[filePath]?.[targetLanguage] ?? []
  }

  private setFileTranslationMemory(filePath: string, targetLanguage: string, entries: TranslationMemoryEntry[]) {
    const memory = { ...(this.settings.get('translationMemory') as TranslationMemoryState) }
    const fileMemory = { ...(memory[filePath] ?? {}) }
    fileMemory[targetLanguage] = entries
    memory[filePath] = fileMemory
    this.settings.set('translationMemory', memory)
  }

  private async getCurrentDocumentPath() {
    const fileWithBundle = File as unknown as {
      bundle?: { filePath?: string }
      filePath?: string
    }

    const filePath = fileWithBundle.bundle?.filePath || fileWithBundle.filePath
    if (filePath) {
      return filePath
    }

    try {
      const currentPath = await JSBridge.invoke('document.currentPath')
      return String(currentPath || '__typora-current-document__')
    }
    catch {
      return '__typora-current-document__'
    }
  }

  private async tryReadClipboard() {
    try {
      return await navigator.clipboard.readText()
    }
    catch {
      return undefined
    }
  }

  private async tryWriteClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    }
    catch {
      // Best effort only. Clipboard restore failure should not block translation.
    }
  }
}
