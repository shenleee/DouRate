# DouRate Changelog / 版本更新记录

`v0.3.5` is the current release.

`v0.3.5` 为当前发布版本。

## v0.3.5 · 2026-07-31 · Current / 当前版本

- **更完整的首次使用引导。** 新安装时会打开欢迎页，说明在当前浏览器登录豆瓣账号、按需要切换豆瓣加载模式以降低触发限流的风险，并提供 IMDb 官方数据集 URL 与按钮。点击链接或按钮都会直接下载、解压并建立 DouRate 的本机 IMDb 索引，而不是留下一个未处理的 `.gz` 文件；完成后刷新流媒体页面即可。
  **Clearer first-use guidance.** A welcome page opens on new installs with guidance to sign in to Douban in the current browser, change Douban loading modes to reduce rate-limit risk, and download IMDb data via the official dataset URL or button. Either action downloads, decompresses, and indexes the data locally for DouRate rather than leaving an unprocessed `.gz` file; refresh a streaming page when it completes.
- **可配置的 IMDb 自动更新。** 首次手动下载后，可选择每 1–90 天自动更新 IMDb 本地数据（默认 7 天），或设为仅手动更新。自动更新失败会继续保留上一份可用索引，并在后续周期重试。
  **Configurable IMDb automatic updates.** After the first manual download, choose automatic local IMDb-data updates every 1–90 days (7 days by default), or manual updates only. A failed refresh keeps the previous usable index and retries in a later cycle.
- **更可靠的双来源匹配。** IMDb 与豆瓣的保守匹配会结合 Netflix 选中卡片元数据、年份、类型、片长及剧集标题归一化；缺少可靠信息时保持问号，不按搜索顺序猜测。成功的 Netflix 详情页结果仍可按平台条目 ID 复用到浏览卡片。
  **More reliable matching for both sources.** Conservative IMDb and Douban matching combines selected Netflix-card metadata, year, type, runtime, and series-title normalization. Uncertain matches remain question marks rather than search-order guesses. Successful Netflix detail-page results can still be reused by platform title ID on browse cards.
- **发布与隐私文案更新。** 更新扩展产品简介、安装说明、隐私政策和欢迎页；新增的 `alarms` 权限只用于当前浏览器中用户选择的 IMDb 更新计划，不新增可访问网站或开发者后端。
  **Listing and privacy copy updates.** Updates the extension summary, installation guide, privacy policy, and welcome page. The added `alarms` permission is used only for user-selected IMDb refresh scheduling in the current browser; it adds no website access or developer backend.

## v0.3.4 · 2026-07-30 · Current local / 当前本地版本

- **IMDb 自动更新设置。** 用户完成首次手动下载后，可选择每 1–90 天自动更新 IMDb 本地数据（默认 7 天），或切换为仅手动更新。自动更新失败会保留上一份可用本地数据，并在后续周期重试。
  **IMDb automatic-update settings.** After the user completes the first manual download, they can choose an automatic IMDb local-data update every 1–90 days (7 days by default), or manual updates only. A failed automatic update keeps the previous usable local data and retries in a later cycle.
- **新增 alarms 权限。** 此权限仅用于在当前浏览器安排用户选择的 IMDb 更新；不会扩大可访问的网站范围，也不会新增开发者后端。
  **New alarms permission.** It is used only to schedule the user-selected IMDb updates in the current browser; it does not expand website access or add a developer backend.

## v0.3.3 · 2026-07-30

- **豆瓣匹配复用 IMDb 的保守元数据判定。** 在豆瓣直接搜索未命中时，中文标题兜底也会使用已知年份、类型与片长来区分严格的同名候选；信息不足时仍不猜测。IMDb 的本地数据存储与下载机制不适用于豆瓣，未作复用。
  **Conservative metadata matching now also helps Douban.** When direct Douban search does not match, the canonical Chinese-title fallback can use known year, type, and runtime to distinguish strict same-title candidates; it still does not guess when metadata is insufficient. IMDb's local-data storage and download mechanism is not applicable to Douban and was not reused.
- **新增首次安装欢迎页。** 初次安装后会打开简短引导，提醒用户在当前 Chrome profile 登录自己的豆瓣账号，并从 DouRate 弹窗主动下载 IMDb 本地数据。
  **New first-install welcome page.** A short guide opens after first installation, reminding users to sign in to their own Douban account in the current Chrome profile and manually download IMDb local data from the DouRate popup.

## v0.3.2 · 2026-07-30

- **IMDb 匹配增强。** 同步 ReelScore 已验证的保守匹配逻辑：Netflix 选中卡片会补充详情页元数据；单集优先归一为剧集标题；仅当同名、同年份、同类型候选仍冲突时，才以片长做严格二次判定。缺少可靠信息时继续显示问号，不按搜索顺序猜测。
  **Stronger IMDb matching.** Ports ReelScore's verified conservative matching: the selected Netflix card supplements title-page metadata; episode titles are normalized to their series; runtime is a strict tie-breaker only after title, year, and type still collide. Missing reliable metadata still produces a question mark rather than a search-order guess.
- **更稳健的元数据解析。** 正确解析 Netflix 可能拼接的“年份 + 时长”文本（如 `20241h 53m`），避免将年份误认为片长，并让 IMDb 映射缓存按片长区分。
  **More robust metadata parsing.** Correctly parses Netflix's concatenated year-and-runtime text (for example, `20241h 53m`), preventing the year from being treated as runtime and separating IMDb mapping cache entries by runtime.
- **保持手动 IMDb 数据更新。** 没有同步 ReelScore 的自动更新机制；DouRate 仍只在用户主动下载或更新时访问 IMDb 数据集。
  **Manual IMDb updates remain.** ReelScore's automatic refresh was intentionally not ported; DouRate accesses the IMDb dataset only when the user explicitly downloads or updates it.

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
