# DouRate

Version 0.2.4 · Chrome Manifest V3 · local installation package

## 中文

DouRate 会在 Netflix、Prime Video 和 Disney+ 的标题详情页，以及可用的浏览卡片上显示豆瓣评分。点击评分可打开对应的豆瓣条目；无法可靠匹配时显示问号，并链接至豆瓣搜索。

### 使用方式与数据

- 仅在上述流媒体网站页面运行，不修改播放或 DRM。
- 评分请求从用户自己的浏览器直接发往豆瓣；Wikidata 仅用于跨语言片名消歧。
- 不读取、保存或公开用户名、密码或 Cookie。浏览器可能使用已有的正常豆瓣登录会话。
- 成功匹配的评分只保存在本机浏览器 15 天；不会同步或发送给开发者服务。
- 发现豆瓣验证页、HTTP 403 或 429 后，插件会暂停新的直接查询约 30 分钟；已缓存评分仍可显示。
- 工具栏菜单可选择加载模式，并查看最近一次查询成功／失败、验证暂停状态及用户主动打开豆瓣的入口。

### 安装与使用

请阅读 [INSTALLATION.txt](INSTALLATION.txt) 获取本地安装步骤。完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

用途与免责声明：DouRate 仅供个人日常学习和交流使用，没有任何商业用途。请勿滥用，包括批量数据采集或其他不合理用途。用户应自行对使用行为及其后果负责；开发者不对不合理使用造成的后果承担责任。使用 DouRate 不代表已获得豆瓣的许可或授权。

## English

DouRate displays available Douban ratings on Netflix, Prime Video, and Disney+ title pages and supported browse cards. Clicking a rating opens the matching Douban title. When a reliable match is unavailable, it shows a question mark linked to a Douban search instead of guessing.

### Behaviour and data

- Runs only on the streaming websites above; it does not alter playback or DRM.
- Rating requests go directly from the user's browser to Douban. Wikidata is used only to disambiguate cross-language titles.
- It does not read, store, or expose usernames, passwords, or cookie values. The browser may use an existing normal Douban session.
- Successfully matched ratings are cached locally in the browser for 15 days; they are never synced or sent to a developer-operated service.
- When a Douban verification page, HTTP 403, or HTTP 429 is detected, new direct lookups pause for about 30 minutes while cached ratings remain available.
- The toolbar popup provides loading-mode controls, recent lookup status, verification-pause status, and a user-initiated link to Douban.

### Installation and use

See [INSTALLATION.txt](INSTALLATION.txt) for local installation steps. See [CHANGELOG.md](CHANGELOG.md) for the complete version history.

Purpose and disclaimer: DouRate is provided solely for personal day-to-day learning and discussion, with no commercial purpose. Do not misuse it, including for bulk data collection or other unreasonable use. You are responsible for your own use; the developer accepts no responsibility for consequences caused by unreasonable use. Using DouRate does not grant any permission or authorization from Douban.
