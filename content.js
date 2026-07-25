/* global NetflixDouban */
(function initDouRateOverlay() {
  "use strict";

  const CHIP_ID = "dourate-rating-chip";
  const CARD_BADGE_CLASS = "dourate-card-badge";
  const LOADING_MODE_STORAGE_KEY = "douRateLoadingMode";
  const LOADING_MODES = Object.freeze({
    DETAILS: "details",
    BROWSE_VISIBLE: "browse-visible",
    BROWSE_FULL: "browse-full"
  });
  const DEFAULT_LOADING_MODE = LOADING_MODES.BROWSE_VISIBLE;
  const FULL_BACKGROUND_DELAY_MS = 8000;
  // IMDb score reads are local after a title has been resolved, while Douban
  // makes direct provider requests. Keep the latter deliberately serial.
  const MAX_BROWSE_IMDB_LOOKUPS = 2;
  const MAX_BROWSE_DOUBAN_LOOKUPS = 1;
  const platform = detectPlatform();
  if (!platform) return;

  let scheduled = false;
  let activeRequest = "";
  let loadingMode = DEFAULT_LOADING_MODE;
  // Streaming sites recycle card elements while rows refresh. Keep the
  // identity last seen for each element rather than marking it forever.
  const observedBrowseCards = new WeakMap();
  const imdbBrowseQueue = [];
  const queuedIMDbBrowseKeys = new Set();
  const imdbBrowseInFlightKeys = new Set();
  const doubanBrowseQueue = [];
  const queuedDoubanBrowseKeys = new Set();
  const doubanBrowseInFlightKeys = new Set();
  const browseResults = new Map();
  const browseTargets = new Map();

  function detectPlatform() {
    const host = location.hostname;
    if (host.endsWith("netflix.com")) return "netflix";
    if (host.endsWith("primevideo.com")) return "prime";
    if (host.endsWith("disneyplus.com")) return "disney";
    return "";
  }

  function shouldLookupDoubanOnBrowse() {
    return loadingMode !== LOADING_MODES.DETAILS;
  }

  function isFullDoubanBrowseMode() {
    return loadingMode === LOADING_MODES.BROWSE_FULL;
  }

  function isCardNearViewport(cardLink) {
    const rect = cardLink.getBoundingClientRect();
    return rect.bottom >= -120 && rect.top <= window.innerHeight + 120;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return "";
  }

  function cleanDocumentTitle(value) {
    return NetflixDouban.cleanTitle(value)
      .replace(/^\s*Prime Video:\s*/i, "")
      .replace(/\s*[|]\s*Disney\+\s*$/i, "")
      .trim();
  }

  function getDisneyTitleLogo() {
    const title = cleanDocumentTitle(document.title);
    if (!title) return null;
    return (
      Array.from(document.querySelectorAll("img[alt]")).find(
        (image) => NetflixDouban.cleanTitle(image.alt) === title
      ) || null
    );
  }

  function isTitleContext() {
    if (platform === "prime") {
      return /^\/detail\//.test(location.pathname) && Boolean(document.querySelector("main h1"));
    }
    if (platform === "disney") return Boolean(getDisneyTitleLogo());
    return (
      /^\/title\//.test(location.pathname) ||
      Boolean(
        document.querySelector(
          ".previewModal--detailsMetadata, [data-uia='details-modal'], [data-uia='video-title']"
        )
      ) ||
      Boolean(
        document.querySelector(
          ".previewModal--player-titleTreatmentWrapper, img.detail-modal[alt]"
        )
      )
    );
  }

  function getTitle() {
    if (platform === "prime") {
      return NetflixDouban.cleanTitle(
        firstText(["main h1"]) || cleanDocumentTitle(document.title)
      );
    }
    if (platform === "disney") return cleanDocumentTitle(document.title);

    const metadataTitle = document.querySelector("meta[property='og:title']")?.content;
    const titleTreatmentLogo = document.querySelector(
      ".previewModal--player-titleTreatment-logo[alt]"
    )?.alt;
    const modalLogoTitle = document.querySelector("img.detail-modal[alt]")?.alt;
    const visibleTitle = firstText([
      ".previewModal--detailsMetadata h1",
      "[data-uia='details-modal'] h1",
      "[data-uia='video-title']"
    ]);
    const titlePageTitle = /^\/title\//.test(location.pathname) ? document.title : "";
    return NetflixDouban.cleanTitle(
      metadataTitle || titleTreatmentLogo || modalLogoTitle || titlePageTitle || visibleTitle
    );
  }

  function getTitleContextText() {
    if (platform === "prime") return document.querySelector("main")?.innerText || "";
    if (platform === "disney") {
      const logo = getDisneyTitleLogo();
      return logo?.parentElement?.parentElement?.innerText || "";
    }
    return firstText([".previewModal--container", "[data-uia='details-modal']"]);
  }

  function getYear() {
    if (platform === "prime" || platform === "disney") {
      return NetflixDouban.parseYear(getTitleContextText());
    }
    return NetflixDouban.parseYear(
      firstText([
        ".previewModal--detailsMetadata",
        "[data-uia='details-modal']",
        "[data-uia='video-title']",
        ".previewModal--container"
      ])
    );
  }

  function getMediaType() {
    return /\b(episodes?|seasons?|series|limited series)\b/i.test(getTitleContextText())
      ? "tv"
      : "";
  }

  function getInsertionPoint() {
    if (platform === "prime") {
      const heading = document.querySelector("main h1");
      return heading ? { node: heading, position: "afterend" } : null;
    }
    if (platform === "disney") {
      const logo = getDisneyTitleLogo();
      return logo ? { node: logo, position: "afterend" } : null;
    }

    const titleControls = document.querySelector(
      ".previewModal--player-titleTreatment-left .buttonControls--container"
    );
    if (titleControls) return { node: titleControls, position: "beforebegin" };

    const selectors = [
      ".previewModal--player-titleTreatment-logo",
      ".previewModal--detailsMetadata h1",
      "[data-uia='details-modal'] h1",
      "[data-uia='video-title']"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return { node, position: "afterend" };
    }
    return null;
  }

  function clearChip() {
    document.getElementById(CHIP_ID)?.remove();
  }

  function createDoubanIcon(className) {
    const icon = document.createElement("img");
    icon.className = className;
    icon.src = chrome.runtime.getURL("assets/douban-mark.svg");
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function createIMDbMark(className) {
    const mark = document.createElement("span");
    mark.className = className;
    mark.textContent = "IMDb";
    mark.setAttribute("aria-hidden", "true");
    return mark;
  }

  function doubanSearchUrl(title) {
    const url = new URL("https://search.douban.com/movie/subject_search");
    url.searchParams.set("search_text", title);
    return url.href;
  }

  function imdbSearchUrl(title) {
    const url = new URL("https://www.imdb.com/find/");
    url.searchParams.set("q", title);
    return url.href;
  }

  function doubanFailureTooltip(result, title) {
    const manualSearch = " — search " + title + " on Douban";
    switch (result?.reason) {
      case "no_match":
        return "No confident Douban match" + manualSearch;
      case "douban_challenge":
        return "Douban asked for verification" + manualSearch;
      case "douban_cooldown": {
        const minutes = Math.max(1, Math.ceil((Number(result.retryAt) - Date.now()) / 60000));
        return "Douban lookups are paused after verification" +
          (Number.isFinite(minutes) ? " (about " + minutes + " min remaining)" : "") +
          manualSearch;
      }
      case "provider_format_changed":
        return "Douban returned an unexpected search format" + manualSearch;
      case "missing_score":
        return "The matched Douban page has no available score" + manualSearch;
      case "network_error":
      case "empty_response":
        return "Could not retrieve a Douban result right now" + manualSearch;
      default:
        return "Search " + title + " on Douban";
    }
  }

  function imdbFailureTooltip(result, title) {
    const manualSearch = " — search " + title + " on IMDb";
    switch (result?.reason) {
      case "imdb_data_missing":
        return "IMDb local ratings data is not downloaded — open DouRate settings";
      case "imdb_no_id":
        return "No confident IMDb title ID" + manualSearch;
      case "imdb_mapping_unavailable":
        return "IMDb title mapping is temporarily unavailable — refresh to retry";
      case "imdb_missing_score":
        return "The IMDb dataset has no available score for this title" + manualSearch;
      case "imdb_storage_unavailable":
        return "IMDb local data cannot be read right now — open DouRate settings";
      case "imdb_download_failed":
        return "IMDb local data download did not complete — open DouRate settings";
      case "missing_title":
        return "The streaming page did not provide a usable title";
      default:
        return "Search " + title + " on IMDb";
    }
  }

  function isMatchedRating(result) {
    return Boolean(result?.ok && result.score);
  }

  function isPendingRating(result) {
    return Boolean(result?.pending);
  }

  function isDisabledRating(result) {
    return Boolean(result?.disabled);
  }

  function formatIMDbVotes(value) {
    const votes = Number(value);
    if (!Number.isFinite(votes) || votes < 0) return "";
    return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(votes);
  }

  function createProviderLink(provider, result, title, { compact = false } = {}) {
    const matched = isMatchedRating(result);
    // Streaming platforms often replace a browse card as soon as it receives
    // pointer focus, which makes card-level rating links impossible to click.
    // Keep links on title-detail overlays, but render browse-card scores as
    // inert text so they never compete with the platform's hover interaction.
    const providerElement = document.createElement(compact ? "span" : "a");
    providerElement.className = `dourate-provider dourate-provider-${provider}${compact ? " dourate-provider-compact" : ""}`;
    if (!compact) {
      providerElement.target = "_blank";
      providerElement.rel = "noopener noreferrer";
    }

    if (provider === "douban") {
      if (!compact) providerElement.href = matched ? result.sourceUrl : doubanSearchUrl(title);
      providerElement.append(createDoubanIcon(compact ? "dourate-card-icon" : "dourate-rating-icon"));
      providerElement.append(
        document.createTextNode(
          compact ? `${matched ? result.score : "?"}` : `豆瓣 ${matched ? result.score : "?"}/10`
        )
      );
      providerElement.title = matched
        ? `${result.score}/10 from Douban — open ${result.matchedTitle || "title"}`
        : doubanFailureTooltip(result, title);
      providerElement.setAttribute(
        "aria-label",
        matched ? `${result.score} out of 10 from Douban` : doubanFailureTooltip(result, title)
      );
      return providerElement;
    }

    if (!compact) providerElement.href = matched ? result.sourceUrl : imdbSearchUrl(title);
    providerElement.append(createIMDbMark(compact ? "dourate-card-imdb-mark" : "dourate-rating-imdb-mark"));
    providerElement.append(document.createTextNode(compact ? ` ${matched ? result.score : "?"}` : ` ${matched ? result.score : "?"}/10`));
    const votes = formatIMDbVotes(result?.votes);
    const updatedAt = Number(result?.updatedAt);
    const date = Number.isFinite(updatedAt)
      ? new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(updatedAt))
      : "";
    providerElement.title = matched
      ? `${result.score}/10 from IMDb${votes ? ` · ${votes} ratings` : ""}${date ? ` · local data updated ${date}` : ""}`
      : imdbFailureTooltip(result, title);
    providerElement.setAttribute(
      "aria-label",
      matched ? `${result.score} out of 10 from IMDb` : imdbFailureTooltip(result, title)
    );
    return providerElement;
  }

  function visibleProviderResults(results) {
    const providers = [
      { provider: "douban", result: results?.douban || { ok: false, reason: "empty_response" } },
      { provider: "imdb", result: results?.imdb || { ok: false, reason: "imdb_data_missing" } }
    ].filter(({ result }) => !isDisabledRating(result));
    const matched = providers.filter(({ result }) => isMatchedRating(result));
    if (matched.length) return matched;
    return providers.some(({ result }) => isPendingRating(result)) ? [] : providers;
  }

  function renderRating(results, title) {
    const insertionPoint = getInsertionPoint();
    if (!insertionPoint || !title) return clearChip();

    const providers = visibleProviderResults(results).filter(
      ({ result }) => !isPendingRating(result)
    );
    if (!providers.length) return clearChip();

    let chip = document.getElementById(CHIP_ID);
    if (!chip) {
      chip = document.createElement("div");
      chip.id = CHIP_ID;
      chip.setAttribute("role", "group");
      chip.setAttribute("aria-label", "DouRate ratings");
      insertionPoint.node.insertAdjacentElement(insertionPoint.position, chip);
    }
    chip.replaceChildren();
    for (const entry of providers) {
      chip.append(createProviderLink(entry.provider, entry.result, title));
    }
  }

  function clearBrowseBadge(card) {
    card?.querySelector("." + CARD_BADGE_CLASS)?.remove();
  }

  function ensureCardPositioning(card) {
    if (getComputedStyle(card).position === "static") {
      card.classList.add("dourate-card-host");
    }
  }

  function renderBrowseBadge(card, results, cardIdentity) {
    if (
      !card.isConnected ||
      (cardIdentity && card.dataset.dourateCardIdentity !== cardIdentity)
    ) {
      return;
    }

    const title = card.dataset.dourateTitle || "this title";
    const providers = visibleProviderResults(results).filter(
      ({ result }) => !isPendingRating(result)
    );
    if (!providers.length) return clearBrowseBadge(card);

    ensureCardPositioning(card);

    let badge = card.querySelector("." + CARD_BADGE_CLASS);
    if (!badge) {
      badge = document.createElement("div");
      badge.className = CARD_BADGE_CLASS;
      badge.setAttribute("role", "group");
      badge.setAttribute("aria-label", "DouRate ratings");
      card.append(badge);
    }
    badge.replaceChildren();
    for (const entry of providers) {
      badge.append(createProviderLink(entry.provider, entry.result, title, { compact: true }));
    }
    badge.dataset.dourateCardIdentity = cardIdentity || "";
  }

  function lookupKey(title, year = "", mediaType = "") {
    return [NetflixDouban.normalizedTitle(title), year, mediaType].join(":");
  }

  function lookupIMDb(payload) {
    return chrome.runtime
      .sendMessage({ type: "LOOKUP_IMDB_RATING", payload })
      .catch(() => ({ ok: false, reason: "imdb_storage_unavailable" }));
  }

  function lookupDouban(payload) {
    return chrome.runtime
      .sendMessage({ type: "LOOKUP_DOUBAN_RATING", payload })
      .catch(() => ({ ok: false, reason: "network_error" }));
  }

  async function lookupRatings(payload, { includeDouban = true, onIMDbResult } = {}) {
    const results = {
      imdb: { pending: true },
      douban: includeDouban ? { pending: true } : { disabled: true }
    };

    // Start IMDb first. A known title-ID mapping can then resolve directly
    // against IndexedDB without waiting for the slower Douban request.
    const imdbTask = lookupIMDb(payload).then((result) => {
      results.imdb = result || { ok: false, reason: "imdb_data_missing" };
      onIMDbResult?.(results);
      return results.imdb;
    });
    const doubanTask = includeDouban
      ? lookupDouban(payload).then((result) => {
          results.douban = result || { ok: false, reason: "empty_response" };
          return results.douban;
        })
      : Promise.resolve(results.douban);

    await Promise.all([imdbTask, doubanTask]);
    return results;
  }

  function getBrowseCardSelector() {
    if (platform === "prime") return "article a[href^='/detail/'][aria-label]";
    if (platform === "disney") return "a[href*='/browse/entity-']";
    return "a[href*='/browse?jbv='][aria-label], a[href^='/watch/'][aria-label]";
  }

  function isPrimeControlLabel(label) {
    return /^(?:watch now|play|episode\s+\d+\s+watch now|more details(?: for)?)/i.test(
      label
    );
  }

  function isRatingLabel(value) {
    return /^(?:TV[- ]?)?(?:G|PG|PG-13|R|NC-17|MA|Y7|Y|14|18)$/i.test(value);
  }

  function isDisneyControlTitle(value) {
    return /^(?:details|play|watch now|learn more|trailer)$/i.test(value);
  }

  function getDisneyCardTitle(cardLink) {
    const aria = String(cardLink.getAttribute("aria-label") || "").trim();
    const ariaMatch = aria.match(/^(.+?)\s+Select for details on this title\.$/i);
    if (ariaMatch) {
      const fromAria = ariaMatch[1]
        .replace(/^New\s+(?:Movie\s+Badge|Movie|Season|Episode)\s+/i, "")
        .replace(/\s+(?:Rated|Released)\s+.*$/i, "")
        .trim();
      if (fromAria) return NetflixDouban.cleanTitle(fromAria);
    }

    const imageAlt = cardLink.querySelector("img[alt]")?.alt?.trim() || "";
    if (imageAlt && !isRatingLabel(imageAlt)) {
      return NetflixDouban.cleanTitle(imageAlt);
    }

    const lines = (cardLink.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const fromText = lines.find(
      (line) =>
        !/\b(?:remaining|\d+\s*[hm])\b/i.test(line) &&
        !/^\d{4}\s*[•·]/.test(line) &&
        !/^(?:new|top\s*10)$/i.test(line)
    );
    return fromText && !isDisneyControlTitle(fromText)
      ? NetflixDouban.cleanTitle(fromText)
      : "";
  }

  function getPrimeCardTitle(cardLink) {
    const aria = String(cardLink.getAttribute("aria-label") || "").trim();
    if (!aria || isPrimeControlLabel(aria)) return "";
    const imageAlt = cardLink.closest("article")?.querySelector("img[alt]")?.alt?.trim() || "";
    const normalAria = NetflixDouban.normalizedTitle(aria);
    const normalImage = NetflixDouban.normalizedTitle(imageAlt);
    // Prime occasionally shortens a card's accessible name (for example,
    // dropping a sequel number), while the poster alt has the full title.
    if (
      imageAlt &&
      normalAria &&
      normalImage &&
      (normalImage.includes(normalAria) || normalAria.includes(normalImage))
    ) {
      return NetflixDouban.cleanTitle(imageAlt);
    }
    return NetflixDouban.cleanTitle(aria);
  }

  function getNetflixCardTitle(cardLink) {
    const title = NetflixDouban.cleanTitle(
      cardLink.getAttribute("aria-label") || cardLink.innerText || ""
    );
    return /^(?:play|play\s+[-–—])/i.test(title) ? "" : title;
  }

  function getCardHost(cardLink) {
    if (platform === "prime") return cardLink.closest("article") || cardLink.parentElement;
    if (platform === "netflix") {
      return cardLink.closest(".title-card") || cardLink.parentElement;
    }
    if (platform === "disney") {
      let node = cardLink;
      for (let level = 0; node && level < 6; level += 1, node = node.parentElement) {
        if (getComputedStyle(node).position !== "static") return node;
      }
    }
    return cardLink.parentElement;
  }

  function stableCardPath(href) {
    try {
      return new URL(href, location.origin).pathname;
    } catch {
      return href;
    }
  }

  function getBrowseCardMetadata(cardLink, card) {
    const context = [
      cardLink.getAttribute("aria-label"),
      cardLink.querySelector("img[alt]")?.alt,
      card?.innerText
    ]
      .filter(Boolean)
      .join(" ");
    const year = NetflixDouban.parseYear(context);
    const mediaType = /\b(episodes?|seasons?|series|limited series|tv series|anime)\b/i.test(context)
      ? "tv"
      : /\b(movie|film)\b/i.test(context)
        ? "movie"
        : "";
    return { year, mediaType };
  }

  function getBrowseCardDetails(cardLink) {
    const card = getCardHost(cardLink);
    const title =
      platform === "prime"
        ? getPrimeCardTitle(cardLink)
        : platform === "disney"
          ? getDisneyCardTitle(cardLink)
          : getNetflixCardTitle(cardLink);
    const href = cardLink.getAttribute("href") || "";
    if (!card || !title || !href) return null;
    const { year, mediaType } = getBrowseCardMetadata(cardLink, card);
    const key = lookupKey(title, year, mediaType);
    if (!key) return null;

    return {
      card,
      title,
      year,
      mediaType,
      key,
      identity: platform + ":" + stableCardPath(href) + ":" + key
    };
  }

  function renderBrowseTargets(key) {
    const results = browseResults.get(key);
    if (!results) return;
    for (const [card, identity] of browseTargets.get(key) || []) {
      renderBrowseBadge(card, results, identity);
    }
  }

  function getBrowseResults(key, { requestDouban = false } = {}) {
    let results = browseResults.get(key);
    if (!results) {
      results = {
        imdb: { pending: true },
        douban: requestDouban ? { pending: true } : { disabled: true }
      };
      browseResults.set(key, results);
    } else if (requestDouban && results.douban?.disabled) {
      results.douban = { pending: true };
    }
    return results;
  }

  function queueIMDbBrowseLookup({ key, title, year, mediaType }) {
    const results = browseResults.get(key);
    if (!isPendingRating(results?.imdb)) return;
    if (queuedIMDbBrowseKeys.has(key) || imdbBrowseInFlightKeys.has(key)) return;
    queuedIMDbBrowseKeys.add(key);
    imdbBrowseQueue.push({ key, title, year, mediaType });
    drainIMDbBrowseQueue();
  }

  function queueDoubanBrowseLookup({ key, title, year, mediaType, background }) {
    const results = browseResults.get(key);
    if (!isPendingRating(results?.douban)) return;
    if (queuedDoubanBrowseKeys.has(key) || doubanBrowseInFlightKeys.has(key)) return;
    queuedDoubanBrowseKeys.add(key);
    doubanBrowseQueue.push({ key, title, year, mediaType, background });
    drainDoubanBrowseQueue();
  }

  function queueBrowseCard(cardLink, { requestDouban = false, background = false } = {}) {
    const details = getBrowseCardDetails(cardLink);
    if (!details) return;

    const { card, title, year, mediaType, key, identity } = details;
    if (card.dataset.dourateCardIdentity !== identity) {
      card.dataset.dourateCardIdentity = identity;
      card.dataset.dourateTitle = title;
      clearBrowseBadge(card);
    }

    if (!browseTargets.has(key)) browseTargets.set(key, new Map());
    browseTargets.get(key).set(card, identity);
    const results = getBrowseResults(key, { requestDouban });
    renderBrowseBadge(card, results, identity);

    // IMDb requests are scheduled for all rendered browse cards, regardless
    // of the Douban mode. Once title-ID mapping is cached, score reads are
    // local IndexedDB lookups and display independently.
    queueIMDbBrowseLookup({ key, title, year, mediaType });
    if (requestDouban) queueDoubanBrowseLookup({ key, title, year, mediaType, background });
  }

  function drainIMDbBrowseQueue() {
    while (imdbBrowseInFlightKeys.size < MAX_BROWSE_IMDB_LOOKUPS && imdbBrowseQueue.length) {
      const { key, title, year, mediaType } = imdbBrowseQueue.shift();
      queuedIMDbBrowseKeys.delete(key);
      const results = browseResults.get(key);
      if (!isPendingRating(results?.imdb) || imdbBrowseInFlightKeys.has(key)) continue;

      imdbBrowseInFlightKeys.add(key);
      lookupIMDb({ title, year, mediaType })
        .then((result) => {
          const current = browseResults.get(key);
          if (!current) return;
          current.imdb = result || { ok: false, reason: "imdb_data_missing" };
          renderBrowseTargets(key);
        })
        .catch((error) => {
          console.debug("[DouRate] IMDb browse lookup unavailable", error);
          const current = browseResults.get(key);
          if (!current) return;
          current.imdb = { ok: false, reason: "imdb_storage_unavailable" };
          renderBrowseTargets(key);
        })
        .finally(() => {
          imdbBrowseInFlightKeys.delete(key);
          drainIMDbBrowseQueue();
        });
    }
  }

  function drainDoubanBrowseQueue() {
    while (doubanBrowseInFlightKeys.size < MAX_BROWSE_DOUBAN_LOOKUPS && doubanBrowseQueue.length) {
      const { key, title, year, mediaType, background } = doubanBrowseQueue.shift();
      queuedDoubanBrowseKeys.delete(key);
      const results = browseResults.get(key);
      if (!isPendingRating(results?.douban) || doubanBrowseInFlightKeys.has(key)) continue;

      doubanBrowseInFlightKeys.add(key);
      const lookup =
        background && isFullDoubanBrowseMode()
          ? delay(FULL_BACKGROUND_DELAY_MS).then(() => lookupDouban({ title, year, mediaType }))
          : lookupDouban({ title, year, mediaType });

      lookup
        .then((result) => {
          const current = browseResults.get(key);
          if (!current) return;
          current.douban = result || { ok: false, reason: "empty_response" };
          renderBrowseTargets(key);
        })
        .catch((error) => {
          console.debug("[DouRate] Douban browse lookup unavailable", error);
          const current = browseResults.get(key);
          if (!current) return;
          current.douban = { ok: false, reason: "network_error" };
          renderBrowseTargets(key);
        })
        .finally(() => {
          doubanBrowseInFlightKeys.delete(key);
          drainDoubanBrowseQueue();
        });
    }
  }

  const browseCardObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          queueBrowseCard(entry.target, {
            requestDouban: shouldLookupDoubanOnBrowse(),
            background: false
          });
        }
      }
    },
    { rootMargin: "120px 0px", threshold: 0.05 }
  );

  function scanBrowseCards() {
    for (const cardLink of document.querySelectorAll(getBrowseCardSelector())) {
      const details = getBrowseCardDetails(cardLink);
      if (!details) continue;

      if (observedBrowseCards.get(cardLink) === details.identity) continue;
      observedBrowseCards.set(cardLink, details.identity);
      // A card can be repurposed while a row refreshes. Re-observing it
      // covers the changed title and URL.
      browseCardObserver.unobserve(cardLink);
      browseCardObserver.observe(cardLink);
      const nearViewport = isCardNearViewport(cardLink);
      const requestDouban = isFullDoubanBrowseMode() ||
        (shouldLookupDoubanOnBrowse() && nearViewport);
      queueBrowseCard(cardLink, {
        requestDouban,
        background: isFullDoubanBrowseMode() && !nearViewport
      });
    }
  }

  async function refresh() {
    scheduled = false;
    const titleContext = isTitleContext();
    // A title detail view can itself contain recommendation rows. Keep
    // details-only behaviour focused on that single title.
    if (!titleContext) scanBrowseCards();
    if (!titleContext) {
      activeRequest = "";
      clearChip();
      return;
    }

    const title = getTitle();
    const year = getYear();
    const mediaType = getMediaType();
    if (!title) return clearChip();

    const requestKey = [location.href, title, year, mediaType].join(":");
    if (requestKey === activeRequest && document.getElementById(CHIP_ID)) return;
    activeRequest = requestKey;

    try {
      const result = await lookupRatings(
        { title, year, mediaType },
        {
          onIMDbResult: (partialResults) => {
            if (requestKey === activeRequest) renderRating(partialResults, title);
          }
        }
      );
      if (requestKey !== activeRequest) return;
      renderRating(result, title);
    } catch (error) {
      console.debug("[DouRate] overlay unavailable", error);
      renderRating(
        {
          douban: { ok: false, reason: "network_error" },
          imdb: { ok: false, reason: "imdb_storage_unavailable" }
        },
        title
      );
    }
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(refresh, 250);
  }

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "aria-label", "alt"]
  });

  chrome.storage.local
    .get(LOADING_MODE_STORAGE_KEY)
    .then((settings) => {
      const savedMode = settings[LOADING_MODE_STORAGE_KEY];
      if (Object.values(LOADING_MODES).includes(savedMode)) loadingMode = savedMode;
    })
    .catch((error) => {
      console.debug("[DouRate] could not read loading mode", error);
    })
    .finally(scheduleRefresh);
})();
