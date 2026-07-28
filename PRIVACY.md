# DouRate Privacy Policy / DouRate 隐私政策

**Last updated / 最后更新：2026-07-26**

This Privacy Policy describes how the DouRate Chrome extension handles information. DouRate does not operate a developer-owned backend, account system, analytics service, advertising system, or remote rating database.

本隐私政策说明 DouRate Chrome 插件如何处理信息。DouRate 不运行开发者自有后端、账号系统、分析服务、广告系统或远程评分数据库。

## 1. What DouRate does / 插件用途

DouRate adds available Douban and IMDb ratings to title pages and browse cards on Netflix, Prime Video, and Disney+. It does not modify playback, DRM, subscriptions, recommendations, or account settings on those platforms.

DouRate 会在 Netflix、Prime Video 和 Disney+ 的作品详情页及可用浏览卡片上显示可用的豆瓣与 IMDb 评分。插件不会修改播放、DRM、订阅、推荐或这些平台的账号设置。

## 2. Information processed / 处理的信息

DouRate may process the following information locally or while making a user-requested lookup:

- The title name, year, media type, and platform content identifier exposed by the streaming page, used to match a work.
- A matched Douban score, IMDb score, source link, match metadata, and lookup status.
- Local settings such as the selected Douban loading mode and diagnostic status.
- User-initiated IMDb dataset status and metadata, such as update time, source date/header information, and indexed row count.

DouRate 可能在本机或用户主动发起查询时处理以下信息：

- 流媒体页面公开提供的作品名称、年份、影视类型和平台内容 ID，用于作品匹配；
- 匹配到的豆瓣评分、IMDb 评分、来源链接、匹配元数据和查询状态；
- 本地设置，例如豆瓣加载模式和诊断状态；
- 用户主动下载的 IMDb 数据集状态和元数据，例如更新时间、来源日期／响应头信息及索引行数。

DouRate does not intentionally collect or store usernames, passwords, payment details, browsing history, full page contents, or cookie values. It does not sell, rent, or use this information for advertising or profiling.

DouRate 不会主动收集或保存用户名、密码、支付信息、完整浏览历史、完整页面内容或 Cookie 值，也不会出售、出租这些信息，或将其用于广告和用户画像。

## 3. Where requests go / 请求发往哪里

When a user views a supported streaming page, the extension may make requests to:

- **Douban** (`movie.douban.com` and `search.douban.com`) to look up a rating. These requests use the browser's existing Douban session context where the browser permits it. DouRate does not read or extract cookie values. Douban may show its own verification or rate-limit page.
- **Wikidata** (`www.wikidata.org`) to help disambiguate titles and resolve a reliable IMDb identifier. These requests do not use the user's Douban session.
- **IMDb datasets** (`datasets.imdbws.com`) only after the user clicks the download or update button. The extension downloads the official ratings dataset directly and does not scrape IMDb pages.

当用户浏览受支持的流媒体页面时，插件可能向以下地址发起请求：

- **豆瓣**（`movie.douban.com` 和 `search.douban.com`）查询评分。浏览器允许时，请求会使用浏览器现有的豆瓣会话上下文；DouRate 不读取或提取 Cookie 值。豆瓣可能显示自己的验证或限流页面；
- **Wikidata**（`www.wikidata.org`）辅助消歧并解析可靠的 IMDb ID。这些请求不会使用用户的豆瓣会话；
- **IMDb 数据集**（`datasets.imdbws.com`），仅在用户点击下载或更新后访问。插件直接下载官方评分数据集，不抓取 IMDb 网页。

DouRate does not send rating data to a developer server. Network providers and the third-party sites above may process requests under their own privacy policies and terms.

DouRate 不会把评分数据发送到开发者服务器。网络服务商及上述第三方网站可能依据其各自的隐私政策和服务条款处理请求。

## 4. Local storage, cache, and deletion / 本地存储、缓存与删除

- Successful Douban and IMDb lookup results may be cached in the browser for approximately 15 days to reduce repeat requests.
- Title mappings and diagnostic/settings data are stored in Chrome extension local storage.
- The downloaded IMDb ratings index is stored in the browser's local IndexedDB. It is not automatically uploaded, synchronized, or shared by DouRate.
- The popup provides a control to delete the local IMDb dataset. Removing or uninstalling the extension clears extension data according to Chrome's storage behavior.

- 成功的豆瓣和 IMDb 查询结果可能在浏览器本地缓存约 15 天，以减少重复请求；
- 作品映射、诊断和设置数据保存在 Chrome 扩展本地存储中；
- 下载的 IMDb 评分索引保存在浏览器本地 IndexedDB 中。DouRate 不会自动上传、同步或分享该索引；
- 弹窗提供删除本地 IMDb 数据的操作。移除或卸载扩展会依据 Chrome 的存储机制清除扩展数据。

## 5. IMDb data restrictions / IMDb 数据限制

IMDb data in this extension is available only through a user-initiated download of IMDb's official non-commercial dataset. IMDb's dataset terms limit this feature to non-commercial use on the user's own device. Do not redistribute the IMDb dataset, the parsed index, or an installation package containing that data. Do not use the feature as a public or commercial data service without the appropriate permission from IMDb.

本扩展中的 IMDb 数据仅通过用户主动下载 IMDb 官方非商业数据集获得。IMDb 数据集条款将此功能限制为非商业、仅供用户本人设备使用。请勿再分发 IMDb 数据集、解析后的索引或包含该数据的安装包；如需公开或商业化使用，请先取得 IMDb 的相应许可。

Information courtesy of IMDb (https://www.imdb.com). Used with permission.

## 6. Security and retention / 安全与保留期限

DouRate limits local retention to the cache and index purposes described above. No developer-controlled copy is retained because the extension has no developer backend. Users should keep Chrome, the extension files, and their operating system updated, and should treat downloaded extension packages as software from an untrusted source unless obtained from the official repository.

DouRate 的本地保留范围限于上述缓存和索引用途。由于插件没有开发者后端，开发者不会保留一份远程副本。用户应及时更新 Chrome、插件文件和操作系统，并将来源不明的安装包视为不受信任的软件。

## 7. Children's privacy / 儿童隐私

DouRate is not directed at children and does not knowingly collect personal information from children.

DouRate 不面向儿童，也不会明知地收集儿童个人信息。

## 8. Changes and contact / 政策变更与联系

This policy may be updated when the extension's data flows or features change. The effective date is shown at the top of this document. For questions about this policy or the extension, open an issue in the repository:

本政策可能会在插件的数据流或功能发生变化时更新，生效日期见文档顶部。如对本政策或插件有疑问，请在仓库中提交 Issue：

https://github.com/shenleee/DouRate/issues

## 9. Disclaimer / 免责声明

DouRate is provided for personal learning and discussion, with no commercial purpose. Do not misuse it, including for bulk collection or unreasonable automation. Users are responsible for their own use and for complying with the terms and policies of Netflix, Prime Video, Disney+, Douban, IMDb, Wikidata, Chrome, and applicable law. This policy does not grant permission from any third-party service.

DouRate 仅供个人学习和交流使用，没有任何商业用途。请勿滥用，包括批量采集或不合理自动化。用户应自行负责使用行为，并遵守 Netflix、Prime Video、Disney+、豆瓣、IMDb、Wikidata、Chrome 及适用法律的条款与政策。本政策不代表获得任何第三方服务的许可或授权。
