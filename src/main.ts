import './style.scss'
import { Notice, Plugin, PluginSettings } from '@typora-community-plugin/core'
import { editor, File, getMarkdown, isInputComponent, JSBridge } from 'typora'
import { formatMessage, i18n } from './i18n'
import { TranslationSettingTab } from './setting-tab'
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type TranslationPluginSettings } from './settings'
import { StatusBarButton } from './status-bar'
import { translateInBatches } from './translation/api'
import { applyTranslationResults, buildTranslationBlock, buildTranslationPlan } from './translation/markdown'
import { hashText } from './translation/hash'

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

    const plan = buildTranslationPlan(markdown, settings.targetLanguage, forceRetranslate)
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
      await JSBridge.invoke('document.setContent', result.markdown)
      editor.EditHelper.showNotification(formatMessage(this.i18n.t.translateSuccess, {
        translated: result.translatedCount,
        skipped: result.skippedCount,
      }))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(formatMessage(this.i18n.t.translateFailure, { message }))
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
      editor.EditHelper.showNotification(this.i18n.t.translateSelectionSuccess)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      new Notice(formatMessage(this.i18n.t.translateFailure, { message }))
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
      () => {
        if (this.isTranslating) {
          return this.i18n.t.statusButtonBusy
        }
        return this.hasActiveSelection() ? this.i18n.t.statusButtonSelection : this.i18n.t.statusButton
      },
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
