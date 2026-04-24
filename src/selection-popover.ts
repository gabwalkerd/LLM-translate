export interface SelectionPopoverAnchor {
  top: number
  bottom: number
  left: number
}

interface SelectionPopoverLabels {
  title: string
  loading: string
  copy: string
  copied: string
  close: string
}

export class SelectionTranslationPopover {
  private container?: HTMLDivElement
  private titleEl?: HTMLDivElement
  private closeButton?: HTMLButtonElement
  private bodyEl?: HTMLDivElement
  private actionsEl?: HTMLDivElement
  private copyButton?: HTMLButtonElement
  private copyResetTimer?: number
  private copyHandler?: () => Promise<boolean>
  private closeHandler: () => void = () => this.hide()
  private labels?: SelectionPopoverLabels

  get visible() {
    return !!this.container && !this.container.hidden
  }

  contains(target: EventTarget | null) {
    return target instanceof Node && !!this.container?.contains(target)
  }

  showLoading(anchor: SelectionPopoverAnchor, labels: SelectionPopoverLabels) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyEl || !this.actionsEl || !this.copyButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.add('is-loading')
    this.bodyEl.textContent = labels.loading
    this.copyButton.hidden = true
    this.copyButton.disabled = true
    this.actionsEl.hidden = true
    this.copyHandler = undefined
    this.updatePosition(anchor)
  }

  showResult(anchor: SelectionPopoverAnchor, translation: string, labels: SelectionPopoverLabels, onCopy: () => Promise<boolean>) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyEl || !this.actionsEl || !this.copyButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.remove('is-loading')
    this.bodyEl.textContent = translation
    this.copyButton.hidden = false
    this.copyButton.disabled = false
    this.copyButton.textContent = labels.copy
    this.actionsEl.hidden = false
    this.copyHandler = onCopy
    this.updatePosition(anchor)
  }

  showError(anchor: SelectionPopoverAnchor, message: string, labels: SelectionPopoverLabels) {
    this.labels = labels
    this.ensureContainer()
    this.renderBase(labels)

    if (!this.container || !this.bodyEl || !this.actionsEl || !this.copyButton) {
      return
    }

    this.container.hidden = false
    this.container.classList.remove('is-loading')
    this.bodyEl.textContent = message
    this.bodyEl.classList.add('is-error')
    this.copyButton.hidden = true
    this.copyButton.disabled = true
    this.actionsEl.hidden = true
    this.copyHandler = undefined
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
    this.bodyEl = undefined
    this.actionsEl = undefined
    this.copyButton = undefined
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

    const title = document.createElement('div')
    title.className = 'typora-translate-selection-popover__title'

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'typora-translate-selection-popover__close'
    closeButton.textContent = '×'
    closeButton.addEventListener('click', () => this.closeHandler())

    header.append(title, closeButton)

    const body = document.createElement('div')
    body.className = 'typora-translate-selection-popover__body'

    const actions = document.createElement('div')
    actions.className = 'typora-translate-selection-popover__actions'

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'typora-translate-selection-popover__action typora-translate-selection-popover__action--primary'
    copyButton.addEventListener('click', async () => {
      if (!this.copyHandler || !this.copyButton || !this.labels) {
        return
      }

      const copied = await this.copyHandler()
      if (!copied) {
        return
      }

      this.copyButton.textContent = this.labels.copied
      this.resetCopyButton(1400)
    })

    actions.append(copyButton)
    container.append(header, body, actions)
    document.body.append(container)

    this.container = container
    this.titleEl = title
    this.closeButton = closeButton
    this.bodyEl = body
    this.actionsEl = actions
    this.copyButton = copyButton
  }

  private renderBase(labels: SelectionPopoverLabels) {
    if (!this.titleEl || !this.closeButton || !this.bodyEl) {
      return
    }

    this.titleEl.textContent = labels.title
    this.closeButton.title = labels.close
    this.closeButton.setAttribute('aria-label', labels.close)
    this.bodyEl.classList.remove('is-error')
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
          this.copyButton.textContent = this.labels.copy
        }
      }, delayMs)
      return
    }

    this.copyButton.textContent = this.labels.copy
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
