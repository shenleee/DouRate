/* global NetflixDouban */
importScripts("shared.js");

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 15;
const DOUBAN_REQUEST_INTERVAL_MS = 2000;
const PROVIDER_COOLDOWN_MS = 1000 * 60 * 30;
const CACHE_STORAGE_PREFIX = "douRateCache:";
const DIAGNOSTICS_STORAGE_KEY = "douRateDiagnostics";
const lookupCache = new Map();
const pendingLookups = new Map();
const canonicalTitleCache = new Map();
let doubanRequestChain = Promise.resolve();
let lastDoubanRequestAt = 0;
let diagnosticsCache = null;

function lookupError(reason, message) {
  const error = new Error(message || reason);
  error.reason = reason;
  return error;
}

function isLikelyChallengeFailure(error) {
  return (
    error?.reason === "douban_challenge" ||
    /(?:search|suggestion|subject) lookup failed \((?:403|429)\)/i.test(
      String(error?.message || "")
    )
  );
}

function lookupFailureFromResponse(label, status) {
  const reason = status === 403 || status === 429 ? "douban_challenge" : "network_error";
  return lookupError(reason, `${label} lookup failed (${status})`);
}

async function getDiagnostics() {
  if (diagnosticsCache) return diagnosticsCache;
  try {
    diagnosticsCache =
      (await chrome.storage.local.get(DIAGNOSTICS_STORAGE_KEY))[DIAGNOSTICS_STORAGE_KEY] || {};
  } catch (error) {
    console.debug("[DouRate] diagnostics unavailable", error);
    diagnosticsCache = {};
  }
  return diagnosticsCache;
}

async function updateDiagnostics(patch) {
  const current = await getDiagnostics();
  diagnosticsCache = { ...current, ...patch };
  try {
    await chrome.storage.local.set({ [DIAGNOSTICS_STORAGE_KEY]: diagnosticsCache });
  } catch (error) {
    console.debug("[DouRate] could not persist diagnostics", error);
  }
  return diagnosticsCache;
}

async function getActiveCooldown() {
  const diagnostics = await getDiagnostics();
  const cooldownUntil = Number(diagnostics.cooldownUntil || 0);
  if (cooldownUntil > Date.now()) return cooldownUntil;
  if (cooldownUntil) await updateDiagnostics({ cooldownUntil: 0 });
  return 0;
}

async function activateProviderCooldown() {
  const now = Date.now();
  const cooldownUntil = now + PROVIDER_COOLDOWN_MS;
  await updateDiagnostics({
    lastFailureAt: now,
    lastFailureReason: "douban_challenge",
    cooldownUntil
  });
  return cooldownUntil;
}

async function recordLookupOutcome(result) {
  const now = Date.now();
  if (result?.ok) {
    await updateDiagnostics({
      lastSuccessAt: now,
      lastFailureAt: 0,
      lastFailureReason: "",
      cooldownUntil: 0
    });
    return;
  }
  await updateDiagnostics({
    lastFailureAt: now,
    lastFailureReason: result?.reason || "network_error"
  });
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
  if (!response.ok) throw lookupFailureFromResponse("Suggestion", response.status);
  const body = await response.text();
  if (NetflixDouban.looksLikeDoubanChallenge(body)) {
    throw lookupError("douban_challenge", "Suggestion lookup returned a verification page");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw lookupError("provider_format_changed", "Suggestion lookup returned invalid JSON");
  }
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
  if (!response.ok) throw lookupFailureFromResponse("Search", response.status);
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
  const data = parseSearchData(html);
  if (!data) return { result: null, reason: "provider_format_changed" };
  const match = findSearchMatch(
    data,
    title,
    year,
    mediaType,
    minimumScore
  );
  const value = Number(match?.rating?.value);
  if (!match) return { result: null, reason: "no_match" };
  if (!Number.isFinite(value) || value <= 0 || value > 10) {
    return { result: null, reason: "missing_score" };
  }

  return {
    result: {
      ok: true,
      score: value.toFixed(1),
      sourceUrl: match.url,
      matchedTitle: match.title || title,
      year: match.year || ""
    },
    reason: ""
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
  if (!response.ok) throw lookupFailureFromResponse("Subject", response.status);
  return response.text();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fetchDoubanAtConservativeRate(url, options) {
  const task = doubanRequestChain.then(async () => {
    const cooldownUntil = await getActiveCooldown();
    if (cooldownUntil) {
      const error = lookupError("douban_cooldown", "Douban lookup paused after verification");
      error.retryAt = cooldownUntil;
      throw error;
    }
    const waitMs = Math.max(
      0,
      DOUBAN_REQUEST_INTERVAL_MS - (Date.now() - lastDoubanRequestAt)
    );
    if (waitMs) await sleep(waitMs);
    lastDoubanRequestAt = Date.now();
    const response = await fetch(url, options);
    if (response.status === 403 || response.status === 429) {
      await activateProviderCooldown();
    } else if (response.ok) {
      // Inspect a clone before releasing the next queued task. Douban can
      // return a verification page with HTTP 200, so status alone is not a
      // sufficient safety signal.
      const responseBody = await response.clone().text();
      if (NetflixDouban.looksLikeDoubanChallenge(responseBody)) {
        await activateProviderCooldown();
      }
    }
    return response;
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

  const cooldownUntil = await getActiveCooldown();
  if (cooldownUntil) {
    return { ok: false, reason: "douban_cooldown", retryAt: cooldownUntil };
  }

  const lookup = resolveDoubanRating(cleanTitle, year, normalizedMediaType, key);
  pendingLookups.set(key, lookup);
  try {
    return await lookup;
  } finally {
    pendingLookups.delete(key);
  }
}

async function finishLookup(key, result) {
  if (result?.ok) await saveCached(key, result);
  await recordLookupOutcome(result);
  return result;
}

async function resolveDoubanRating(cleanTitle, year, mediaType, key) {
  try {
    // A browse card has no reliable year or media type, so accept raw English
    // search results only when the title itself is an exact match. Detail pages
    // pass their Netflix metadata and can use a broader, validated match.
    const rawMinimumScore = year || mediaType ? 1 : 100;
    const search = await lookupDoubanSearch(
      cleanTitle,
      year,
      mediaType,
      rawMinimumScore
    );
    if (search.result) return finishLookup(key, search.result);
    let searchFormatChanged = search.reason === "provider_format_changed";

    const canonicalTitle = await getCanonicalDoubanTitle(cleanTitle, mediaType);
    if (canonicalTitle && NetflixDouban.normalizedTitle(canonicalTitle) !== NetflixDouban.normalizedTitle(cleanTitle)) {
      const canonicalSearch = await lookupDoubanSearch(canonicalTitle, year, mediaType, 70);
      if (canonicalSearch.result) return finishLookup(key, canonicalSearch.result);
      searchFormatChanged ||= canonicalSearch.reason === "provider_format_changed";
    }

    const suggestUrl = new URL("https://movie.douban.com/j/subject_suggest");
    suggestUrl.searchParams.set("q", cleanTitle);
    const suggestions = await fetchJson(suggestUrl);
    if (!Array.isArray(suggestions)) {
      return finishLookup(key, { ok: false, reason: "provider_format_changed" });
    }
    const candidate = NetflixDouban.pickSuggestion(
      suggestions,
      cleanTitle,
      year,
      mediaType,
      rawMinimumScore
    );
    if (!candidate) {
      return finishLookup(key, {
        ok: false,
        reason: searchFormatChanged ? "provider_format_changed" : "no_match"
      });
    }

    const html = await fetchSubjectPage(candidate.url);
    const score = NetflixDouban.extractDoubanRating(html);
    if (!score) {
      const reason = NetflixDouban.looksLikeDoubanChallenge(html)
        ? "douban_challenge"
        : "missing_score";
      const result = {
        ok: false,
        reason
      };
      if (reason === "douban_challenge") result.retryAt = await activateProviderCooldown();
      return finishLookup(key, result);
    }

    const result = {
      ok: true,
      score,
      sourceUrl: candidate.url,
      matchedTitle: candidate.title || candidate.sub_title || cleanTitle,
      year: candidate.year || ""
    };
    return finishLookup(key, result);
  } catch (error) {
    console.warn("[Netflix Douban Rating] lookup failed", error);
    if (error?.reason === "douban_cooldown") {
      return finishLookup(key, {
        ok: false,
        reason: "douban_cooldown",
        retryAt: error.retryAt || (await getActiveCooldown())
      });
    }
    const reason = isLikelyChallengeFailure(error) ? "douban_challenge" : error?.reason || "network_error";
    const result = { ok: false, reason };
    if (reason === "douban_challenge") result.retryAt = await activateProviderCooldown();
    return finishLookup(key, result);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LOOKUP_DOUBAN_RATING") return undefined;
  lookupDoubanRating(message.payload || {}).then(sendResponse);
  return true;
});
