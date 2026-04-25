export class StatusBarButton {
  private button?: HTMLButtonElement
  private observer?: MutationObserver
  private isBusy = false

  constructor(
    private readonly getTitle: () => string,
    private readonly onClick: () => void,
    private readonly variant: StatusButtonVariant = 'inline',
  ) {}

  start() {
    this.mount()
    this.observer = new MutationObserver(() => {
      this.mount()
    })
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  stop() {
    this.observer?.disconnect()
    this.observer = undefined
    this.button?.remove()
    this.button = undefined
  }

  mount() {
    const container = findStatusContainer()
    if (!container) {
      return false
    }

    if (this.button?.isConnected && this.button.parentElement === container) {
      this.button.title = this.getTitle()
      this.button.setAttribute('aria-label', this.getTitle())
      return true
    }

    this.button?.remove()

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `typora-translate-status-button typora-translate-status-button--${this.variant}`
    button.title = this.getTitle()
    button.setAttribute('aria-label', this.getTitle())
    button.innerHTML = getDictionaryIcon(false, this.variant)
    button.addEventListener('mousedown', event => {
      // Keep editor focus and current selection when the user clicks the status-bar icon.
      event.preventDefault()
    })
    button.addEventListener('click', event => {
      event.preventDefault()
      if (this.isBusy) {
        return
      }
      this.onClick()
    })

    container.appendChild(button)
    this.button = button
    return true
  }

  setBusy(isBusy: boolean) {
    this.isBusy = isBusy
    document.documentElement.classList.toggle('typora-translate-busy', isBusy)

    if (!this.button) {
      return
    }
    this.button.classList.toggle('is-busy', isBusy)
    this.button.setAttribute('aria-busy', String(isBusy))
    this.button.title = this.getTitle()
    this.button.setAttribute('aria-label', this.getTitle())
    this.button.innerHTML = getDictionaryIcon(isBusy, this.variant)
  }
}

type StatusButtonVariant = 'inline' | 'new-file'

function getDictionaryIcon(isBusy: boolean, variant: StatusButtonVariant) {
  if (variant === 'new-file') {
    return isBusy ? getBusyNewFileDictionaryIcon() : getIdleNewFileDictionaryIcon()
  }
  return isBusy ? getBusyDictionaryIcon() : getIdleDictionaryIcon()
}

function getIdleDictionaryIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-status-icon" aria-hidden="true">',
    '<path d="M6.5 4.25h11A1.75 1.75 0 0 1 19.25 6v12a.75.75 0 0 1-.75.75h-11A2.75 2.75 0 0 1 4.75 16V6A1.75 1.75 0 0 1 6.5 4.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M11.95 4.85v13.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M7.85 9.1h2.2M7.85 12.15h1.5M13.9 9.1h2.25M13.9 12.15h1.45" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M6.2 18.45c.35-.72.92-1.08 1.72-1.08h10.33" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
  ].join('')
}

function getBusyDictionaryIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-status-icon" aria-hidden="true">',
    '<path d="M6.5 4.25h11A1.75 1.75 0 0 1 19.25 6v12a.75.75 0 0 1-.75.75h-11A2.75 2.75 0 0 1 4.75 16V6A1.75 1.75 0 0 1 6.5 4.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M11.95 4.85v13.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M8 10.25h.01M12 10.25h.01M16 10.25h.01" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    '<path d="M6.2 18.45c.35-.72.92-1.08 1.72-1.08h10.33" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
  ].join('')
}

function getIdleNewFileDictionaryIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-status-icon" aria-hidden="true">',
    '<path d="M7.4 5.1h8.55a1.5 1.5 0 0 1 1.5 1.5v9.55" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.62"/>',
    '<path d="M6 7.25h9.9A1.85 1.85 0 0 1 17.75 9.1V18a.75.75 0 0 1-.75.75H7.85A1.85 1.85 0 0 1 6 16.9V7.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M8.6 10.15h4.1M8.6 13.1h3.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M15.35 13.75v4.05M13.32 15.78h4.06" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
  ].join('')
}

function getBusyNewFileDictionaryIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-status-icon" aria-hidden="true">',
    '<path d="M7.4 5.1h8.55a1.5 1.5 0 0 1 1.5 1.5v9.55" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.62"/>',
    '<path d="M6 7.25h9.9A1.85 1.85 0 0 1 17.75 9.1V18a.75.75 0 0 1-.75.75H7.85A1.85 1.85 0 0 1 6 16.9V7.25Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M8.15 12.05h.01M11.95 12.05h.01M15.75 12.05h.01" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    '<path d="M14.2 16.45h3.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
  ].join('')
}

function findStatusContainer() {
  const knownSelectors = [
    '#footer',
    'footer',
    '.footer',
    '.typora-footer',
    '[id*="footer"]',
    '[class*="footer"]',
  ]

  for (const selector of knownSelectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const visible = candidates.find(isVisible)
    if (visible) {
      return visible
    }
  }

  return undefined
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}
