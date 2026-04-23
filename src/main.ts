import './style.scss'
import { fs, Notice, path, Plugin, PluginSettings } from '@typora-community-plugin/core'
import { editor, File, getMarkdown, isInputComponent, JSBridge } from 'typora'
import { i18n } from './i18n'
import { TranslationSettingTab } from './setting-tab'
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type TranslationMemoryState, type TranslationPluginSettings } from './settings'
import { StatusBarButton } from './status-bar'
import { translateInBatches } from './translation/api'
import { applyTranslationResults, buildStandaloneTranslationMarkdown, buildTranslationBlock, buildTranslationPlan } from './translation/markdown'
import { hashText } from './translation/hash'
import type { TranslationMemoryEntry, TranslationTask } from './translation/types'

export default class BilingualTranslatePlugin extends Plugin<TranslationPluginSettings> {
  i18n = i18n

  private isTranslating = false
  private statusBars: StatusBarButton[] = []
  private hasWarnedAboutStatusBar = false
  private lastFileOpenAt = 0

  async onload() {
    this.registerSettings(new PluginSettings(this.app, this.manifest, {
      version: SETTINGS_VERSION,
    }))
    this.settings.setDefault(DEFAULT_SETTINGS)

    this.registerSettingTab(new TranslationSettingTab(this))
    this.registerCommands()
    this.setupStatusBar()

    const remount = () => {
      this.lastFileOpenAt = Date.now()
      setTimeout(() => {
        const mounted = this.statusBars.some(statusBar => statusBar.mount())
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
    this.statusBars.forEach(statusBar => statusBar.stop())
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

    this.isTranslating = true
    this.setStatusBarsBusy(true)

    try {
      await this.waitForEditorReady()

      const markdown = await this.readCurrentMarkdown()
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
      this.setStatusBarsBusy(false)
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

    this.isTranslating = true
    this.setStatusBarsBusy(true)

    try {
      await this.waitForEditorReady()

      const selectedMarkdown = await this.captureSelectionMarkdown()
      if (!selectedMarkdown) {
        new Notice(this.i18n.t.noSelection)
        return
      }

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
      this.setStatusBarsBusy(false)
    }
  }

  async translateDocumentToNewFile() {
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

    this.isTranslating = true
    this.setStatusBarsBusy(true)

    try {
      await this.waitForEditorReady()

      const markdown = await this.readCurrentMarkdown()
      if (!markdown.trim()) {
        new Notice(this.i18n.t.emptyDocument)
        return
      }

      const filePath = await this.getCurrentDocumentPath()
      const sourcePath = this.ensureSavedDocumentPath(filePath)
      const plan = buildTranslationPlan(
        markdown,
        settings.targetLanguage,
        false,
        this.getFileTranslationMemory(filePath, settings.targetLanguage),
      )
      if (plan.eligibleBlockCount === 0) {
        new Notice(this.i18n.t.noTranslatableBlocks)
        return
      }

      const translatedTexts = plan.tasks.length > 0
        ? await translateInBatches(settings, plan.tasks)
        : []
      const translatedMarkdown = buildStandaloneTranslationMarkdown(plan, translatedTexts)
      const outputPath = this.buildTranslatedFilePath(sourcePath, settings.targetLanguage)

      await fs.writeText(outputPath, translatedMarkdown)
      await this.openTranslatedFileInRightSplit(outputPath)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(this.i18n.t.translateFailure.replace('{message}', message))
    }
    finally {
      this.isTranslating = false
      this.setStatusBarsBusy(false)
    }
  }

  async testApiFormat() {
    if (this.isTranslating) {
      new Notice(this.i18n.t.translateRunning)
      return false
    }

    const settings = this.snapshotSettings()
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      throw new Error(this.i18n.t.missingConfig)
    }
    if (!Number.isInteger(settings.batchCharLimit) || settings.batchCharLimit <= 0) {
      throw new Error(this.i18n.t.invalidBatchLimit)
    }

    const probeTasks = this.createApiProbeTasks()
    const translations = await translateInBatches(settings, probeTasks)

    if (translations.length !== probeTasks.length) {
      throw new Error(this.i18n.t.testApiFormatUnexpectedCount.replace('{count}', String(translations.length)))
    }

    return true
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

    this.registerCommand({
      id: 'translate-document-to-new-file',
      title: this.i18n.t.translateDocumentToNewFile,
      scope: 'editor',
      callback: () => this.translateDocumentToNewFile(),
    })
  }

  private setupStatusBar() {
    const inlineStatusBar = new StatusBarButton(
      () => this.isTranslating ? this.i18n.t.statusButtonBusy : this.i18n.t.statusButton,
      () => {
        if (this.hasActiveSelection()) {
          void this.translateSelection()
          return
        }
        void this.translateDocument(false)
      },
      'inline',
    )
    const newFileStatusBar = new StatusBarButton(
      () => this.isTranslating ? this.i18n.t.statusNewFileButtonBusy : this.i18n.t.statusNewFileButton,
      () => {
        void this.translateDocumentToNewFile()
      },
      'new-file',
    )

    this.statusBars = [inlineStatusBar, newFileStatusBar]
    this.statusBars.forEach(statusBar => statusBar.start())
    this.register(() => this.statusBars.forEach(statusBar => statusBar.stop()))
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

  private async waitForEditorReady() {
    await this.tryInvokeBridge('window.focus')
    await this.tryInvokeBridge('window.loadFinished', 400)

    const elapsedSinceOpen = Date.now() - this.lastFileOpenAt
    if (this.lastFileOpenAt > 0 && elapsedSinceOpen < 350) {
      await this.delay(350 - elapsedSinceOpen)
    }

    await this.nextFrame()
    await this.nextFrame()
  }

  private async readCurrentMarkdown() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const directMarkdown = getMarkdown()
      if (directMarkdown.trim()) {
        return directMarkdown
      }

      const bridgeMarkdown = await this.tryGetDocumentContent()
      if (bridgeMarkdown.trim()) {
        return bridgeMarkdown
      }

      await this.delay(120)
    }

    return getMarkdown()
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

  private async tryGetDocumentContent() {
    try {
      const content = await JSBridge.invoke('document.getContent')
      return typeof content === 'string' ? content : String(content ?? '')
    }
    catch {
      return ''
    }
  }

  private async tryInvokeBridge(command: 'window.focus' | 'window.loadFinished', timeoutMs = 250) {
    try {
      await Promise.race([
        JSBridge.invoke(command),
        this.delay(timeoutMs),
      ])
    }
    catch {
      // Best effort only. Some Typora builds may not resolve these commands reliably.
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

  private async nextFrame() {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }

  private async delay(ms: number) {
    await new Promise<void>(resolve => setTimeout(resolve, ms))
  }

  private createApiProbeTasks(): TranslationTask[] {
    const samples = [
      '# Hello world',
      '- Preserve `inline code` and **Markdown** structure.',
    ]

    return samples.map(sourceText => ({
      sourceText,
      sourceHash: hashText(sourceText),
    }))
  }

  private setStatusBarsBusy(isBusy: boolean) {
    this.statusBars.forEach(statusBar => statusBar.setBusy(isBusy))
  }

  private ensureSavedDocumentPath(filePath: string) {
    if (!filePath || filePath.startsWith('__') || !path.isAbsolute(filePath)) {
      throw new Error(this.i18n.t.saveDocumentBeforeNewFileTranslation)
    }
    return filePath
  }

  private buildTranslatedFilePath(sourcePath: string, targetLanguage: string) {
    const extension = path.extname(sourcePath)
    const baseName = path.basename(sourcePath, extension)
    const directory = path.dirname(sourcePath)
    const normalizedSuffix = this.normalizeLanguageSuffix(targetLanguage)
    return path.join(directory, `${baseName}_${normalizedSuffix}.md`)
  }

  private normalizeLanguageSuffix(targetLanguage: string) {
    const normalized = targetLanguage
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find(Boolean)

    return normalized || 'translated'
  }

  private async openTranslatedFileInRightSplit(filePath: string) {
    try {
      this.app.commands.run('core.workspace:split-right', [filePath])
      await this.delay(80)
      await this.app.openFile(filePath)
      return
    }
    catch {
      // Fall back to opening the file normally if split view is unavailable.
    }

    await this.app.openFile(filePath)
  }
}
