# 本地安装到 Typora

这份文档说明如何把当前仓库里的插件手动安装到本机 Typora 中。

适用前提：

- 你已经有一个可用的 Typora
- 你接受使用 `typora-community-plugin` 作为 Typora 的社区插件宿主
- 你当前项目目录是 `D:\GoCode\tranlate-plugin`

## 1. 先准备插件产物

在项目根目录运行：

```powershell
cd D:\GoCode\tranlate-plugin
npm install
npm run pack
```

执行完成后，会生成可安装包 `plugin.zip`。

如果你不想使用 ZIP，也可以直接使用构建目录 `dist`。

## 2. 安装 `typora-community-plugin` 宿主

这个项目不是 Typora 官方插件，必须先安装社区插件宿主。

参考社区插件文档，常用安装方式如下。

### Windows

1. 打开社区插件发布页：[typora-community-plugin Releases](https://github.com/typora-community-plugin/typora-community-plugin/releases)
2. 下载 `typora-community-plugin.zip`
3. 解压
4. 把解压后的文件复制到：

```text
%UserProfile%\.typora\community-plugins
```

5. 以管理员身份打开 `cmd`
6. 执行：

```cmd
mklink /d %UserProfile%\AppData\Roaming\Typora\plugins %UserProfile%\.typora\community-plugins
```

7. 备份 Typora 安装目录下的：

```text
{Typora安装目录}\resources\window.html
```

8. 用 UTF-8 编码打开该文件，把末尾：

```html
</body></html>
```

替换为：

```html
<script src="typora://app/userData/plugins/loader.js" type="module"></script></body></html>
```

9. 重启 Typora

安装成功后，Typora 里会出现社区插件提供的设置和插件管理界面。

### macOS / Linux

宿主安装方式和路径与社区插件官方文档一致，直接参考：

- 社区插件安装说明：[如何安装](https://github.com/typora-community-plugin/typora-community-plugin/blob/main/docs/zh-cn/user-guide/1a-installation.md)

如果你只是本机 Windows 使用，到这里即可。

## 3. 确定插件安装目录

安装完 `typora-community-plugin` 后，本插件有两种常见安装位置。

### 方案 A：全局安装

Windows 全局目录通常是：

```text
%UserProfile%\.typora\community-plugins\plugins
```

在这个目录下，为本插件新建一个文件夹：

```text
codex.bilingual-translate
```

最终目录形态应当像这样：

```text
%UserProfile%\.typora\community-plugins\plugins\codex.bilingual-translate
```

### 方案 B：当前笔记库安装

如果你只想在某个笔记目录里使用，可以在当前打开的笔记库根目录下创建：

```text
.typora\plugins\codex.bilingual-translate
```

例如：

```text
D:\Notes\.typora\plugins\codex.bilingual-translate
```

## 4. 安装本插件

推荐用以下两种方式之一。

### 方式 1：从 `plugin.zip` 安装

1. 关闭 Typora
2. 打开项目根目录中的 `plugin.zip`
3. 把 ZIP 内的文件解压到你在上一步创建的插件目录里

解压完成后，该目录下应直接包含这些文件：

```text
manifest.json
main.js
style.css
```

不要多出一层无关目录。也就是说，不能变成：

```text
codex.bilingual-translate\dist\main.js
```

正确结构必须是：

```text
codex.bilingual-translate\manifest.json
codex.bilingual-translate\main.js
codex.bilingual-translate\style.css
```

### 方式 2：直接从 `dist` 复制

1. 关闭 Typora
2. 打开项目根目录中的 `dist`
3. 把 `dist` 里的三个文件复制到目标插件目录：

- `manifest.json`
- `main.js`
- `style.css`

## 5. 在 Typora 中启用插件

1. 启动 Typora
2. 打开社区插件设置窗口
3. 进入“已安装插件”
4. 找到 `Bilingual Translate` 或 `双语翻译`
5. 勾选启用

如果没有显示这个插件，优先检查：

- 你是否已经先安装了 `typora-community-plugin`
- 插件目录名称是否为 `codex.bilingual-translate`
- `manifest.json`、`main.js`、`style.css` 是否直接位于插件目录根部
- 是否把文件错误地放进了 `dist` 子目录

## 6. 首次配置

启用后，进入插件设置，填写：

- `Base URL`
- `API Key`
- `Model`
- `Default target language`
- `System prompt template`
- `Batch char limit`

默认是 OpenAI 兼容接口，若你填写：

```text
https://api.openai.com/v1
```

插件实际请求地址会变成：

```text
https://api.openai.com/v1/chat/completions
```

## 7. 验证是否安装成功

打开任意 Markdown 文档后，验证以下任一项：

- 状态栏出现“翻译”或“翻译选区”按钮
- 命令面板里能看到“翻译当前文档”
- 快捷键 `Alt+Ctrl+T` 能触发整篇翻译
- 快捷键 `Alt+Shift+Ctrl+T` 能触发选区翻译

如果状态栏按钮没出现，不代表安装失败。当前实现对状态栏使用的是 DOM 注入，你仍然可以通过命令面板和快捷键使用插件。

## 8. 常见问题

### 插件没有显示

优先检查目录结构是否正确：

```text
...plugins\codex.bilingual-translate\manifest.json
...plugins\codex.bilingual-translate\main.js
...plugins\codex.bilingual-translate\style.css
```

如果文件在 `dist` 子目录里，Typora 不会正确识别。

### 启用了但没有反应

检查插件设置里是否已经填写：

- Base URL
- API Key
- Model

缺少其中任意一项，插件不会发起翻译请求。

### 选区翻译失败

当前选区翻译依赖 Typora 当前选中内容和剪贴板读写。若失败，先用整篇翻译确认 API 配置无误，再重试选区翻译。

### 想升级插件

重新执行：

```powershell
cd D:\GoCode\tranlate-plugin
npm run pack
```

然后用新生成的 `plugin.zip` 覆盖安装目录中的旧文件即可。
