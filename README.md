# DouRate

Version 0.3.1 · Chrome Manifest V3 · personal local prototype

## 中文

DouRate 会在 Netflix、Prime Video 和 Disney+ 的标题详情页，以及可用的浏览卡片上显示可用的豆瓣与 IMDb 评分。两个来源均成功时并列显示；只有一个成功时只显示该来源；均无法使用时显示各自带原因提示的问号。

### 使用方式与数据

- 仅在上述流媒体网站页面运行，不修改播放或 DRM。
- 豆瓣评分请求从用户自己的浏览器直接发往豆瓣；Wikidata 用于跨语言片名消歧。插件不会读取、保存或公开用户名、密码或 Cookie。
- 成功匹配的豆瓣评分只保存在本机浏览器 15 天；发现验证页、HTTP 403 或 429 后，新直接查询会暂停约 30 分钟。
- IMDb 评分来自用户在工具栏弹窗中**主动下载**的官方 `title.ratings.tsv.gz` 数据集。评分索引仅保存在当前浏览器的本机 IndexedDB；不会自动下载、同步、上传给开发者或抓取 IMDb 网页。
- 下载完成后，DouRate 使用 Wikidata 的 IMDb ID 消歧后从本地索引读取 IMDb 评分与投票数。没有可靠 IMDb ID 或数据集中没有评分时不会猜测。
- 弹窗可选择**豆瓣加载模式**、查看豆瓣查询状态，以及下载、手动更新或删除 IMDb 本地数据。新安装默认“首页局部加载”；该模式只控制豆瓣的直接查询。IMDb 会优先使用已缓存的标题 ID 和本机评分索引，不受豆瓣模式限制。

### IMDb 数据边界

IMDb 数据功能仅供**个人且非商业**的本机原型使用。请勿分享 IMDb 数据、索引或包含数据的安装包，也不要将它作为公开商店发布或服务的数据来源。IMDb 页面不应由插件自动抓取；如需公开、商业或其他非个人用途，请先取得 IMDb 的相应许可。

Information courtesy of IMDb (https://www.imdb.com). Used with permission.

### 安装与使用

请阅读 [INSTALLATION.txt](INSTALLATION.txt) 获取本地安装、IMDb 数据下载与更新步骤。完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

用途与免责声明：DouRate 仅供个人日常学习和交流使用，没有任何商业用途。请勿滥用，包括批量数据采集或其他不合理用途。用户应自行对使用行为及其后果负责；开发者不对不合理使用造成的后果承担责任。使用 DouRate 不代表已获得豆瓣或 IMDb 的许可或授权。

## English

DouRate displays available Douban and IMDb ratings on Netflix, Prime Video, and Disney+ title pages and supported browse cards. When both providers succeed, they appear side by side. When only one succeeds, only that source is shown. When neither is available, each source shows its own question mark and reason.

### Behaviour and data

- Runs only on the streaming websites above; it does not alter playback or DRM.
- Douban requests go directly from the user's browser to Douban. Wikidata is used for cross-language title disambiguation. The extension does not read, store, or expose usernames, passwords, or cookie values.
- Successfully matched Douban ratings are cached locally for 15 days. A Douban verification page, HTTP 403, or HTTP 429 pauses new direct lookups for about 30 minutes.
- IMDb ratings come from the official `title.ratings.tsv.gz` dataset that the user explicitly downloads from the toolbar popup. The parsed index stays only in this browser's local IndexedDB; it is not downloaded automatically, synced, sent to a developer service, or obtained by scraping IMDb pages.
- After Wikidata resolves a reliable IMDb ID, DouRate reads the IMDb rating and vote count from the local index. It does not guess when the ID or rating is unavailable.
- The popup provides **Douban loading-mode** controls, Douban diagnostics, and IMDb download, manual update, and deletion controls. Fresh installs default to Browse: visible area; that mode controls only direct Douban requests. IMDb prioritizes cached title IDs and the local rating index independently of the Douban mode.

### IMDb data boundary

The IMDb feature is a **personal, non-commercial** local prototype only. Do not share IMDb data, an index, or an installation package containing the data, and do not use it as a source for a public store listing or service. The extension must not automatically scrape IMDb pages. Obtain the appropriate IMDb permission before any public, commercial, or other non-personal use.

Information courtesy of IMDb (https://www.imdb.com). Used with permission.

### Installation and use

See [INSTALLATION.txt](INSTALLATION.txt) for local installation and IMDb dataset download/update steps. See [CHANGELOG.md](CHANGELOG.md) for the complete version history.

Purpose and disclaimer: DouRate is provided solely for personal day-to-day learning and discussion, with no commercial purpose. Do not misuse it, including for bulk data collection or other unreasonable use. You are responsible for your own use; the developer accepts no responsibility for consequences caused by unreasonable use. Using DouRate does not grant any permission or authorization from Douban or IMDb.
