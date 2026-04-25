export interface SelectionPopoverAnchor {
  top: number
  bottom: number
  left: number
}

interface SelectionPopoverLabels {
  title: string
  loading: string
  copy: string
  insert: string
  copied: string
  close: string
}

export class SelectionTranslationPopover {
  private container?: HTMLDivElement
  private titleEl?: HTMLDivElement
  private closeButton?: HTMLButtonElement
  private bodyTextEl?: HTMLDivElement
  private copyButton?: HTMLButtonElement
  private insertButton?: HTMLButtonElement
  private copyResetTimer?: number
  private copyHandler?: () => Promise<boolean>
  private insertHandler?: () => Promise<boolean>
  private closeHandler: () => void = () => this.hide()
  private labels?: SelectionPopoverLabels

  get visible() {
    return !!this.container && !this.container.hidden
  }

  contains(target: EventTarget | null) {
    return target instanceof Node && !!this.container?.contains(target)
  }

  containsEvent(event: Event) {
    if (!this.container) {
      return false
    }

    return event.composedPath().includes(this.container)
  }

  showLoading(anchor: SelectionPopoverAnchor, labels: SelectionPopoverLabels) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyTextEl || !this.copyButton || !this.insertButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.add('is-loading')
    this.bodyTextEl.textContent = labels.loading
    this.copyButton.hidden = true
    this.copyButton.disabled = true
    this.insertButton.hidden = true
    this.insertButton.disabled = true
    this.copyHandler = undefined
    this.insertHandler = undefined
    this.updatePosition(anchor)
  }

  showResult(
    anchor: SelectionPopoverAnchor,
    translation: string,
    labels: SelectionPopoverLabels,
    onCopy: () => Promise<boolean>,
    onInsert: () => Promise<boolean>,
  ) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyTextEl || !this.copyButton || !this.insertButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.remove('is-loading')
    this.bodyTextEl.textContent = translation
    this.copyButton.hidden = false
    this.copyButton.disabled = false
    this.insertButton.hidden = false
    this.insertButton.disabled = false
    this.copyHandler = onCopy
    this.insertHandler = onInsert
    this.updatePosition(anchor)
  }

  showError(anchor: SelectionPopoverAnchor, message: string, labels: SelectionPopoverLabels) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyTextEl || !this.copyButton || !this.insertButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.remove('is-loading')
    this.bodyTextEl.textContent = message
    this.bodyTextEl.classList.add('is-error')
    this.copyButton.hidden = true
    this.copyButton.disabled = true
    this.insertButton.hidden = true
    this.insertButton.disabled = true
    this.copyHandler = undefined
    this.insertHandler = undefined
    this.updatePosition(anchor)
  }

  update(anchor: SelectionPopoverAnchor) {
    if (!this.visible) {
      return
    }

    this.updatePosition(anchor)
  }

  hide() {
    this.resetCopyButton()
    if (this.container) {
      this.container.hidden = true
    }
    this.copyHandler = undefined
  }

  destroy() {
    this.hide()
    this.container?.remove()
    this.container = undefined
    this.titleEl = undefined
    this.closeButton = undefined
    this.bodyTextEl = undefined
    this.copyButton = undefined
    this.insertButton = undefined
  }

  setOnClose(handler: () => void) {
    this.closeHandler = handler
  }

  private ensureContainer() {
    if (this.container) {
      return
    }

    const container = document.createElement('div')
    container.className = 'typora-translate-selection-popover'
    container.hidden = true

    const header = document.createElement('div')
    header.className = 'typora-translate-selection-popover__header'

    const titleGroup = document.createElement('div')
    titleGroup.className = 'typora-translate-selection-popover__title-group'

    const title = document.createElement('div')
    title.className = 'typora-translate-selection-popover__title'

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'typora-translate-selection-popover__copy'
    copyButton.innerHTML = getCopyIcon()
    copyButton.addEventListener('mousedown', event => {
      event.preventDefault()
      event.stopPropagation()
    })
    copyButton.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (!this.copyHandler || !this.copyButton || !this.labels) {
        return
      }

      const copied = await this.copyHandler()
      if (!copied) {
        return
      }

      this.copyButton.classList.add('is-copied')
      this.copyButton.title = this.labels.copied
      this.copyButton.setAttribute('aria-label', this.labels.copied)
      this.resetCopyButton(1400)
    })

    const insertButton = document.createElement('button')
    insertButton.type = 'button'
    insertButton.className = 'typora-translate-selection-popover__insert'
    insertButton.innerHTML = getInsertIcon()
    insertButton.addEventListener('mousedown', event => {
      event.preventDefault()
      event.stopPropagation()
    })
    insertButton.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (!this.insertHandler || !this.insertButton) {
        return
      }

      this.insertButton.disabled = true
      const inserted = await this.insertHandler()
      if (inserted) {
        this.closeHandler()
        return
      }
      this.insertButton.disabled = false
    })

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'typora-translate-selection-popover__close'
    closeButton.textContent = '×'
    closeButton.addEventListener('mousedown', event => {
      event.preventDefault()
      event.stopPropagation()
    })
    closeButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.closeHandler()
    })

    titleGroup.append(title, copyButton, insertButton)
    header.append(titleGroup, closeButton)

    const body = document.createElement('div')
    body.className = 'typora-translate-selection-popover__body'

    const bodyText = document.createElement('div')
    bodyText.className = 'typora-translate-selection-popover__body-text'
    body.append(bodyText)
    container.append(header, body)
    document.body.append(container)

    this.container = container
    this.titleEl = title
    this.closeButton = closeButton
    this.bodyTextEl = bodyText
    this.copyButton = copyButton
    this.insertButton = insertButton
  }

  private renderBase(labels: SelectionPopoverLabels) {
    if (!this.titleEl || !this.closeButton || !this.bodyTextEl) {
      return
    }

    this.titleEl.textContent = labels.title
    this.closeButton.title = labels.close
    this.closeButton.setAttribute('aria-label', labels.close)
    this.bodyTextEl.classList.remove('is-error')
    this.resetCopyButton()
  }

  private resetCopyButton(delayMs = 0) {
    if (this.copyResetTimer) {
      window.clearTimeout(this.copyResetTimer)
      this.copyResetTimer = undefined
    }

    if (!this.copyButton || !this.labels) {
      return
    }

    if (delayMs > 0) {
      this.copyResetTimer = window.setTimeout(() => {
        if (this.copyButton && this.labels) {
          this.copyButton.classList.remove('is-copied')
          this.copyButton.title = this.labels.copy
          this.copyButton.setAttribute('aria-label', this.labels.copy)
        }
      }, delayMs)
      return
    }

    this.copyButton.classList.remove('is-copied')
    this.copyButton.title = this.labels.copy
    this.copyButton.setAttribute('aria-label', this.labels.copy)
    if (this.insertButton) {
      this.insertButton.title = this.labels.insert
      this.insertButton.setAttribute('aria-label', this.labels.insert)
    }
  }

  private updatePosition(anchor: SelectionPopoverAnchor) {
    if (!this.container) {
      return
    }

    const gap = 10
    const viewportPadding = 12
    const maxWidth = Math.min(560, window.innerWidth - viewportPadding * 2)
    this.container.style.maxWidth = `${maxWidth}px`

    const measuredWidth = this.container.offsetWidth || maxWidth
    const measuredHeight = this.container.offsetHeight || 0
    const left = Math.min(
      Math.max(viewportPadding, anchor.left),
      Math.max(viewportPadding, window.innerWidth - measuredWidth - viewportPadding),
    )

    let top = anchor.bottom + gap
    if (measuredHeight > 0 && top + measuredHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, anchor.top - measuredHeight - gap)
    }

    this.container.style.left = `${Math.round(left)}px`
    this.container.style.top = `${Math.round(top)}px`
  }
}

function getCopyIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-selection-popover__copy-icon" aria-hidden="true">',
    '<path d="M9 7.75A1.75 1.75 0 0 1 10.75 6h7.5A1.75 1.75 0 0 1 20 7.75v9.5A1.75 1.75 0 0 1 18.25 19h-7.5A1.75 1.75 0 0 1 9 17.25v-9.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M15 6H8.75A1.75 1.75 0 0 0 7 7.75V15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.72"/>',
    '<path d="M12.25 10.5h4.5M12.25 13.5h4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
  ].join('')
}

function getInsertIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-selection-popover__insert-icon" aria-hidden="true">',
    '<path d="m6 6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    '<path d="m6 12 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    '</svg>',
  ].join('')
}
