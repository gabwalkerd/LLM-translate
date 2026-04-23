export class StatusBarButton {
  private button?: HTMLButtonElement
  private observer?: MutationObserver

  constructor(
    private readonly getTitle: () => string,
    private readonly onClick: () => void,
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
    button.className = 'typora-translate-status-button'
    button.title = this.getTitle()
    button.setAttribute('aria-label', this.getTitle())
    button.innerHTML = getDictionaryIcon()
    button.addEventListener('click', this.onClick)

    container.appendChild(button)
    this.button = button
    return true
  }

  setBusy(isBusy: boolean) {
    if (!this.button) {
      return
    }
    this.button.disabled = isBusy
    this.button.classList.toggle('is-busy', isBusy)
    this.button.title = this.getTitle()
    this.button.setAttribute('aria-label', this.getTitle())
  }
}

function getDictionaryIcon() {
  return [
    '<svg viewBox="0 0 24 24" class="typora-translate-status-icon" aria-hidden="true">',
    '<path d="M7 3.75A2.75 2.75 0 0 0 4.25 6.5v11A3.25 3.25 0 0 0 7.5 20.75h10.25a.75.75 0 0 0 0-1.5H7.5a1.75 1.75 0 1 1 0-3.5h10.25V6.5A2.75 2.75 0 0 0 15 3.75H7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M7.5 15.75c-.97 0-1.84.42-2.43 1.08" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M8.2 9.6h6.2M9.2 12h4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
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
