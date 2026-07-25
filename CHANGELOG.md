# DouRate Changelog / 版本更新记录

`v0.3.1` is the current release. Its entry includes every same-version maintenance update through 2026-07-25.

`v0.3.1` 为当前发布版本。本条目包含截至 2026-07-25 的所有同版本维护更新。

## v0.3.1 · 2026-07-25 · Current / 当前版本

- **更可靠的卡片匹配与复用。** Netflix 详情页在年份／类型可靠时成功匹配后，会按同一 Netflix 条目 ID 在本机缓存豆瓣与 IMDb 结果 15 天，并复用到对应浏览卡片；不会仅凭同名套用评分。卡片缺少年份或类型、无法可靠区分同名作品时，仍显示问号而不猜测。
  **More reliable card matching and reuse.** Once a Netflix detail page matches with reliable year/type metadata, Douban and IMDb results are cached locally by the same Netflix catalog ID for 15 days and reused on its browse card. Scores are never applied solely by title name. Cards without enough metadata still show a question mark rather than guess.
- **更清晰、更快的双来源加载。** “加载模式”更名为“豆瓣加载模式”，新安装默认“首页局部加载”；它只控制豆瓣直接查询。已下载的 IMDb 数据会独立、优先从本机索引读取并显示。
  **Clearer, faster two-source loading.** “Loading mode” is now “Douban loading mode” and fresh installs default to Browse: visible area; it controls only direct Douban requests. Downloaded IMDb data is read and displayed independently from the local index.
- **稳定性与平台兼容性优化。** 改善 Prime Video 首页卡片识别、扩展更新后的旧脚本处理，以及浏览卡片的视觉与悬浮交互；其他小型体验优化已合并于此。
  **Stability and platform-compatibility improvements.** Improves Prime Video homepage-card detection, stale content scripts after extension updates, and browse-card visual/hover behaviour; other small experience improvements are included here.

## v0.3.0 · 2026-07-25

- 新增本地 IMDb 评分：用户主动下载 IMDb 官方 ratings 数据集后，插件从当前浏览器的 IndexedDB 读取评分与投票数；不抓取 IMDb 网页、不使用登录态，也没有开发者后端。
  Adds local IMDb ratings: after a user-initiated download of IMDb’s official ratings dataset, the extension reads ratings and vote counts from IndexedDB in the current browser. It does not scrape IMDb pages, use IMDb sessions, or use a developer backend.
- 详情页与浏览卡片可并列显示豆瓣和 IMDb；弹窗支持手动下载、更新、查看状态和删除 IMDb 本地数据。
  Title pages and browse cards can show Douban and IMDb side by side; the popup supports manual IMDb-data download, update, status, and deletion.

## v0.2.4 · 2026-07-24

- 工具栏弹窗显示版本号，README、安装说明与更新记录改为中英双语；并优化了安装与说明体验。
  Adds a version number to the toolbar popup, makes the README, installation guide, and changelog bilingual, and improves installation/documentation experience.

## v0.2.2–v0.2.3 · 2026-07-24

- 新增 15 天本机缓存、豆瓣验证／限流暂停与更明确的失败原因；覆盖 Netflix 分类、New & Popular 与 My List 等浏览页面，并优化整体查询体验。
  Adds 15-day local caching, Douban verification/rate-limit pauses, and clearer failure states; covers Netflix genre, New & Popular, and My List browse pages, with broader query-experience improvements.

## v0.2.1 · 2026-07-22

- 在 Netflix 之外支持 Prime Video 与 Disney+ 的详情页和浏览卡片评分。
  Adds title-page and browse-card ratings for Prime Video and Disney+ alongside Netflix.

## v0.1.x · 2026-07-22

- 建立 Netflix 豆瓣评分原型：详情页叠加层、浏览卡片、保守队列加载、本机缓存和三种加载模式。
  Establishes the Netflix Douban-rating prototype: title-page overlay, browse cards, conservative queued loading, local cache, and three loading modes.
- 早期内部迭代主要优化匹配准确性、卡片加载顺序和安装体验；未为每次内部调整保留单独安装包。
  Early internal iterations mainly improved match accuracy, card-loading order, and installation experience; not every internal adjustment had a separately retained package.
