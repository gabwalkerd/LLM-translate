import './style.scss'
import { fs, Notice, path, Plugin, PluginSettings } from '@typora-community-plugin/core'
import { editor, File, getMarkdown, isInputComponent, JSBridge } from 'typora'
import { i18n } from './i18n'
import { SelectionTranslationPopover, type SelectionPopoverAnchor } from './selection-popover'
import { TranslationSettingTab } from './setting-tab'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  normalizeAutoTranslateDelayMs,
  type TranslationMemoryState,
  type TranslationPluginSettings,
} from './settings'
import { StatusBarButton } from './status-bar'
import { translateInBatches } from './translation/api'
import { applyTranslationResults, buildStandaloneTranslationMarkdown, buildTranslationBlock, buildTranslationPlan, insertTranslationAfterMatchingBlock } from './translation/markdown'
import { hashText } from './translation/hash'
import type { TranslationMemoryEntry, TranslationTask } from './translation/types'

export default class BilingualTranslatePlugin extends Plugin<TranslationPluginSettings> {
  i18n = i18n

  private isTranslating = false
  private statusBars: StatusBarButton[] = []
  private hasWarnedAboutStatusBar = false
  private lastFileOpenAt = 0
  private selectionPopover = new SelectionTranslationPopover()
  private autoTranslateTimer?: number
  private autoTranslateRequestVersion = 0
  private autoTranslateActiveRange?: Range
  private autoTranslateActiveSignature = ''
  private autoTranslateSuppressedUntil = 0

  async onload() {
    this.registerSettings(new PluginSettings(this.app, this.manifest, {
      version: SETTINGS_VERSION,
    }))
    this.settings.setDefault(DEFAULT_SETTINGS)

    this.registerSettingTab(new TranslationSettingTab(this))
    this.registerCommands()
    this.setupStatusBar()
    this.selectionPopover.setOnClose(() => this.dismissSelectionPopover())
    this.setupAutoTranslateSelection()

    const remount = () => {
      this.dismissSelectionPopover()
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
    this.dismissSelectionPopover()
    this.selectionPopover.destroy()
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

  handleAutoTranslateSelectionToggle(enabled: boolean) {
    if (!enabled) {
      this.dismissSelectionPopover()
    }
  }

  toggleSelectionPopover() {
    const enabled = !this.settings.get('autoTranslateSelection')
    this.settings.set('autoTranslateSelection', enabled)

    if (enabled) {
      new Notice(this.i18n.t.selectionPopoverEnabled)
      this.scheduleAutoTranslateSelection()
      return
    }

    this.dismissSelectionPopover()
    new Notice(this.i18n.t.selectionPopoverDisabled)
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

    this.registerCommand({
      id: 'toggle-selection-popover',
      title: this.i18n.t.toggleSelectionPopover,
      scope: 'editor',
      hotkey: 'Alt+Shift+Ctrl+T',
      callback: () => this.toggleSelectionPopover(),
    })
  }

  private setupStatusBar() {
    const inlineStatusBar = new StatusBarButton(
      () => this.isTranslating ? this.i18n.t.statusButtonBusy : this.i18n.t.statusButton,
      () => {
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
      autoTranslateSelection: Boolean(this.settings.get('autoTranslateSelection')),
      autoTranslateDelayMs: normalizeAutoTranslateDelayMs(this.settings.get('autoTranslateDelayMs')),
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

  private async copyTextToClipboard(text: string) {
    const copied = await this.withAutoTranslateSuppressed(() => this.tryWriteClipboard(text))

    if (!copied) {
      new Notice(this.i18n.t.selectionPopoverCopyFailure)
    }

    return copied
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
    if (await this.tryWriteClipboardWithBridge(text)) {
      return true
    }

    if (await this.tryWriteClipboardWithNavigator(text)) {
      return true
    }

    if (this.tryWriteClipboardWithUserOp(text)) {
      return true
    }

    if (this.tryWriteClipboardWithExecCommand(text)) {
      return true
    }

    return false
  }

  private async tryWriteClipboardWithNavigator(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      return false
    }
  }

  private tryWriteClipboardWithUserOp(text: string) {
    try {
      if (typeof editor.UserOp?.setClipboard !== 'function') {
        return false
      }

      editor.UserOp.setClipboard(null, null, text, true)
      return true
    }
    catch {
      return false
    }
  }

  private async tryWriteClipboardWithBridge(text: string) {
    try {
      await JSBridge.invoke('clipboard.write', JSON.stringify({ text }))
      return true
    }
    catch {
      return false
    }
  }

  private tryWriteClipboardWithExecCommand(text: string) {
    const selection = window.getSelection()
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
      : []
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    try {
      return document.execCommand('copy')
    }
    catch {
      return false
    }
    finally {
      textarea.remove()

      if (selection) {
        selection.removeAllRanges()
        for (const range of ranges) {
          selection.addRange(range)
        }
      }

      activeElement?.focus()
    }
  }

  private async nextFrame() {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }

  private async delay(ms: number) {
    await new Promise<void>(resolve => setTimeout(resolve, ms))
  }

  private setupAutoTranslateSelection() {
    const schedule = (event: Event) => {
      this.scheduleAutoTranslateSelection(event)
    }
    const dismissIfOutside = (event: MouseEvent) => {
      if (this.selectionPopover.containsEvent(event)) {
        return
      }

      this.clearAutoTranslateTimer()
      if (this.selectionPopover.visible) {
        this.dismissSelectionPopover()
      }
    }
    const clearIfCollapsed = () => {
      if (this.isAutoTranslateSuppressed()) {
        return
      }

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        this.clearAutoTranslateTimer()
      }
    }
    const reposition = () => {
      this.repositionSelectionPopover()
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.selectionPopover.visible) {
        this.dismissSelectionPopover()
      }
    }

    document.addEventListener('mouseup', schedule, true)
    document.addEventListener('keyup', schedule, true)
    document.addEventListener('mousedown', dismissIfOutside, true)
    document.addEventListener('selectionchange', clearIfCollapsed)
    document.addEventListener('keydown', dismissOnEscape, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    this.register(() => document.removeEventListener('mouseup', schedule, true))
    this.register(() => document.removeEventListener('keyup', schedule, true))
    this.register(() => document.removeEventListener('mousedown', dismissIfOutside, true))
    this.register(() => document.removeEventListener('selectionchange', clearIfCollapsed))
    this.register(() => document.removeEventListener('keydown', dismissOnEscape, true))
    this.register(() => window.removeEventListener('resize', reposition))
    this.register(() => window.removeEventListener('scroll', reposition, true))
    this.register(() => this.selectionPopover.destroy())
  }

  private scheduleAutoTranslateSelection(triggerEvent?: Event) {
    if (this.isAutoTranslateSuppressed()) {
      return
    }

    if (!this.settings.get('autoTranslateSelection')) {
      return
    }

    if (triggerEvent && this.selectionPopover.containsEvent(triggerEvent)) {
      return
    }

    const snapshot = this.getEditorSelectionSnapshot()
    if (!snapshot) {
      this.clearAutoTranslateTimer()
      return
    }

    if (this.selectionPopover.visible && this.autoTranslateActiveSignature === snapshot.signature) {
      this.autoTranslateActiveRange = snapshot.range
      this.repositionSelectionPopover()
      return
    }

    this.clearAutoTranslateTimer()
    this.autoTranslateTimer = window.setTimeout(() => {
      void this.runAutoTranslateSelection(snapshot.text, snapshot.range, snapshot.signature)
    }, normalizeAutoTranslateDelayMs(this.settings.get('autoTranslateDelayMs')))
  }

  private async runAutoTranslateSelection(selectedText: string, range: Range, signature: string) {
    const anchor = this.getSelectionPopoverAnchor(range)
    if (!anchor) {
      return
    }

    const settings = this.snapshotSettings()
    const requestVersion = ++this.autoTranslateRequestVersion
    this.autoTranslateActiveRange = range
    this.autoTranslateActiveSignature = signature

    const labels = {
      title: this.i18n.t.selectionPopoverTitle,
      loading: this.i18n.t.selectionPopoverLoading,
      copy: this.i18n.t.selectionPopoverCopy,
      insert: this.i18n.t.selectionPopoverInsert,
      copied: this.i18n.t.selectionPopoverCopied,
      close: this.i18n.t.selectionPopoverClose,
    }

    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      this.selectionPopover.showError(anchor, this.i18n.t.missingConfig, labels)
      return
    }
    if (!Number.isInteger(settings.batchCharLimit) || settings.batchCharLimit <= 0) {
      this.selectionPopover.showError(anchor, this.i18n.t.invalidBatchLimit, labels)
      return
    }

    this.selectionPopover.showLoading(anchor, labels)

    try {
      const translatedTexts = await translateInBatches(settings, [{
        sourceText: selectedText,
        sourceHash: hashText(selectedText),
      }])

      if (requestVersion !== this.autoTranslateRequestVersion) {
        return
      }

      const translated = translatedTexts[0]
      const latestAnchor = this.getSelectionPopoverAnchor(this.autoTranslateActiveRange ?? range) ?? anchor
      this.selectionPopover.showResult(
        latestAnchor,
        translated,
        labels,
        async () => {
          return this.copyTextToClipboard(translated)
        },
        async () => {
          return this.insertSelectionTranslationFromPopover(selectedText, translated, settings.targetLanguage)
        },
      )
    }
    catch (error) {
      if (requestVersion !== this.autoTranslateRequestVersion) {
        return
      }

      const latestAnchor = this.getSelectionPopoverAnchor(this.autoTranslateActiveRange ?? range) ?? anchor
      const message = error instanceof Error ? error.message : String(error)
      this.selectionPopover.showError(latestAnchor, this.i18n.t.translateFailure.replace('{message}', message), labels)
    }
  }

  private getEditorSelectionSnapshot() {
    if (isInputComponent(document.activeElement) || this.isTranslating || this.isAutoTranslateSuppressed()) {
      return undefined
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return undefined
    }

    const range = selection.getRangeAt(0).cloneRange()
    const text = selection.toString().trim()
    if (!text || !this.isRangeInsideEditor(range)) {
      return undefined
    }

    return {
      text,
      range,
      signature: hashText(text),
    }
  }

  private isRangeInsideEditor(range: Range) {
    const editorRoot = document.querySelector('#write')
    if (!editorRoot) {
      return false
    }

    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer

    return !!container && editorRoot.contains(container)
  }

  private getSelectionPopoverAnchor(range: Range): SelectionPopoverAnchor | undefined {
    if (!document.contains(range.commonAncestorContainer)) {
      return undefined
    }

    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0)
    const firstRect = rects[0]
    const lastRect = rects.at(-1)
    const boundingRect = range.getBoundingClientRect()
    const referenceRect = lastRect ?? boundingRect
    const left = firstRect?.left ?? boundingRect.left

    if ((!referenceRect.width && !referenceRect.height) || Number.isNaN(left)) {
      return undefined
    }

    return {
      top: referenceRect.top,
      bottom: referenceRect.bottom,
      left,
    }
  }

  private clearAutoTranslateTimer() {
    if (this.autoTranslateTimer) {
      window.clearTimeout(this.autoTranslateTimer)
      this.autoTranslateTimer = undefined
    }
  }

  private dismissSelectionPopover() {
    this.clearAutoTranslateTimer()
    this.autoTranslateRequestVersion += 1
    this.autoTranslateActiveRange = undefined
    this.autoTranslateActiveSignature = ''
    this.selectionPopover.hide()
  }

  private async insertSelectionTranslationFromPopover(sourceText: string, translatedText: string, targetLanguage: string) {
    return this.withAutoTranslateSuppressed(async () => {
      const range = this.autoTranslateActiveRange
      if (!range || !document.contains(range.commonAncestorContainer)) {
        new Notice(this.i18n.t.noSelection)
        return false
      }

      this.restoreSelectionRange(range)

      const selectedMarkdown = await this.readSelectedMarkdownForInsertion(sourceText)
      const sourceHash = hashText(sourceText)
      const translationBlock = buildTranslationBlock(translatedText, targetLanguage, sourceHash)
      const markdown = await this.readCurrentMarkdown()
      const updatedMarkdown = insertTranslationAfterMatchingBlock(markdown, selectedMarkdown, sourceText, translationBlock)
      if (!updatedMarkdown) {
        new Notice(this.i18n.t.noSelection)
        return false
      }

      await this.replaceDocumentMarkdown(updatedMarkdown)
      return true
    })
  }

  private restoreSelectionRange(range: Range) {
    const selection = window.getSelection()
    if (!selection) {
      return
    }

    selection.removeAllRanges()
    selection.addRange(range.cloneRange())
  }

  private async readSelectedMarkdownForInsertion(fallbackText: string) {
    try {
      return await this.captureSelectionMarkdown()
    }
    catch {
      return fallbackText
    }
  }

  private async withAutoTranslateSuppressed<T>(operation: () => Promise<T>) {
    this.suppressAutoTranslateSelection(800)

    try {
      return await operation()
    }
    finally {
      this.suppressAutoTranslateSelection(300)
    }
  }

  private suppressAutoTranslateSelection(durationMs: number) {
    this.clearAutoTranslateTimer()
    this.autoTranslateSuppressedUntil = Math.max(this.autoTranslateSuppressedUntil, Date.now() + durationMs)
  }

  private isAutoTranslateSuppressed() {
    return Date.now() < this.autoTranslateSuppressedUntil
  }

  private repositionSelectionPopover() {
    if (!this.selectionPopover.visible || !this.autoTranslateActiveRange) {
      return
    }

    const anchor = this.getSelectionPopoverAnchor(this.autoTranslateActiveRange)
    if (!anchor) {
      this.dismissSelectionPopover()
      return
    }

    this.selectionPopover.update(anchor)
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
