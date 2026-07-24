/* global NetflixDouban */
importScripts("shared.js");

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 15;
const DOUBAN_REQUEST_INTERVAL_MS = 2000;
const CACHE_STORAGE_PREFIX = "douRateCache:";
const lookupCache = new Map();
const pendingLookups = new Map();
const canonicalTitleCache = new Map();
let doubanRequestChain = Promise.resolve();
let lastDoubanRequestAt = 0;

function lookupError(reason, message) {
  const error = new Error(message || reason);
  error.reason = reason;
  return error;
}

function isLikelyChallengeFailure(error) {
  return (
    error?.reason === "douban_challenge" ||
    /(?:search|suggestion) lookup failed \((?:403|429)\)/i.test(String(error?.message || ""))
  );
}

function cacheKey(title, year, mediaType) {
  return `${NetflixDouban.normalizedTitle(title)}:${year || ""}:${mediaType || ""}`;
}

function isFreshCacheEntry(entry) {
  return Boolean(entry && Date.now() - entry.savedAt <= CACHE_TTL_MS);
}

function cacheStorageKey(key) {
  return `${CACHE_STORAGE_PREFIX}${key}`;
}

async function getCached(key) {
  const entry = lookupCache.get(key);
  if (isFreshCacheEntry(entry)) return entry.value;
  if (entry) {
    lookupCache.delete(key);
  }

  const storageKey = cacheStorageKey(key);
  try {
    const stored = (await chrome.storage.local.get(storageKey))[storageKey];
    if (!isFreshCacheEntry(stored)) {
      if (stored) await chrome.storage.local.remove(storageKey);
      return null;
    }
    lookupCache.set(key, stored);
    return stored.value;
  } catch (error) {
    console.debug("[DouRate] local cache unavailable", error);
    return null;
  }
}

async function saveCached(key, value) {
  const entry = { savedAt: Date.now(), value };
  lookupCache.set(key, entry);
  try {
    await chrome.storage.local.set({ [cacheStorageKey(key)]: entry });
  } catch (error) {
    console.debug("[DouRate] could not persist local cache", error);
  }
}

async function fetchJson(url) {
  const response = await fetchDoubanAtConservativeRate(url, {
    // Douban sends anonymous automated requests to its security page. The
    // local prototype deliberately uses the user's existing Douban session;
    // cookie values are neither read nor stored by the extension.
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Suggestion lookup failed (${response.status})`);
  const body = await response.text();
  if (NetflixDouban.looksLikeDoubanChallenge(body)) {
    throw lookupError("douban_challenge", "Suggestion lookup returned a verification page");
  }
  return JSON.parse(body);
}

async function fetchDoubanSearchPage(title) {
  const searchUrl = new URL("https://search.douban.com/movie/subject_search");
  searchUrl.searchParams.set("search_text", title);
  const response = await fetchDoubanAtConservativeRate(searchUrl, {
    // See fetchJson: signed-in, same-site Douban requests are substantially
    // more reliable than anonymous extension requests for this prototype.
    credentials: "include",
    headers: { Accept: "text/html,application/xhtml+xml" }
  });
  if (!response.ok) throw new Error(`Search lookup failed (${response.status})`);
  const html = await response.text();
  if (NetflixDouban.looksLikeDoubanChallenge(html)) {
    throw lookupError("douban_challenge", "Search lookup returned a verification page");
  }
  return html;
}

function parseSearchData(html) {
  const match = String(html).match(
    /window\.__DATA__\s*=\s*({[\s\S]*?})\s*;\s*window\.__USER__/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function findSearchMatch(data, title, year, mediaType, minimumScore) {
  const candidates = (data?.items || [])
    .filter((item) => item?.tpl_name === "search_subject" && item.url)
    .map((item) => ({
      ...item,
      type: item.labels?.some((label) => label.text === "剧集") ? "tv" : "movie",
      sub_title: `${item.title || ""} ${item.abstract || ""}`,
      year: NetflixDouban.parseYear(`${item.title || ""} ${item.abstract || ""}`)
    }));
  return NetflixDouban.pickSuggestion(candidates, title, year, mediaType, minimumScore);
}

async function lookupDoubanSearch(title, year, mediaType, minimumScore) {
  const html = await fetchDoubanSearchPage(title);
  const match = findSearchMatch(
    parseSearchData(html),
    title,
    year,
    mediaType,
    minimumScore
  );
  const value = Number(match?.rating?.value);
  if (!match || !Number.isFinite(value) || value <= 0 || value > 10) return null;

  return {
    ok: true,
    score: value.toFixed(1),
    sourceUrl: match.url,
    matchedTitle: match.title || title,
    year: match.year || ""
  };
}

async function fetchWikidata(parameters) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const response = await fetch(url, {
    credentials: "omit",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Canonical-title lookup failed (${response.status})`);
  return response.json();
}

function looksLikeScreenWork(description) {
  return /\b(film|movie|television|tv|anime|series|show|drama)\b/i.test(description || "");
}

function chooseCanonicalEntity(items, title, mediaType) {
  const expected = NetflixDouban.normalizedTitle(title);
  const exact = (items || []).filter(
    (item) => NetflixDouban.normalizedTitle(item.label) === expected && looksLikeScreenWork(item.description)
  );
  if (!exact.length) return null;

  if (mediaType === "tv") {
    return exact.find((item) => /\b(television|tv|anime|series|show)\b/i.test(item.description || "")) || null;
  }
  if (mediaType === "movie") {
    return exact.find((item) => /\b(film|movie)\b/i.test(item.description || "")) || null;
  }
  return exact[0];
}

async function getCanonicalDoubanTitle(title, mediaType) {
  const key = `${NetflixDouban.normalizedTitle(title)}:${mediaType || ""}`;
  if (canonicalTitleCache.has(key)) return canonicalTitleCache.get(key);

  try {
    const search = await fetchWikidata({
      action: "wbsearchentities",
      search: title,
      language: "en",
      format: "json",
      origin: "*",
      limit: "8"
    });
    const entity = chooseCanonicalEntity(search.search, title, mediaType);
    if (!entity) return null;

    const entities = await fetchWikidata({
      action: "wbgetentities",
      ids: entity.id,
      props: "labels",
      languages: "zh-hans|zh-cn|zh",
      format: "json",
      origin: "*"
    });
    const labels = entities.entities?.[entity.id]?.labels || {};
    const canonical = labels["zh-hans"]?.value || labels["zh-cn"]?.value || labels.zh?.value || null;
    canonicalTitleCache.set(key, canonical);
    return canonical;
  } catch (error) {
    console.debug("[Netflix Douban Rating] canonical-title lookup unavailable", error);
    canonicalTitleCache.set(key, null);
    return null;
  }
}

async function fetchSubjectPage(url) {
  const response = await fetchDoubanAtConservativeRate(url, {
    // The local prototype may use an existing Douban browser session. It never
    // reads cookie values and only requests the selected public title page.
    credentials: "include",
    headers: { Accept: "text/html,application/xhtml+xml" }
  });
  if (!response.ok) throw new Error(`Subject lookup failed (${response.status})`);
  return response.text();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fetchDoubanAtConservativeRate(url, options) {
  const task = doubanRequestChain.then(async () => {
    const waitMs = Math.max(
      0,
      DOUBAN_REQUEST_INTERVAL_MS - (Date.now() - lastDoubanRequestAt)
    );
    if (waitMs) await sleep(waitMs);
    lastDoubanRequestAt = Date.now();
    return fetch(url, options);
  });
  // Keep the local queue working after an individual request fails.
  doubanRequestChain = task.catch(() => undefined);
  return task;
}

async function lookupDoubanRating({ title, year, mediaType }) {
  const cleanTitle = NetflixDouban.cleanTitle(title);
  if (!cleanTitle) return { ok: false, reason: "missing_title" };

  const normalizedMediaType = /^(movie|tv)$/.test(mediaType || "") ? mediaType : "";
  const key = cacheKey(cleanTitle, year, normalizedMediaType);
  const cached = await getCached(key);
  if (cached) return cached;
  if (pendingLookups.has(key)) return pendingLookups.get(key);

  const lookup = resolveDoubanRating(cleanTitle, year, normalizedMediaType, key);
  pendingLookups.set(key, lookup);
  try {
    return await lookup;
  } finally {
    pendingLookups.delete(key);
  }
}

async function resolveDoubanRating(cleanTitle, year, mediaType, key) {
  try {
    // A browse card has no reliable year or media type, so accept raw English
    // search results only when the title itself is an exact match. Detail pages
    // pass their Netflix metadata and can use a broader, validated match.
    const rawMinimumScore = year || mediaType ? 1 : 100;
    const searchResult = await lookupDoubanSearch(
      cleanTitle,
      year,
      mediaType,
      rawMinimumScore
    );
    if (searchResult) {
      await saveCached(key, searchResult);
      return searchResult;
    }

    const canonicalTitle = await getCanonicalDoubanTitle(cleanTitle, mediaType);
    if (canonicalTitle && NetflixDouban.normalizedTitle(canonicalTitle) !== NetflixDouban.normalizedTitle(cleanTitle)) {
      const canonicalResult = await lookupDoubanSearch(canonicalTitle, year, mediaType, 70);
      if (canonicalResult) {
        await saveCached(key, canonicalResult);
        return canonicalResult;
      }
    }

    const suggestUrl = new URL("https://movie.douban.com/j/subject_suggest");
    suggestUrl.searchParams.set("q", cleanTitle);
    const suggestions = await fetchJson(suggestUrl);
    const candidate = NetflixDouban.pickSuggestion(
      suggestions,
      cleanTitle,
      year,
      mediaType,
      rawMinimumScore
    );
    if (!candidate) return { ok: false, reason: "no_match" };

    const html = await fetchSubjectPage(candidate.url);
    const score = NetflixDouban.extractDoubanRating(html);
    if (!score) {
      return {
        ok: false,
        reason: NetflixDouban.looksLikeDoubanChallenge(html) ? "douban_challenge" : "missing_score"
      };
    }

    const result = {
      ok: true,
      score,
      sourceUrl: candidate.url,
      matchedTitle: candidate.title || candidate.sub_title || cleanTitle,
      year: candidate.year || ""
    };
    await saveCached(key, result);
    return result;
  } catch (error) {
    console.warn("[Netflix Douban Rating] lookup failed", error);
    return {
      ok: false,
      reason: isLikelyChallengeFailure(error) ? "douban_challenge" : "network_error"
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LOOKUP_DOUBAN_RATING") return undefined;
  lookupDoubanRating(message.payload || {}).then(sendResponse);
  return true;
});
