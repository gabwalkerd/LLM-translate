import { SettingTab } from '@typora-community-plugin/core'
import type BilingualTranslatePlugin from './main'
import { DEFAULT_SETTINGS } from './settings'

export class TranslationSettingTab extends SettingTab {
  get name() {
    return this.plugin.i18n.t.pluginName
  }

  constructor(private plugin: BilingualTranslatePlugin) {
    super()
  }

  show() {
    const { t } = this.plugin.i18n
    const settings = this.plugin.settings
    const container = this.containerEl
    container.innerHTML = ''

    this.addSettingTitle(t.settingsSectionApi)

    this.addSetting(setting => {
      setting.addName(t.baseUrlName)
      setting.addDescription(t.baseUrlDesc)
      setting.addText(input => {
        input.value = settings.get('baseUrl')
        input.placeholder = DEFAULT_SETTINGS.baseUrl
        input.oninput = () => {
          settings.set('baseUrl', input.value.trim())
        }
      })
    })

    this.addSetting(setting => {
      setting.addName(t.apiKeyName)
      setting.addDescription(t.apiKeyDesc)
      setting.addText(input => {
        input.value = settings.get('apiKey')
        input.placeholder = 'sk-...'
        input.setAttribute('type', 'password')
        input.oninput = () => {
          settings.set('apiKey', input.value.trim())
        }
      })
    })

    this.addSetting(setting => {
      setting.addName(t.modelName)
      setting.addDescription(t.modelDesc)
      setting.addText(input => {
        input.value = settings.get('model')
        input.placeholder = DEFAULT_SETTINGS.model
        input.oninput = () => {
          settings.set('model', input.value.trim())
        }
      })
    })

    this.addSettingTitle(t.settingsSectionTranslation)

    this.addSetting(setting => {
      setting.addName(t.targetLanguageName)
      setting.addDescription(t.targetLanguageDesc)
      setting.addText(input => {
        input.value = settings.get('targetLanguage')
        input.placeholder = DEFAULT_SETTINGS.targetLanguage
        input.oninput = () => {
          settings.set('targetLanguage', input.value.trim() || DEFAULT_SETTINGS.targetLanguage)
        }
      })
    })

    this.addSetting(setting => {
      setting.addName(t.promptName)
      setting.addDescription(t.promptDesc)
      setting.addTextArea(input => {
        input.value = settings.get('systemPromptTemplate')
        input.placeholder = DEFAULT_SETTINGS.systemPromptTemplate
        input.rows = 5
        input.oninput = () => {
          settings.set('systemPromptTemplate', input.value.trim() || DEFAULT_SETTINGS.systemPromptTemplate)
        }
      })
    })

    this.addSetting(setting => {
      setting.addName(t.batchCharLimitName)
      setting.addDescription(t.batchCharLimitDesc)
      setting.addText(input => {
        input.value = String(settings.get('batchCharLimit'))
        input.placeholder = String(DEFAULT_SETTINGS.batchCharLimit)
        input.setAttribute('inputmode', 'numeric')
        input.oninput = () => {
          const parsed = Number.parseInt(input.value, 10)
          settings.set('batchCharLimit', Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.batchCharLimit)
        }
      })
    })

    super.show()
  }
}
