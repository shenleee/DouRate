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
  const FULL_BACKGROUND_DELAY_MS = 8000;
  // The direct-Douban prototype needs a gentle request cadence. The service
  // worker additionally serializes subject-page fetches across the extension.
  const MAX_BROWSE_LOOKUPS = 1;
  const platform = detectPlatform();
  if (!platform) return;

  let scheduled = false;
  let activeRequest = "";
  let loadingMode = LOADING_MODES.DETAILS;
  // Streaming sites recycle card elements while rows refresh. Keep the
  // identity last seen for each element rather than marking it forever.
  const observedBrowseCards = new WeakMap();
  const browseQueue = [];
  const queuedBrowseKeys = new Set();
  const browseInFlightKeys = new Set();
  const browseResults = new Map();
  const browseTargets = new Map();

  function detectPlatform() {
    const host = location.hostname;
    if (host.endsWith("netflix.com")) return "netflix";
    if (host.endsWith("primevideo.com")) return "prime";
    if (host.endsWith("disneyplus.com")) return "disney";
    return "";
  }

  function isBrowseMode() {
    return loadingMode !== LOADING_MODES.DETAILS;
  }

  function isFullBrowseMode() {
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

  function doubanSearchUrl(title) {
    const url = new URL("https://search.douban.com/movie/subject_search");
    url.searchParams.set("search_text", title);
    return url.href;
  }

  function failureTooltip(result, title) {
    const manualSearch = " — search " + title + " on Douban";
    switch (result?.reason) {
      case "no_match":
        return "No confident Douban match" + manualSearch;
      case "douban_challenge":
        return "Douban asked for verification" + manualSearch;
      case "missing_score":
        return "The matched Douban page has no available score" + manualSearch;
      case "network_error":
      case "empty_response":
        return "Could not retrieve a Douban result right now" + manualSearch;
      default:
        return "Search " + title + " on Douban";
    }
  }

  function renderRating(result, title) {
    const insertionPoint = getInsertionPoint();
    if (!insertionPoint || !title) return clearChip();

    const matched = Boolean(result?.ok && result.score);
    const score = matched ? result.score : "?";

    let chip = document.getElementById(CHIP_ID);
    if (!chip) {
      chip = document.createElement("a");
      chip.id = CHIP_ID;
      chip.target = "_blank";
      chip.rel = "noopener noreferrer";
      insertionPoint.node.insertAdjacentElement(insertionPoint.position, chip);
    }
    chip.href = matched ? result.sourceUrl : doubanSearchUrl(title);
    chip.replaceChildren();
    chip.append(
      createDoubanIcon("dourate-rating-icon"),
      document.createTextNode(score + "/10 from Douban")
    );
    chip.title = matched
      ? "Open " + (result.matchedTitle || "this title") + " on Douban"
      : failureTooltip(result, title);
  }

  function clearBrowseBadge(card) {
    card?.querySelector("." + CARD_BADGE_CLASS)?.remove();
  }

  function ensureCardPositioning(card) {
    if (getComputedStyle(card).position === "static") {
      card.classList.add("dourate-card-host");
    }
  }

  function renderBrowseBadge(card, result, cardIdentity) {
    if (
      !card.isConnected ||
      (cardIdentity && card.dataset.dourateCardIdentity !== cardIdentity)
    ) {
      return;
    }

    ensureCardPositioning(card);
    const title = card.dataset.dourateTitle || "this title";
    const matched = Boolean(result?.ok && result.score);
    const score = matched ? result.score : "?";

    let badge = card.querySelector("." + CARD_BADGE_CLASS);
    if (!badge) {
      badge = document.createElement("a");
      badge.className = CARD_BADGE_CLASS;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
      card.append(badge);
    }
    badge.href = matched ? result.sourceUrl : doubanSearchUrl(title);
    badge.replaceChildren(
      createDoubanIcon("dourate-card-icon"),
      document.createTextNode(score)
    );
    badge.title = matched
      ? score + "/10 from Douban — open " + (result.matchedTitle || "title")
      : failureTooltip(result, title);
    badge.setAttribute(
      "aria-label",
      matched ? score + " out of 10 from Douban" : "Search " + title + " on Douban"
    );
    badge.dataset.dourateCardIdentity = cardIdentity || "";
  }

  function lookupKey(title) {
    return NetflixDouban.normalizedTitle(title);
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

  function getBrowseCardDetails(cardLink) {
    const card = getCardHost(cardLink);
    const title =
      platform === "prime"
        ? getPrimeCardTitle(cardLink)
        : platform === "disney"
          ? getDisneyCardTitle(cardLink)
          : getNetflixCardTitle(cardLink);
    const key = lookupKey(title);
    const href = cardLink.getAttribute("href") || "";
    if (!card || !title || !key || !href) return null;

    return {
      card,
      title,
      key,
      identity: platform + ":" + stableCardPath(href) + ":" + key
    };
  }

  function queueBrowseCard(cardLink, { background = false } = {}) {
    if (!isBrowseMode()) return;
    const details = getBrowseCardDetails(cardLink);
    if (!details) return;

    const { card, title, key, identity } = details;
    if (card.dataset.dourateCardIdentity !== identity) {
      card.dataset.dourateCardIdentity = identity;
      card.dataset.dourateTitle = title;
      clearBrowseBadge(card);
    }

    if (browseResults.has(key)) {
      renderBrowseBadge(card, browseResults.get(key), identity);
      return;
    }

    if (!browseTargets.has(key)) browseTargets.set(key, new Map());
    browseTargets.get(key).set(card, identity);
    if (queuedBrowseKeys.has(key) || browseInFlightKeys.has(key)) return;

    queuedBrowseKeys.add(key);
    // The page has a finite set of rendered rows. Keep DOM order so loading
    // and badges appear in the same intuitive sequence.
    browseQueue.push({ key, title, background });
    drainBrowseQueue();
  }

  function drainBrowseQueue() {
    while (browseInFlightKeys.size < MAX_BROWSE_LOOKUPS && browseQueue.length) {
      const { key, title, background } = browseQueue.shift();
      queuedBrowseKeys.delete(key);
      if (browseResults.has(key) || browseInFlightKeys.has(key)) continue;

      browseInFlightKeys.add(key);
      const lookup =
        background && isFullBrowseMode()
          ? delay(FULL_BACKGROUND_DELAY_MS).then(() =>
              chrome.runtime.sendMessage({ type: "LOOKUP_DOUBAN_RATING", payload: { title } })
            )
          : chrome.runtime.sendMessage({ type: "LOOKUP_DOUBAN_RATING", payload: { title } });

      lookup
        .then((result) => {
          const resolvedResult = result || { ok: false, reason: "empty_response" };
          browseResults.set(key, resolvedResult);
          for (const [card, identity] of browseTargets.get(key) || []) {
            renderBrowseBadge(card, resolvedResult, identity);
          }
          browseTargets.delete(key);
        })
        .catch((error) => {
          console.debug("[DouRate] browse lookup unavailable", error);
          const failedResult = { ok: false, reason: "network_error" };
          browseResults.set(key, failedResult);
          for (const [card, identity] of browseTargets.get(key) || []) {
            renderBrowseBadge(card, failedResult, identity);
          }
          browseTargets.delete(key);
        })
        .finally(() => {
          browseInFlightKeys.delete(key);
          drainBrowseQueue();
        });
    }
  }

  const browseCardObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) queueBrowseCard(entry.target, { background: false });
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
      if (isFullBrowseMode()) {
        queueBrowseCard(cardLink, { background: !isCardNearViewport(cardLink) });
      } else if (isCardNearViewport(cardLink)) {
        queueBrowseCard(cardLink, { background: false });
      }
    }
  }

  async function refresh() {
    scheduled = false;
    const titleContext = isTitleContext();
    // A title detail view can itself contain recommendation rows. Keep
    // details-only behaviour focused on that single title.
    if (isBrowseMode() && !titleContext) scanBrowseCards();
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
      const result = await chrome.runtime.sendMessage({
        type: "LOOKUP_DOUBAN_RATING",
        payload: { title, year, mediaType }
      });
      if (requestKey !== activeRequest) return;
      renderRating(result, title);
    } catch (error) {
      console.debug("[DouRate] overlay unavailable", error);
      renderRating({ ok: false, reason: "network_error" }, title);
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
