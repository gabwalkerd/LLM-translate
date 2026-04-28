# Typora Bilingual Translate

Typora 双语翻译插件，运行在 [`typora-community-plugin`](https://github.com/typora-community-plugin/typora-community-plugin) 宿主之上。插件通过 OpenAI 兼容的 Chat Completions 接口翻译 Markdown 文档，并尽量保留标题、列表、表格、链接、强调、行内代码等 Markdown 结构。

## 功能特性

- 整篇文档双语翻译：在原文块后插入译文块。
- 整篇文档译文另存：生成只包含译文的新 Markdown 文件，并在右侧分屏打开。
- 划词弹窗翻译：选中文本后自动显示翻译弹窗，支持复制或插入译文。
- 选区译文插入：可将弹窗译文插入到当前选区所在 Markdown 块之后。
- OpenAI 兼容接口：可配置 `Base URL`、`API Key` 和 `Model`。
- 结构化 Markdown 处理：支持段落、标题、列表、表格等常见块级内容。
- 跳过不应翻译的内容：默认跳过 front matter、代码块、数学块、HTML 块、缩进代码块。
- 翻译记忆：同一文件、同一目标语言下，已翻译且未变化的原文块会被跳过。
- 批量翻译：按字符数拆分请求，降低单次请求过大的风险。

## 适用场景

- 阅读英文技术文档时，在 Typora 中生成中英双语版本。
- 将笔记、文章、课程材料翻译成目标语言。
- 保留 Markdown 原始结构，减少翻译后手动修格式的工作。
- 本地调试 Typora 社区插件开发流程。

## 环境要求

- Typora
- [`typora-community-plugin`](https://github.com/typora-community-plugin/typora-community-plugin)
- Node.js 18 或更高版本
- npm
- 一个 OpenAI 兼容的 API 服务

## 快速开始

```powershell
npm install
npm run pack
```

执行完成后，项目根目录会生成：

```text
plugin.zip
dist/
```

其中 `plugin.zip` 可用于安装，`dist` 目录内包含 Typora 插件实际需要的文件：

```text
manifest.json
main.js
style.css
```

更详细的本地安装步骤见：

- [docs/LOCAL_INSTALL_TYPORA.zh-CN.md](./docs/LOCAL_INSTALL_TYPORA.zh-CN.md)

## 安装到 Typora

1. 先安装并启用 `typora-community-plugin` 宿主。
2. 执行 `npm run pack` 生成 `plugin.zip`。
3. 在 Typora 社区插件目录下创建插件目录：

```text
codex.bilingual-translate
```

4. 将 `plugin.zip` 内的文件解压到该目录，确保目录结构为：

```text
codex.bilingual-translate/manifest.json
codex.bilingual-translate/main.js
codex.bilingual-translate/style.css
```

5. 重启 Typora，在社区插件设置中启用 `Bilingual Translate`。

注意：不要把 `dist` 整个目录放进插件目录中。Typora 需要直接读取插件目录根部的 `manifest.json`、`main.js` 和 `style.css`。

## 首次配置

启用插件后，在插件设置页填写：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `Base URL` | OpenAI 兼容接口地址 | `https://api.openai.com/v1` |
| `API Key` | API 密钥 | 空 |
| `Model` | 翻译使用的模型 | `gpt-4.1-mini` |
| `Default target language` | 默认目标语言 | `zh-CN` |
| `System prompt template` | 系统提示词模板 | 内置翻译提示词 |
| `Batch char limit` | 每批翻译的字符上限 | `4000` |
| `Auto translate selection` | 是否开启划词弹窗翻译 | `false` |
| `Auto translate delay` | 划词后触发翻译的延迟 | `300 ms` |

`Base URL` 会自动解析为 Chat Completions 地址。例如：

```text
https://api.openai.com/v1
```

会请求：

```text
https://api.openai.com/v1/chat/completions
```

如果你已经填写完整配置，可以点击设置页中的 `Test API` 验证接口是否能返回插件期望的 JSON 翻译结果。

## 使用方式

### 翻译当前文档

在 Typora 中打开 Markdown 文件后，可以通过以下方式触发：

- 命令面板：`Translate current document`
- 快捷键：`Alt+Ctrl+T`
- 状态栏按钮：翻译当前文档

插件会读取当前文档，将可翻译的 Markdown 块发送给模型，并在每个原文块后插入译文。

示例：

```markdown
Hello world.

你好，世界。
```

### 重新翻译当前文档

通过命令面板执行：

```text
Retranslate current document
```

普通翻译会尽量跳过已翻译且未变化的内容；重新翻译会强制替换已有译文。

### 生成译文新文件

通过命令面板或状态栏的新文件翻译按钮触发：

```text
Translate current document to a new file
```

插件会在源文件同目录下生成新文件，文件名格式类似：

```text
example_zh.md
```

该功能要求当前文档已经保存到磁盘，因为插件需要根据源文件路径生成新文件路径。

### 选区翻译

选中 Typora 文档中的一段内容后，使用快捷键：

```text
Alt+Shift+Ctrl+T
```

该快捷键用于开启或关闭划词弹窗翻译。开启后，选中文本会自动显示翻译弹窗，弹窗支持：

- 复制译文
- 将译文插入到当前选区所在 Markdown 块之后
- 关闭弹窗

## 翻译规则

插件会把 Markdown 拆分为块级内容，然后只翻译适合翻译的自然语言块。

默认会翻译：

- 标题
- 段落
- 列表
- 表格
- 引用等普通 Markdown 文本块

默认会保留原样：

- YAML front matter
- fenced code block
- 数学块
- HTML 块
- 缩进代码块

翻译请求要求模型返回 JSON 数组，并且数组顺序必须与输入块顺序一致。插件可以解析以下几类常见响应：

```json
["译文 1", "译文 2"]
```

```json
{"translations":[{"translation":"译文 1"},{"text":"译文 2"}]}
```

```json
[{"markdown":"译文 1"}, ["译文 2"]]
```

## 开发命令

```powershell
npm install
npm run build:dev
npm run build
npm run pack
npm test
```

命令说明：

| 命令 | 说明 |
| --- | --- |
| `npm run build:dev` | 开发构建，包含 sourcemap，不压缩 |
| `npm run build` | 生产构建，压缩输出 |
| `npm run pack` | 生产构建并生成 `plugin.zip` |
| `npm test` | 运行翻译流水线测试 |

## 项目结构

```text
src/
  main.ts                 插件入口，注册命令、状态栏、设置页和翻译流程
  settings.ts             设置类型、默认值和设置版本
  setting-tab.ts          Typora 插件设置页
  status-bar.ts           状态栏按钮
  selection-popover.ts    划词翻译弹窗
  i18n.ts                 中英文文案
  style.scss              插件样式
  translation/
    api.ts                OpenAI 兼容 API 请求与响应解析
    hash.ts               文本 hash，用于翻译记忆
    markdown.ts           Markdown 拆块、翻译计划和结果回写
    types.ts              翻译流水线类型
test/
  translation.test.ts     翻译流水线单元测试
docs/
  LOCAL_INSTALL_TYPORA.zh-CN.md
```

## 核心流程

整篇文档翻译流程：

1. 从 Typora 读取当前 Markdown。
2. 按 Markdown 块拆分文档。
3. 过滤代码块、数学块、front matter 等不应翻译的内容。
4. 根据翻译记忆判断哪些块需要翻译。
5. 按 `Batch char limit` 拆分请求。
6. 调用 OpenAI 兼容 `/chat/completions` 接口。
7. 解析模型返回的译文数组。
8. 将译文插入原文后方，或替换旧译文。
9. 更新当前文件、当前目标语言下的翻译记忆。

译文新文件流程：

1. 构建与整篇翻译相同的翻译计划。
2. 对需要翻译的块发起请求。
3. 生成只包含译文的新 Markdown。
4. 写入源文件同目录下的新文件。
5. 在 Typora 右侧分屏打开新文件。

划词翻译流程：

1. 监听 Typora 编辑区选区变化。
2. 延迟指定时间后读取选中文本。
3. 发送单条翻译请求。
4. 在选区附近展示弹窗。
5. 用户选择复制译文或插入译文。

## AI vibe coding 工作流

这个项目适合用 AI 辅助进行小步快跑式开发。推荐流程如下。

### 1. 明确目标

先把需求写成可以验证的结果，而不是只写一句模糊描述。

示例：

```text
目标：增加一个“翻译为新文件”的命令。
验收：命令面板出现该命令；执行后在源文件同目录生成 *_zh.md；代码块不被翻译；npm test 通过。
```

### 2. 让 AI 先读代码

开始实现前，让 AI 先阅读这些文件：

- `src/main.ts`
- `src/translation/markdown.ts`
- `src/translation/api.ts`
- `src/settings.ts`
- `test/translation.test.ts`

推荐提示词：

```text
请先阅读项目结构和关键文件，说明当前翻译流水线、设置项、命令注册和测试覆盖，不要立即改代码。
```

### 3. 拆成可回滚的小任务

一次只改一个行为边界，避免同时修改 UI、API、Markdown 解析和打包逻辑。

推荐拆法：

- 先写或补测试。
- 再改 `src/translation/*` 里的纯逻辑。
- 然后接入 `src/main.ts`。
- 最后补设置页、样式或文档。

### 4. 先要方案，再要补丁

让 AI 先输出简短实现方案，并指出会改哪些文件。

推荐提示词：

```text
请给出实现方案和涉及文件。确认方案后再修改代码。优先沿用现有架构，不引入新依赖。
```

确认后再让 AI 执行：

```text
按上面的方案实现。保持改动最小，补充必要测试，最后运行 npm test。
```

### 5. 用测试约束 AI 输出

这个仓库的翻译流水线测试集中在 `test/translation.test.ts`。新增或修改以下逻辑时，应优先补测试：

- Markdown 拆块规则
- 翻译记忆
- 旧译文替换
- 批量请求拆分
- API 响应解析
- 译文新文件内容生成

常用命令：

```powershell
npm test
```

### 6. 本地构建验证

测试通过后再构建和打包：

```powershell
npm run build
npm run pack
```

然后把 `plugin.zip` 或 `dist` 里的文件安装到 Typora 插件目录，手动验证：

- 插件能启用
- 设置页能保存配置
- `Test API` 可用
- 整篇翻译可用
- 译文新文件可用
- 划词弹窗不会遮挡编辑内容

### 7. 让 AI 做代码审查

实现完成后，可以让 AI 以审查模式检查风险。

推荐提示词：

```text
请以 code review 方式检查本次改动，优先指出 bug、回归风险、缺失测试和 Typora API 兼容性问题。
```

### 8. 保持上下文干净

给 AI 的上下文尽量包含：

- 这次要解决的问题
- 期望行为
- 相关文件
- 复现步骤
- 当前报错或测试输出

避免一次塞入无关需求。对于 Typora 插件，很多问题来自宿主 API 和 DOM 行为，最好附上具体平台、Typora 版本、操作步骤和实际现象。

## 常见 AI 协作提示词

### 修 bug

```text
问题：执行整篇翻译后，表格格式被破坏。
请先阅读 src/translation/markdown.ts 和 test/translation.test.ts，补一个失败测试，再修复实现，最后运行 npm test。
```

### 加功能

```text
需求：增加一个设置项，用于控制是否跳过标题翻译。
验收：设置页可配置；默认保持现有行为；关闭后标题不发送到 API；补测试；npm test 通过。
```

### 调整 UI

```text
需求：优化划词翻译弹窗的错误状态。
请阅读 src/selection-popover.ts 和 src/style.scss，保持现有 class 命名风格，只改必要样式和文案。
```

### 发版前检查

```text
请检查当前仓库是否可发版：运行测试和构建，确认 plugin.zip 包含 manifest.json、main.js、style.css，并总结风险。
```

## 调试建议

### 插件没有显示

检查插件目录是否直接包含：

```text
manifest.json
main.js
style.css
```

如果文件被放在 `dist/` 子目录里，Typora 通常不会识别插件。

### 提示缺少配置

确认以下设置都不为空：

- `Base URL`
- `API Key`
- `Model`

### API 测试失败

优先检查：

- `Base URL` 是否为 OpenAI 兼容服务地址。
- 服务是否支持 `/chat/completions`。
- 模型名称是否正确。
- API Key 是否有权限。
- 模型是否按提示词返回 JSON 数组。

### 翻译结果数量不匹配

插件要求模型返回的译文数量与输入块数量一致。如果模型返回解释性文字、少返回或多返回译文，插件会报错。可以加强 `System prompt template`，明确要求：

```text
Return only a valid JSON array of translated strings in the same order as the input.
```

### 选区翻译失败

选区翻译依赖 Typora 当前选区和剪贴板能力。若失败：

- 先用整篇翻译确认 API 配置无误。
- 确认选区位于 Typora 编辑区内。
- 避免选中设置页、弹窗或输入框中的文本。
- 重启 Typora 后重试。

## 发版检查清单

发版或手动分发前建议执行：

```powershell
npm test
npm run build
npm run pack
```

检查：

- `npm test` 通过。
- `dist/manifest.json` 存在。
- `dist/main.js` 存在。
- `dist/style.css` 存在。
- `plugin.zip` 存在。
- `plugin.zip` 解压后根部直接包含 `manifest.json`、`main.js`、`style.css`。

## License

MIT
