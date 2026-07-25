# DouRate Changelog / 版本更新记录

This record starts with the initial internal prototype and lists every retained installable package. Early internal iterations that did not retain a separate package are grouped rather than assigned invented version numbers.

本记录从最初的内部原型开始，并列出所有已保留的可安装包。未保留独立安装包的早期内部迭代会合并记录，不会虚构版本号。

## v0.3.1 · 2026-07-25

- “加载模式”更名为“豆瓣加载模式”，新安装默认“首页局部加载”；该设置只控制豆瓣直接查询。IMDb 已下载数据的浏览卡片会独立排队，优先显示可从本机索引读取的评分。
  Renames “Loading mode” to “Douban loading mode”, defaults fresh installs to Browse: visible area, and limits the setting to direct Douban requests. Browse cards with downloaded IMDb data use an independent queue and prioritize scores available from the local index.
- 将 IMDb 与豆瓣的加载链路拆分。IMDb 结果不再等待豆瓣请求完成才显示；屏幕外卡片的慢速策略继续只适用于豆瓣全自动模式。
  Splits IMDb and Douban loading paths. IMDb results no longer wait for Douban before rendering; the slow off-screen-card strategy remains limited to Douban full-page mode.
- 修复 IMDb 标题映射的缓存策略：成功 Wikidata 映射会在本机缓存 15 天，临时映射或存储失败不会被当作“无 IMDb ID”长期缓存，因此可在后续卡片或刷新时重试。
  Fixes IMDb title-mapping cache behavior: successful Wikidata mappings are kept locally for 15 days, while transient mapping or storage failures are not retained as a permanent “no IMDb ID” state and can retry on a later card or refresh.
- 浏览卡片中的豆瓣评分改为仅显示豆瓣图标和分数，移除重复的“豆”字。
  Simplifies the Douban browse-card score to the Douban icon plus the score, removing the redundant “豆” label.
- 浏览卡片评分改为不可点击，避免 Netflix 等平台的悬浮放大交互吞掉评分链接；详情页评分仍可点击。安装说明同步明确：在同一已加载文件夹点击 Update 可保留本机缓存与 IMDb 索引，卸载则会清除它们。
  Makes browse-card scores non-clickable so platform hover expansion does not swallow a rating link; title-page ratings remain clickable. Installation guidance now clarifies that updating the same loaded folder preserves local caches and the IMDb index, while uninstalling clears them.

## v0.3.0 · 2026-07-25

- 新增 IMDb 评分：用户可主动下载 IMDb 官方 `title.ratings.tsv.gz`，并从本机浏览器索引读取评分和投票数；不会抓取 IMDb 网页、使用 IMDb 登录态或经由开发者后端。
  Adds IMDb ratings from a user-initiated download of IMDb's official `title.ratings.tsv.gz`; ratings and vote counts are read from a local browser index with no IMDb-page scraping, IMDb session use, or developer backend.
- 详情页和浏览卡片可并列显示豆瓣与 IMDb；仅一个来源成功时只显示该来源，两个来源均不可用时显示各自带原因提示的问号。
  Shows Douban and IMDb side by side on title pages and browse cards; shows only the successful source when one works, or source-specific question marks when neither is available.
- 工具栏弹窗新增“IMDb 本地数据”分区，支持手动下载、更新、状态查看与删除；IMDb 数据不会自动下载或更新。
  Adds an IMDb Local Data popup section for manual download, update, status, and deletion; IMDb data is never downloaded or updated automatically.
- 新增 `unlimitedStorage` 与 IMDb 数据集 host permission，以存储本地评分索引；同步更新中英文 README、安装说明与个人非商业用途边界。
  Adds `unlimitedStorage` and the IMDb dataset host permission for the local ratings index; updates bilingual README, installation guidance, and the personal non-commercial-use boundary.

## v0.2.4 · 2026-07-24

- 在工具栏弹窗中显示当前扩展版本号。  
  Shows the current extension version in the toolbar popup.
- README 与安装说明改为单一文件内的中英双语内容；移除重复的中文本地安装说明。  
  Makes README and installation guidance bilingual within single files; removes the duplicate Chinese local-installation guide.
- 新增本双语 CHANGELOG，集中记录产品版本变更。  
  Adds this bilingual CHANGELOG as the single version-history record.

## v0.2.3 · 2026-07-24

- 检测到豆瓣验证页、HTTP 403 或 429 后，全局暂停新的直接查询约 30 分钟；本地缓存仍可使用。  
  Globally pauses new direct lookups for about 30 minutes after a Douban verification page, HTTP 403, or HTTP 429; cached ratings remain usable.
- 将豆瓣搜索页面格式异常与真正的低置信度／未可靠匹配区分显示。  
  Separates changed Douban search-page formats from genuinely low-confidence or unreliable matches.
- 工具栏弹窗显示最近成功／失败、验证暂停状态，并提供用户主动打开豆瓣的入口。  
  Adds recent success/failure, verification-pause status, and a user-initiated Douban link to the toolbar popup.
- Browse 卡片在平台页面提供年份或影视类型时会带入匹配逻辑。  
  Uses a browse card's exposed year or media type in matching when the platform provides it.

## v0.2.2 · 2026-07-24

- 成功评分在本机浏览器缓存 15 天；失败、未匹配与验证结果不缓存。  
  Caches successful ratings locally for 15 days; failures, unmatched titles, and verification responses are not cached.
- 支持 Netflix 分类页、New & Popular（`/latest`）与 My List 的浏览卡片评分。  
  Adds browse-card support for Netflix genre pages, New & Popular (`/latest`), and My List.
- 问号提示区分未可靠匹配、豆瓣验证、无可用评分与临时请求失败。  
  Makes question-mark tooltips distinguish unreliable matches, Douban verification, missing scores, and temporary request failures.
- 全自动加载的风险提示改为“可能触发平台保护机制”。  
  Updates full-page loading guidance to warn about possible platform protection mechanisms.

## v0.2.1 · 2026-07-22

- 在原有 Netflix 支持之外，新增 Prime Video 与 Disney+ 的详情页和浏览卡片支持。  
  Adds Prime Video and Disney+ title-page and browse-card support alongside Netflix.
- 将成功评分的本地缓存期限扩展为 15 天，并保留保守的逐项查询节奏。  
  Extends successful local-rating cache retention to 15 days while retaining conservative sequential lookup pacing.

## v0.2.0 · 未保留独立安装包 / no retained standalone package

- 多平台支持的内部过渡迭代；首个保留的多平台安装包为 v0.2.1。  
  Internal transition toward multi-platform support; v0.2.1 is the first retained multi-platform package.

## v0.1.9 · 2026-07-22

- 新增三种加载模式：仅详情页、首页局部加载和首页全自动加载。  
  Adds three loading modes: details only, browse visible area, and browse full page.
- 全自动模式按展示顺序逐项加载当前平台已渲染的卡片。  
  Makes full-page mode load currently rendered cards one at a time in display order.

## v0.1.8 · 2026-07-22

- Netflix Browse 页可继续加载当前页面已经渲染但尚未可见的卡片。  
  Lets Netflix browse mode continue through cards already rendered on the page but not yet visible.
- 无法可靠匹配时，在详情页与卡片显示问号并链接到豆瓣搜索，而非猜测评分。  
  Shows a question-mark Douban-search link on title pages and cards when no reliable match is available, rather than guessing a score.

## v0.1.5 · 2026-07-22

- 新增本机浏览器评分缓存（当时为 12 小时），减少重复访问豆瓣。  
  Adds local-browser rating caching (12 hours at the time) to reduce repeat Douban requests.
- 加入可随安装包分发的安装说明。  
  Adds installation guidance distributed with the package.

## v0.1.3 · 2026-07-22

- 首个保留的可安装包：支持 Netflix 标题详情页与当前可见浏览卡片的豆瓣评分。  
  First retained installable package: supports Douban ratings on Netflix title pages and currently visible browse cards.
- 使用保守的单项队列逐步加载浏览卡片评分，并支持点击已匹配评分打开豆瓣。  
  Uses a conservative one-at-a-time queue for progressive browse-card ratings and opens Douban when a matched score is clicked.

## v0.1.0–v0.1.2 · 初期内部原型 / initial internal prototypes

- 建立 Netflix 标题详情页豆瓣评分叠加层、基础标题清理与保守匹配逻辑。  
  Establishes the Netflix title-page Douban-rating overlay, basic title cleanup, and conservative matching.
- 早期迭代未保留独立安装包，后续能力由 v0.1.3 首个可安装包承接。  
  These early iterations did not retain standalone packages; their capabilities were carried into the first installable v0.1.3 package.
