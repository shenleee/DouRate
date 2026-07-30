# DouRate

Chrome Manifest V3 · v0.3.4

## 中文

DouRate 在 Netflix、Prime Video 和 Disney+ 的标题详情页及支持的浏览卡片上显示可用的豆瓣与 IMDb 评分，帮助更快比较作品。

### 快速开始

1. 使用随此版本提供的 `dourate-demo-0.3.4.zip`；发布后也可从 [最新 Release](https://github.com/shenleee/DouRate/releases/latest) 下载对应版本。
2. 解压 ZIP，在 Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择直接包含 `manifest.json` 的 DouRate 文件夹。
4. 刷新 Netflix、Prime Video 或 Disney+ 页面。

### 文档

- [安装与更新 / INSTALLATION.txt](INSTALLATION.txt)
- [隐私政策 / PRIVACY.md](PRIVACY.md)
- [版本记录 / CHANGELOG.md](CHANGELOG.md)
- [完整用户文档 / Wiki](https://github.com/shenleee/DouRate/wiki)：产品概览、工作方式与限制、支持平台、FAQ、故障排查、隐私与数据来源。

### 项目边界

插件在用户浏览器中运行，不提供开发者后端。豆瓣查询由用户浏览器直接发起；IMDb 首次数据下载需用户主动触发，之后可选择在该浏览器自动更新。请勿批量采集、共享 IMDb 数据或将其用于公开／商业服务。详情见 [Wiki 的隐私与数据来源说明](https://github.com/shenleee/DouRate/wiki/Privacy-and-Data-Sources)。

## English

DouRate shows available Douban and IMDb ratings on title pages and supported browse cards for Netflix, Prime Video, and Disney+, making titles easier to compare.

### Quick start

1. Use the `dourate-demo-0.3.4.zip` provided with this version; once published, the matching version can also be downloaded from the [latest Release](https://github.com/shenleee/DouRate/releases/latest).
2. Extract it, open `chrome://extensions` in Chrome, and enable Developer mode.
3. Select **Load unpacked**, then choose the DouRate folder that directly contains `manifest.json`.
4. Refresh Netflix, Prime Video, or Disney+.

### Documentation

- [Installation and updates / INSTALLATION.txt](INSTALLATION.txt)
- [Privacy policy / PRIVACY.md](PRIVACY.md)
- [Version history / CHANGELOG.md](CHANGELOG.md)
- [Full user documentation / Wiki](https://github.com/shenleee/DouRate/wiki): overview, behaviour and limits, supported platforms, FAQ, troubleshooting, privacy, and data sources.

### Project boundary

The extension runs in the user’s browser and has no developer backend. Douban requests are made directly by the user’s browser; the first IMDb-data download requires a user action, after which the user can choose automatic updates in that browser. Do not bulk-collect, redistribute IMDb data, or use it in a public/commercial service. See the [Privacy & Data Sources wiki page](https://github.com/shenleee/DouRate/wiki/Privacy-and-Data-Sources).
