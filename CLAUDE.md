# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build:dev     # Development build (sourcemap, no minify)
npm run build         # Production build (minified, no sourcemap)
npm run pack          # Build + create plugin.zip for distribution
npm test              # Run all tests (Node test runner with tsx)
npm test -- --test-name-pattern="<pattern>"  # Run tests matching a pattern
```

## Architecture

This is a **Typora bilingual translation plugin** that runs on the `typora-community-plugin` host. It calls OpenAI-compatible LLM APIs to translate Markdown documents while preserving structure.

**Entry point**: `src/main.ts` → `BilingualTranslatePlugin` extends `Plugin<TranslationPluginSettings>`. All lifecycle hooks (`onload`, `onunload`) and command registration happen here.

**Translation pipeline** (`src/translation/`):
1. `markdown.ts` — Splits Markdown into blocks (headings, paragraphs, tables, fenced code, math, frontmatter), classifies each as eligible/raw/legacy-translation, builds a `TranslationPlan` with tasks, and applies translated results back into the document. Uses hash-based dedup: same source → skip re-translation.
2. `api.ts` — Sends batched translation tasks to an OpenAI-compatible `/chat/completions` endpoint. Handles endpoint resolution, prompt template rendering, and response parsing (accepts plain JSON arrays, fenced JSON, structured objects with `translation`/`text`/`markdown` keys).
3. `hash.ts` — FNV-1a hash (with whitespace normalization) for tracking translation memory, so unchanged source blocks don't get re-translated.
4. `types.ts` — All shared interfaces: `TranslationTask`, `TranslationPlan`, `PlannedEntry`, `TranslationMemoryEntry`, etc.

**UI components** (each in own file under `src/`):
- `status-bar.ts` — `StatusBarButton` class: injects two SVG icon buttons into Typora's footer (inline translate + new-file translate), listens for DOM mutations to re-mount if the footer changes.
- `selection-popover.ts` — `SelectionTranslationPopover` class: floating popup positioned near text selection, with loading/result/error states and a copy-to-clipboard button.
- `setting-tab.ts` — `TranslationSettingTab` extends `SettingTab`: renders the plugin settings panel (API config, auto-translate toggle + delay, target language, system prompt template, batch char limit, "Test API" button).
- `i18n.ts` — I18n instance with `en` and `zh-cn` resources, plus a `formatMessage` helper.
- `settings.ts` — Settings interface, defaults, and `normalizeAutoTranslateDelayMs` helper. Settings are versioned (`SETTINGS_VERSION = 3`).
- `style.scss` — All plugin CSS, scoped with `.typora-translate-*` class prefixes.

**Key patterns**:
- Settings are always read via `snapshotSettings()` — never access `this.settings.get()` directly in async code, to avoid stale config across await boundaries.
- Typora's `File` and `editor` APIs are accessed with type casts (`as unknown as { ... }`) because the official `@types/typora` package is incomplete.
- Clipboard operations for selection capture use a cascade of fallbacks: `navigator.clipboard API` → `editor.UserOp` → `JSBridge` → `document.execCommand('copy')`.
- Translation memory is stored per-file-per-language in plugin settings under the `translationMemory` key.
- Auto-translate selection uses a version counter (`autoTranslateRequestVersion`) to cancel stale in-flight requests.

**Test**: `test/translation.test.ts` uses Node's built-in test runner (`node --import tsx --test`). Tests cover the translation pipeline: block splitting, plan building, hash-based dedup, legacy marker migration, batch creation, and API response parsing.
