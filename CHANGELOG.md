# DouRate Changelog / 版本更新记录

`v0.3.1` is the current release. Its entry includes every same-version maintenance update through 2026-07-25.

`v0.3.1` 为当前发布版本。本条目包含截至 2026-07-25 的所有同版本维护更新。

## v0.3.1 · 2026-07-25 · Current / 当前版本

This entry consolidates the user-facing changes from after `v0.2.4` through `v0.3.1`.

本条目合并记录 `v0.2.4` 之后至 `v0.3.1` 的用户可见更新。

- **新增本地 IMDb 评分。** 用户可主动下载 IMDb 官方 ratings 数据集；评分与投票数会从当前浏览器的 IndexedDB 本机读取，不抓取 IMDb 网页、不使用 IMDb 登录态，也没有开发者后端。详情页与浏览卡片可并列显示豆瓣和 IMDb；弹窗支持手动下载、更新、查看状态和删除本地数据。
  **Local IMDb ratings.** Users can download IMDb’s official ratings dataset on demand. Ratings and vote counts are read from IndexedDB in the current browser—without scraping IMDb pages, using IMDb sessions, or relying on a developer backend. Title pages and browse cards can show Douban and IMDb together; the popup supports manual download, update, status, and removal of local data.
- **更可靠的匹配与缓存复用。** Netflix 详情页在年份／类型可靠时成功匹配后，会按同一 Netflix 条目 ID 在本机缓存豆瓣与 IMDb 结果 15 天，并复用到对应浏览卡片；不会仅凭同名套用评分。卡片缺少年份或类型、无法可靠区分同名作品时，仍显示问号而不猜测。
  **More reliable matching and cache reuse.** Once a Netflix detail page matches with reliable year/type metadata, Douban and IMDb results are cached locally by the same Netflix catalog ID for 15 days and reused on its browse card. Scores are never applied solely by title name. Cards without enough metadata still show a question mark rather than guess.
- **更清晰、更快的双来源加载。** “加载模式”更名为“豆瓣加载模式”，新安装默认“首页局部加载”；它只控制豆瓣直接查询。已下载的 IMDb 数据会独立、优先从本机索引读取并显示。
  **Clearer, faster two-source loading.** “Loading mode” is now “Douban loading mode” and fresh installs default to Browse: visible area; it controls only direct Douban requests. Downloaded IMDb data is read and displayed independently from the local index.
- **稳定性与平台兼容性优化。** 改善 Prime Video 首页卡片识别、扩展更新后的旧脚本处理，以及浏览卡片的视觉与悬浮交互；其他小型体验优化已合并于此。
  **Stability and platform-compatibility improvements.** Improves Prime Video homepage-card detection, stale content scripts after extension updates, and browse-card visual/hover behaviour; other small experience improvements are included here.

## v0.2.4 及更早的更新 · v0.2.4 and earlier

- 支持 Netflix、Prime Video 与 Disney+ 的详情页和浏览卡片评分。
  Supports title-page and browse-card ratings on Netflix, Prime Video, and Disney+.
- 新增 15 天本机缓存、豆瓣验证／限流暂停与更明确的失败原因；覆盖 Netflix 分类、New & Popular 与 My List 等浏览页面。
  Adds 15-day local caching, Douban verification/rate-limit pauses, clearer failure states, and coverage for Netflix genre, New & Popular, and My List browse pages.
- 工具栏弹窗显示版本号，README、安装说明与更新记录改为中英双语，并优化安装与说明体验。
  Adds a version number to the toolbar popup, makes the README, installation guide, and changelog bilingual, and improves installation/documentation experience.
- 建立 Netflix 豆瓣评分原型：详情页叠加层、浏览卡片、保守队列加载与三种加载模式；早期迭代还优化了匹配准确性、卡片加载顺序和安装体验。
  Establishes the Netflix Douban-rating prototype: title-page overlay, browse cards, conservative queued loading, and three loading modes. Early iterations also improved matching, card-loading order, and installation experience.
