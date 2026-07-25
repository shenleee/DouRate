/* global NetflixDouban */
importScripts("shared.js");

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 15;
const DOUBAN_REQUEST_INTERVAL_MS = 2000;
const PROVIDER_COOLDOWN_MS = 1000 * 60 * 30;
const CACHE_STORAGE_PREFIX = "douRateCache:";
const WIKIDATA_TITLE_CACHE_STORAGE_PREFIX = "douRateWikidataTitle:";
const DIAGNOSTICS_STORAGE_KEY = "douRateDiagnostics";
const IMDB_STATUS_STORAGE_KEY = "douRateIMDbStatus";
const IMDB_DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const IMDB_DB_NAME = "douRateIMDbRatings";
const IMDB_DB_VERSION = 1;
const IMDB_METADATA_KEY = "current";
const IMDB_IMPORT_BATCH_SIZE = 1000;
const IMDB_STATUS_ROW_INTERVAL = 25000;
const lookupCache = new Map();
const pendingLookups = new Map();
const wikidataTitleCache = new Map();
const pendingWikidataLookups = new Map();
const imdbLookupCache = new Map();
let doubanRequestChain = Promise.resolve();
let lastDoubanRequestAt = 0;
let diagnosticsCache = null;
let imdbMetadataCache;
let imdbImportPromise = null;

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

function wikidataTitleCacheStorageKey(key) {
  return `${WIKIDATA_TITLE_CACHE_STORAGE_PREFIX}${key}`;
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

async function getCachedWikidataTitleData(key) {
  const memoryEntry = wikidataTitleCache.get(key);
  if (memoryEntry) return memoryEntry;

  const storageKey = wikidataTitleCacheStorageKey(key);
  try {
    const stored = (await chrome.storage.local.get(storageKey))[storageKey];
    if (!isFreshCacheEntry(stored)) {
      if (stored) await chrome.storage.local.remove(storageKey);
      return null;
    }
    const data = stored.value;
    if (!data?.wikidataId) return null;
    wikidataTitleCache.set(key, data);
    return data;
  } catch (error) {
    console.debug("[DouRate] Wikidata title cache unavailable", error);
    return null;
  }
}

async function saveCachedWikidataTitleData(key, value) {
  if (!value?.wikidataId) return;
  wikidataTitleCache.set(key, value);
  try {
    await chrome.storage.local.set({
      [wikidataTitleCacheStorageKey(key)]: { savedAt: Date.now(), value }
    });
  } catch (error) {
    console.debug("[DouRate] could not persist Wikidata title mapping", error);
  }
}

function canUseIMDbDatabase() {
  return typeof indexedDB !== "undefined";
}

function openIMDbDatabase() {
  if (!canUseIMDbDatabase()) {
    return Promise.reject(lookupError("imdb_storage_unavailable", "IndexedDB is unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMDB_DB_NAME, IMDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      let ratings;
      if (database.objectStoreNames.contains("ratings")) {
        ratings = transaction.objectStore("ratings");
      } else {
        ratings = database.createObjectStore("ratings", { keyPath: ["generation", "id"] });
      }
      if (!ratings.indexNames.contains("generation")) {
        ratings.createIndex("generation", "generation", { unique: false });
      }
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open IMDb database"));
    request.onblocked = () => reject(new Error("IMDb database is blocked by another extension context"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IMDb database transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IMDb database transaction aborted"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IMDb database request failed"));
  });
}

async function getIMDbMetadata() {
  if (imdbMetadataCache !== undefined) return imdbMetadataCache;
  if (!canUseIMDbDatabase()) {
    imdbMetadataCache = null;
    return imdbMetadataCache;
  }

  let database;
  try {
    database = await openIMDbDatabase();
    const transaction = database.transaction("metadata", "readonly");
    const completion = transactionDone(transaction);
    const entry = await requestResult(transaction.objectStore("metadata").get(IMDB_METADATA_KEY));
    await completion;
    imdbMetadataCache = entry || null;
  } catch (error) {
    console.debug("[DouRate] IMDb metadata unavailable", error);
    imdbMetadataCache = null;
  } finally {
    database?.close();
  }
  return imdbMetadataCache;
}

async function saveIMDbMetadata(metadata) {
  const database = await openIMDbDatabase();
  try {
    const transaction = database.transaction("metadata", "readwrite");
    const completion = transactionDone(transaction);
    transaction.objectStore("metadata").put({ key: IMDB_METADATA_KEY, ...metadata });
    await completion;
    imdbMetadataCache = { key: IMDB_METADATA_KEY, ...metadata };
    return imdbMetadataCache;
  } finally {
    database.close();
  }
}

async function writeIMDbRatings(generation, rows) {
  if (!rows.length) return;
  const database = await openIMDbDatabase();
  try {
    const transaction = database.transaction("ratings", "readwrite");
    const completion = transactionDone(transaction);
    const ratings = transaction.objectStore("ratings");
    for (const row of rows) ratings.put({ generation, ...row });
    await completion;
  } finally {
    database.close();
  }
}

async function getIMDbRating(generation, id) {
  const database = await openIMDbDatabase();
  try {
    const transaction = database.transaction("ratings", "readonly");
    const completion = transactionDone(transaction);
    const result = await requestResult(transaction.objectStore("ratings").get([generation, id]));
    await completion;
    return result || null;
  } finally {
    database.close();
  }
}

async function deleteIMDbGeneration(generation) {
  if (!generation || !canUseIMDbDatabase()) return;
  const database = await openIMDbDatabase();
  try {
    const transaction = database.transaction("ratings", "readwrite");
    const completion = transactionDone(transaction);
    const index = transaction.objectStore("ratings").index("generation");
    const request = index.openKeyCursor(IDBKeyRange.only(generation));
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        transaction.objectStore("ratings").delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error("Could not remove IMDb data"));
    });
    await completion;
  } finally {
    database.close();
  }
}

async function removeStaleIMDbGenerations(currentGeneration) {
  if (!currentGeneration || !canUseIMDbDatabase()) return;
  const database = await openIMDbDatabase();
  try {
    const transaction = database.transaction("ratings", "readwrite");
    const completion = transactionDone(transaction);
    const store = transaction.objectStore("ratings");
    const request = store.openCursor();
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (cursor.value?.generation !== currentGeneration) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error("Could not clean stale IMDb data"));
    });
    await completion;
  } finally {
    database.close();
  }
}

async function setIMDbStatus(patch) {
  let current = {};
  try {
    current = (await chrome.storage.local.get(IMDB_STATUS_STORAGE_KEY))[IMDB_STATUS_STORAGE_KEY] || {};
  } catch (error) {
    console.debug("[DouRate] IMDb status unavailable", error);
  }
  const status = { ...current, ...patch };
  try {
    await chrome.storage.local.set({ [IMDB_STATUS_STORAGE_KEY]: status });
  } catch (error) {
    console.debug("[DouRate] could not persist IMDb status", error);
  }
  return status;
}

async function getIMDbDatasetStatus() {
  let transient = {};
  try {
    transient = (await chrome.storage.local.get(IMDB_STATUS_STORAGE_KEY))[IMDB_STATUS_STORAGE_KEY] || {};
  } catch (error) {
    console.debug("[DouRate] IMDb status read failed", error);
  }
  const metadata = await getIMDbMetadata();
  if (transient.phase === "downloading") return { ...metadata, ...transient };
  if (metadata) return { ...transient, phase: "ready", ...metadata };
  return transient.phase === "error" ? transient : { phase: "missing" };
}

function safeIMDbErrorMessage(error) {
  const message = String(error?.message || "");
  if (/decompression/i.test(message)) return "The IMDb download could not be decompressed";
  if (/IndexedDB|database/i.test(message)) return "Local IMDb storage is unavailable";
  if (/HTTP\s+\d+/i.test(message)) return message;
  return "The IMDb dataset download did not complete";
}

async function importIMDbDataset() {
  if (imdbImportPromise) return imdbImportPromise;

  const generation = `imdb-${Date.now()}`;
  const importTask = (async () => {
    await setIMDbStatus({
      phase: "downloading",
      startedAt: Date.now(),
      rowsIndexed: 0,
      error: ""
    });

    try {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("DecompressionStream is unavailable in this browser");
      }
      const response = await fetch(IMDB_DATASET_URL, {
        credentials: "omit",
        headers: { Accept: "application/gzip,application/octet-stream" }
      });
      if (!response.ok) throw new Error(`IMDb dataset download failed (HTTP ${response.status})`);
      if (!response.body) throw new Error("IMDb dataset download returned no readable body");

      const reader = response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
      const decoder = new TextDecoder();
      let bufferedText = "";
      let rowsIndexed = 0;
      let lastStatusRows = 0;
      let batch = [];

      async function flushBatch() {
        if (!batch.length) return;
        await writeIMDbRatings(generation, batch);
        rowsIndexed += batch.length;
        batch = [];
        if (rowsIndexed - lastStatusRows >= IMDB_STATUS_ROW_INTERVAL) {
          lastStatusRows = rowsIndexed;
          await setIMDbStatus({ phase: "downloading", rowsIndexed });
        }
      }

      async function consumeLine(line) {
        const row = NetflixDouban.parseIMDbRatingRow(line);
        if (!row) return;
        batch.push(row);
        if (batch.length >= IMDB_IMPORT_BATCH_SIZE) await flushBatch();
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bufferedText += decoder.decode(value, { stream: true });
        const lines = bufferedText.split(/\r?\n/);
        bufferedText = lines.pop() || "";
        for (const line of lines) await consumeLine(line);
      }
      bufferedText += decoder.decode();
      if (bufferedText) await consumeLine(bufferedText);
      await flushBatch();

      if (!rowsIndexed) throw new Error("IMDb dataset did not contain rating rows");
      const metadata = {
        generation,
        updatedAt: Date.now(),
        sourceLastModified: response.headers.get("last-modified") || "",
        sourceBytes: Number(response.headers.get("content-length") || 0),
        rowCount: rowsIndexed
      };
      await saveIMDbMetadata(metadata);
      imdbLookupCache.clear();
      await setIMDbStatus({ phase: "ready", ...metadata, error: "" });
      removeStaleIMDbGenerations(generation).catch((error) =>
        console.debug("[DouRate] could not clean stale IMDb data", error)
      );
      return { ok: true, ...metadata };
    } catch (error) {
      await deleteIMDbGeneration(generation).catch((cleanupError) =>
        console.debug("[DouRate] could not remove incomplete IMDb data", cleanupError)
      );
      const existing = await getIMDbMetadata();
      await setIMDbStatus({
        phase: existing ? "ready" : "error",
        error: safeIMDbErrorMessage(error),
        lastFailureAt: Date.now()
      });
      return { ok: false, reason: "imdb_download_failed", message: safeIMDbErrorMessage(error) };
    }
  })();

  imdbImportPromise = importTask.finally(() => {
    imdbImportPromise = null;
  });
  return imdbImportPromise;
}

async function deleteIMDbDataset() {
  if (imdbImportPromise) return { ok: false, reason: "imdb_download_in_progress" };
  if (!canUseIMDbDatabase()) return { ok: true };
  await setIMDbStatus({ phase: "deleting", error: "" });
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMDB_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Could not delete IMDb data"));
    request.onblocked = () => reject(new Error("IMDb data is in use; close the popup and try again"));
  });
  imdbMetadataCache = null;
  imdbLookupCache.clear();
  await setIMDbStatus({ phase: "missing", deletedAt: Date.now(), error: "", rowsIndexed: 0 });
  return { ok: true };
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

function chooseCanonicalEntity(items, title, year, mediaType) {
  const expected = NetflixDouban.normalizedTitle(title);
  const exact = (items || []).filter(
    (item) => NetflixDouban.normalizedTitle(item.label) === expected && looksLikeScreenWork(item.description)
  );
  if (!exact.length) return null;

  const yearMatches = year
    ? exact.filter((item) => new RegExp(`\\b${year}\\b`).test(item.description || ""))
    : [];
  const candidates = yearMatches.length ? yearMatches : exact;

  if (mediaType === "tv") {
    return candidates.find((item) => /\b(television|tv|anime|series|show)\b/i.test(item.description || "")) || null;
  }
  if (mediaType === "movie") {
    return candidates.find((item) => /\b(film|movie)\b/i.test(item.description || "")) || null;
  }
  return candidates[0];
}

function extractIMDbId(entity) {
  const value = entity?.claims?.P345?.[0]?.mainsnak?.datavalue?.value;
  return /^tt\d{5,}$/i.test(value || "") ? value : "";
}

async function getWikidataTitleData(title, year, mediaType) {
  const key = cacheKey(title, year, mediaType);
  const cached = await getCachedWikidataTitleData(key);
  if (cached) return cached;
  if (pendingWikidataLookups.has(key)) return pendingWikidataLookups.get(key);

  const lookup = (async () => {
    try {
      const search = await fetchWikidata({
        action: "wbsearchentities",
        search: title,
        language: "en",
        format: "json",
        origin: "*",
        limit: "8"
      });
      const entity = chooseCanonicalEntity(search.search, title, year, mediaType);
      if (!entity) return null;

      const entities = await fetchWikidata({
        action: "wbgetentities",
        ids: entity.id,
        props: "labels|claims",
        languages: "zh-hans|zh-cn|zh",
        format: "json",
        origin: "*"
      });
      const wikidataEntity = entities.entities?.[entity.id] || {};
      const labels = wikidataEntity.labels || {};
      return {
        canonicalTitle:
          labels["zh-hans"]?.value || labels["zh-cn"]?.value || labels.zh?.value || "",
        imdbId: extractIMDbId(wikidataEntity),
        wikidataId: entity.id
      };
    } catch (error) {
      console.debug("[DouRate] Wikidata title lookup unavailable", error);
      // Keep a transient mapping failure distinct from a confident no-match.
      // It must not be retained as an "IMDb ID missing" result.
      return undefined;
    }
  })();

  pendingWikidataLookups.set(key, lookup);
  try {
    const result = await lookup;
    if (result) await saveCachedWikidataTitleData(key, result);
    return result;
  } finally {
    pendingWikidataLookups.delete(key);
  }
}

async function getCanonicalDoubanTitle(title, year, mediaType) {
  const data = await getWikidataTitleData(title, year, mediaType);
  return data?.canonicalTitle || null;
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

    const canonicalTitle = await getCanonicalDoubanTitle(cleanTitle, year, mediaType);
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

function imdbLookupKey(title, year, mediaType) {
  return `imdb:${cacheKey(title, year, mediaType)}`;
}

async function lookupIMDbRating({ title, year, mediaType }) {
  const cleanTitle = NetflixDouban.cleanTitle(title);
  if (!cleanTitle) return { ok: false, reason: "missing_title" };

  const normalizedMediaType = /^(movie|tv)$/.test(mediaType || "") ? mediaType : "";
  const key = imdbLookupKey(cleanTitle, year, normalizedMediaType);
  if (imdbLookupCache.has(key)) return imdbLookupCache.get(key);

  const lookup = (async () => {
    const metadata = await getIMDbMetadata();
    if (!metadata?.generation) return { ok: false, reason: "imdb_data_missing" };

    const wikidata = await getWikidataTitleData(cleanTitle, year, normalizedMediaType);
    if (wikidata === undefined) return { ok: false, reason: "imdb_mapping_unavailable" };
    const imdbId = wikidata?.imdbId;
    if (!imdbId) return { ok: false, reason: "imdb_no_id" };

    try {
      const rating = await getIMDbRating(metadata.generation, imdbId);
      if (!rating?.score) return { ok: false, reason: "imdb_missing_score", imdbId };
      return {
        ok: true,
        score: rating.score,
        votes: rating.votes,
        imdbId,
        matchedTitle: cleanTitle,
        sourceUrl: `https://www.imdb.com/title/${imdbId}/`,
        updatedAt: metadata.updatedAt,
        sourceLastModified: metadata.sourceLastModified || ""
      };
    } catch (error) {
      console.debug("[DouRate] IMDb local rating lookup unavailable", error);
      return { ok: false, reason: "imdb_storage_unavailable" };
    }
  })();

  imdbLookupCache.set(key, lookup);
  try {
    const result = await lookup;
    // Do not keep an intermittent mapping/storage problem for the rest of a
    // service-worker lifetime. A later card or refresh should be allowed to
    // retry; stable local states remain inexpensive to cache.
    if (result?.ok || ["imdb_data_missing", "imdb_no_id", "imdb_missing_score"].includes(result?.reason)) {
      imdbLookupCache.set(key, result);
    } else {
      imdbLookupCache.delete(key);
    }
    return result;
  } catch (error) {
    imdbLookupCache.delete(key);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const payload = message?.payload || {};
  if (message?.type === "LOOKUP_DOUBAN_RATING") {
    lookupDoubanRating(payload).then(sendResponse);
  } else if (message?.type === "LOOKUP_IMDB_RATING") {
    lookupIMDbRating(payload).then(sendResponse);
  } else if (message?.type === "GET_IMDB_DATASET_STATUS") {
    getIMDbDatasetStatus().then(sendResponse);
  } else if (message?.type === "DOWNLOAD_IMDB_DATASET") {
    importIMDbDataset().then(sendResponse);
  } else if (message?.type === "DELETE_IMDB_DATASET") {
    deleteIMDbDataset()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, reason: "imdb_delete_failed", message: safeIMDbErrorMessage(error) }));
  } else {
    return undefined;
  }
  return true;
});
