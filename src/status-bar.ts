export class StatusBarButton {
  private button?: HTMLButtonElement
  private observer?: MutationObserver

  constructor(
    private readonly getLabel: () => string,
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
      this.button.textContent = this.getLabel()
      return true
    }

    this.button?.remove()

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'typora-translate-status-button'
    button.textContent = this.getLabel()
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
    this.button.textContent = this.getLabel()
  }
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
