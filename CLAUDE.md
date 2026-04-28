# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build:dev     # Development build + install to Typora dev plugins + launch Typora
npm run build         # Production build (minified, no sourcemap)
npm run pack          # Build + create plugin.zip for distribution
npm test              # Run all tests (Node test runner with tsx)
npm test -- --test-name-pattern="<pattern>"  # Run tests matching a pattern
```

`build:dev` runs `esbuild` with the `esbuild-plugin-typora` dev mode, which copies output to Typora's dev plugin directory and launches Typora with `./test/vault/doc.md`. The build copies `src/manifest.json` to `dist/` and renames the Sass output from `main.css` to `style.css` (Typora expects `style.css` at the plugin root).

## Architecture

This is a **Typora bilingual translation plugin** that runs on the `typora-community-plugin` host. It calls OpenAI-compatible LLM APIs to translate Markdown documents while preserving structure.

**Entry point**: `src/main.ts` → `BilingualTranslatePlugin` extends `Plugin<TranslationPluginSettings>`. All lifecycle hooks (`onload`, `onunload`) and command registration happen here.

**Translation pipeline** (`src/translation/`):
1. `markdown.ts` — Splits Markdown into blocks (headings, paragraphs, tables, fenced code, math, frontmatter), classifies each as eligible/raw/legacy-translation, builds a `TranslationPlan` with tasks, and applies translated results back into the document. Uses hash-based dedup: same source → skip re-translation.
2. `api.ts` — Sends batched translation tasks to an OpenAI-compatible `/chat/completions` endpoint. Handles endpoint resolution, prompt template rendering, and response parsing (accepts plain JSON arrays, fenced JSON, structured objects with `translation`/`text`/`markdown` keys).
3. `hash.ts` — FNV-1a hash (with whitespace normalization) for tracking translation memory, so unchanged source blocks don't get re-translated.
4. `types.ts` — All shared interfaces: `TranslationTask`, `TranslationPlan`, `PlannedEntry`, `TranslationMemoryEntry`, etc.

**Translation markers in Markdown**: The plugin wraps legacy translations in HTML comments:
```
<!-- typora-translate:start lang="zh-CN" source-hash="abc123" -->
[译]
 translated content
<!-- typora-translate:end -->
```
The current version writes translations as plain Markdown blocks (no HTML comments), but the parser still recognizes and migrates these legacy markers (`legacy-translation` block kind). The `[译]` prefix line inside legacy markers is stripped during parsing.

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
- Clipboard operations for selection capture use a cascade of fallbacks: `navigator.clipboard API` → `editor.UserOp` → `JSBridge` → `document.execCommand('copy')`. Auto-translate is suppressed during clipboard writes via `withAutoTranslateSuppressed` to prevent feedback loops.
- Translation memory is stored per-file-per-language in plugin settings under the `translationMemory` key.
- Auto-translate selection uses a version counter (`autoTranslateRequestVersion`) to cancel stale in-flight requests.
- The `isInputComponent(document.activeElement)` guard prevents auto-translate from firing when focus is in input fields, textareas, or the settings panel.
- `translateInBatches` and `translateBatch` accept an optional `fetchImpl` parameter (defaults to global `fetch`), enabling mock injection in tests.
- Replacing document content uses a fallback cascade: `File.reloadContent()` → `File.setContent()` → `JSBridge.invoke('document.setContent')`.

**Test**: `test/translation.test.ts` uses Node's built-in test runner (`node --import tsx --test`). Tests cover the translation pipeline: block splitting, plan building, hash-based dedup, legacy marker migration, batch creation, and API response parsing.

---

# CLAUDE.md（中文）

此文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指导。

## 构建与测试命令

```bash
npm run build:dev     # 开发构建 + 安装到 Typora 开发插件目录 + 启动 Typora
npm run build         # 生产构建（压缩，无 sourcemap）
npm run pack          # 构建并生成 plugin.zip 用于分发
npm test              # 运行所有测试（Node 原生测试运行器 + tsx）
npm test -- --test-name-pattern="<pattern>"  # 按名称匹配运行测试
```

`build:dev` 使用 `esbuild-plugin-typora` 的开发模式运行 `esbuild`，会将输出复制到 Typora 的开发插件目录，并用 `./test/vault/doc.md` 启动 Typora。构建过程会将 `src/manifest.json` 复制到 `dist/`，并将 Sass 输出从 `main.css` 重命名为 `style.css`（Typora 要求在插件根目录读取 `style.css`）。

## 架构

这是一个**Typora 双语翻译插件**，运行在 `typora-community-plugin` 宿主之上。通过调用 OpenAI 兼容的大语言模型 API 翻译 Markdown 文档，并尽量保留原有结构。

**入口文件**：`src/main.ts` → `BilingualTranslatePlugin` 继承 `Plugin<TranslationPluginSettings>`。所有生命周期钩子（`onload`、`onunload`）和命令注册均在此处完成。

**翻译流水线**（`src/translation/`）：
1. `markdown.ts` — 将 Markdown 按块拆分（标题、段落、表格、围栏代码块、数学块、front matter），逐一归类为可翻译/原文/旧版翻译，构建包含任务的 `TranslationPlan`，并将翻译结果回写到文档中。支持基于 hash 的去重：相同源文本 → 跳过重复翻译。
2. `api.ts` — 将批量翻译任务发送至 OpenAI 兼容的 `/chat/completions` 接口。处理端点解析、提示词模板渲染和响应解析（可解析纯 JSON 数组、含围栏的 JSON、带 `translation`/`text`/`markdown` 键的结构化对象）。
3. `hash.ts` — FNV-1a hash（含空白字符规范化），用于跟踪翻译记忆，使得未修改的源文本块不会被重复翻译。
4. `types.ts` — 所有共享接口：`TranslationTask`、`TranslationPlan`、`PlannedEntry`、`TranslationMemoryEntry` 等。

**Markdown 中的翻译标记**：插件使用 HTML 注释包裹旧版翻译：
```
<!-- typora-translate:start lang="zh-CN" source-hash="abc123" -->
[译]
 译文内容
<!-- typora-translate:end -->
```
当前版本将翻译直接写为纯 Markdown 块（不再使用 HTML 注释），但解析器仍能识别并迁移这些旧版标记（`legacy-translation` 块类型）。旧版标记中的 `[译]` 前缀行会在解析时被去除。

**UI 组件**（每个文件位于 `src/` 下）：
- `status-bar.ts` — `StatusBarButton` 类：向 Typora 底部状态栏注入两个 SVG 图标按钮（行内翻译 + 新文件翻译），通过监听 DOM 变更确保状态栏变化后能重新挂载。
- `selection-popover.ts` — `SelectionTranslationPopover` 类：浮动弹窗定位在文本选区附近，具备加载中/结果/错误状态和复制到剪贴板按钮。
- `setting-tab.ts` — `TranslationSettingTab` 继承 `SettingTab`：渲染插件设置面板（API 配置、自动翻译开关 + 延迟、目标语言、系统提示词模板、批次字符上限、"测试 API"按钮）。
- `i18n.ts` — I18n 实例，包含 `en` 和 `zh-cn` 资源，以及一个 `formatMessage` 辅助函数。
- `settings.ts` — 设置接口、默认值，以及 `normalizeAutoTranslateDelayMs` 辅助函数。设置有版本号（`SETTINGS_VERSION = 3`）。
- `style.scss` — 所有插件 CSS，使用 `.typora-translate-*` 类名前缀做作用域隔离。

**关键模式**：
- 设置始终通过 `snapshotSettings()` 读取 — 切勿在异步代码中直接访问 `this.settings.get()`，以避免跨 await 边界读到过期配置。
- Typora 的 `File` 和 `editor` API 使用类型断言（`as unknown as { ... }`）访问，因为官方的 `@types/typora` 包类型定义不完整。
- 选区捕获的剪贴板操作使用级联回退：`navigator.clipboard API` → `editor.UserOp` → `JSBridge` → `document.execCommand('copy')`。在执行剪贴板写入时，通过 `withAutoTranslateSuppressed` 暂时抑制自动翻译，防止触发反馈循环。
- 翻译记忆以"按文件、按目标语言"的结构存储在插件设置的 `translationMemory` 键下。
- 选区自动翻译使用版本计数器（`autoTranslateRequestVersion`）来取消已过期的进行中请求。
- `isInputComponent(document.activeElement)` 守卫用于防止焦点在输入框、文本域或设置面板时触发自动翻译。
- `translateInBatches` 和 `translateBatch` 接受可选的 `fetchImpl` 参数（默认使用全局 `fetch`），便于在测试中注入 mock。
- 替换文档内容使用级联回退：`File.reloadContent()` → `File.setContent()` → `JSBridge.invoke('document.setContent')`。

**测试**：`test/translation.test.ts` 使用 Node 原生测试运行器（`node --import tsx --test`）。测试覆盖翻译流水线：块拆分、计划构建、基于 hash 的去重、旧版标记迁移、批次创建和 API 响应解析。
