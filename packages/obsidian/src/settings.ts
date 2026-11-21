import { type App, Notice, PluginSettingTab, Setting } from "obsidian"
import { AiError, testConnection } from "./ai"
import { obsidianTransport } from "./ai-transport"
import { DOCS_URL } from "./constants"
import { errorMessage } from "./errors"
import type Easy30Plugin from "./main"
import { AI_PRESETS, type AiPreset } from "./settings-model"

export class Easy30SettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: Easy30Plugin,
  ) {
    super(app, plugin)
  }

  override display(): void {
    const { containerEl } = this
    containerEl.empty()
    const { settings } = this.plugin

    new Setting(containerEl)
      .setName("Default folder for new courses")
      .setDesc("Each new course gets its own subfolder here.")
      .addText((text) =>
        text
          .setPlaceholder("Easy30")
          .setValue(settings.courseFolder)
          .onChange(async (value) => {
            settings.courseFolder = value.trim()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName("Include inferred concepts in the skim")
      .setDesc(
        "When off, concepts inferred from your answers (prerequisites of what you knew, dependents of what you did not) are skipped.",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.skimIncludeInferred).onChange(async (value) => {
          settings.skimIncludeInferred = value
          await this.plugin.saveSettings()
        }),
      )

    this.displayAi(containerEl)

    new Setting(containerEl)
      .setName("Documentation")
      .addButton((button) => button.setButtonText("Open docs").onClick(() => window.open(DOCS_URL)))
  }

  private displayAi(containerEl: HTMLElement): void {
    const { ai } = this.plugin.settings
    new Setting(containerEl).setName("AI grading").setHeading()
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Optional. When you type an answer during a review, you can ask a model to check it. Your question, the reference answer and your answer are sent to the endpoint below, only when you click the button. The API key is stored unencrypted in this plugin's data file.",
    })

    new Setting(containerEl).setName("Provider").addDropdown((dropdown) => {
      for (const [id, info] of Object.entries(AI_PRESETS)) dropdown.addOption(id, info.label)
      dropdown.setValue(ai.preset).onChange(async (value) => {
        if (!isPreset(value)) return
        ai.preset = value
        if (value !== "custom") {
          ai.baseUrl = AI_PRESETS[value].baseUrl
          ai.model = AI_PRESETS[value].model
        }
        await this.plugin.saveSettings()
        this.display()
      })
    })

    new Setting(containerEl).setName("Base URL").addText((text) =>
      text
        .setPlaceholder("https://openrouter.ai/api/v1")
        .setValue(ai.baseUrl)
        .onChange(async (value) => {
          ai.baseUrl = value.trim()
          await this.plugin.saveSettings()
        }),
    )

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Not needed for a local Ollama server.")
      .addText((text) => {
        text.inputEl.type = "password"
        text.setValue(ai.apiKey).onChange(async (value) => {
          ai.apiKey = value.trim()
          await this.plugin.saveSettings()
        })
      })

    new Setting(containerEl).setName("Model").addText((text) =>
      text.setValue(ai.model).onChange(async (value) => {
        ai.model = value.trim()
        await this.plugin.saveSettings()
      }),
    )

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Sends a one-word test prompt to the endpoint.")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setDisabled(true)
          try {
            await testConnection(ai, obsidianTransport)
            new Notice("Connection works.")
          } catch (error) {
            new Notice(error instanceof AiError ? error.message : errorMessage(error), 8000)
          } finally {
            button.setDisabled(false)
          }
        }),
      )
  }
}

function isPreset(value: string): value is AiPreset {
  return Object.hasOwn(AI_PRESETS, value)
}
