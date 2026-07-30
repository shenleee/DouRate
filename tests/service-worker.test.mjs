import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const sharedSource = readFileSync(new URL("shared.js", root), "utf8");
const workerSource = readFileSync(new URL("service-worker.js", root), "utf8");

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    clone() {
      return { text: async () => body };
    },
    text: async () => body,
    json: async () => JSON.parse(body)
  };
}

function createMetadataIndexedDb(metadata) {
  return {
    open() {
      const request = {};
      const transaction = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore(name) {
          assert.equal(name, "metadata");
          return {
            get() {
              const getRequest = {};
              queueMicrotask(() => {
                getRequest.result = metadata ? { key: "current", ...metadata } : undefined;
                getRequest.onsuccess?.();
                queueMicrotask(() => transaction.oncomplete?.());
              });
              return getRequest;
            }
          };
        }
      };
      const database = {
        transaction() { return transaction; },
        close() {},
        objectStoreNames: { contains: () => true }
      };
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };
}

function createWorker(fetchImpl, { metadata } = {}) {
  const storage = new Map();
  const alarms = { created: [], cleared: [], alarmListener: null };
  let messageListener;
  const sandbox = {
    URL,
    URLSearchParams,
    Promise,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    RegExp,
    Set,
    Map,
    console: { debug() {}, warn() {} },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    DecompressionStream: class DecompressionStream {},
    fetch: fetchImpl,
    __DOURATE_TEST__: {},
    indexedDB: createMetadataIndexedDb(metadata),
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "string") return { [keys]: storage.get(keys) };
            const result = {};
            for (const key of keys || []) result[key] = storage.get(key);
            return result;
          },
          async set(values) {
            for (const [key, value] of Object.entries(values)) storage.set(key, value);
          },
          async remove(key) {
            storage.delete(key);
          }
        }
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        }
      },
      alarms: {
        async create(name, info) { alarms.created.push({ name, info }); },
        async clear(name) { alarms.cleared.push(name); return true; },
        onAlarm: { addListener(listener) { alarms.alarmListener = listener; } }
      }
    }
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = () => vm.runInContext(sharedSource, context, { filename: "shared.js" });
  vm.runInContext(workerSource, context, { filename: "service-worker.js" });

  return {
    storage,
    alarms,
    testing: sandbox.__DOURATE_TEST__,
    send(type, payload = {}) {
      return new Promise((resolve) => {
        const keepOpen = messageListener(
          { type, payload },
          {},
          resolve
        );
        assert.equal(keepOpen, true);
      });
    },
    lookup(payload) {
      return this.send("LOOKUP_DOUBAN_RATING", payload);
    }
  };
}

test("pauses the whole direct-Douban queue after a verification response", async () => {
  let fetchCount = 0;
  const worker = createWorker(async () => {
    fetchCount += 1;
    return response(429, "Too many requests");
  });

  const first = await worker.lookup({ title: "First title" });
  const second = await worker.lookup({ title: "Second title" });

  assert.equal(first.reason, "douban_challenge");
  assert.equal(second.reason, "douban_cooldown");
  assert.equal(fetchCount, 1);
  assert.ok(second.retryAt > Date.now());
  assert.equal(worker.storage.get("douRateDiagnostics").cooldownUntil, second.retryAt);
});

test("records a changed search format separately from an unreliable title match", async () => {
  const worker = createWorker(async (url) => {
    const value = String(url);
    if (value.includes("search.douban.com")) return response(200, "<html>changed search page</html>");
    if (value.includes("wikidata.org")) return response(200, JSON.stringify({ search: [] }));
    if (value.includes("subject_suggest")) return response(200, JSON.stringify([]));
    throw new Error(`Unexpected URL: ${value}`);
  });

  const result = await worker.lookup({ title: "A title with no result" });

  assert.equal(result.reason, "provider_format_changed");
  assert.equal(worker.storage.get("douRateDiagnostics").lastFailureReason, "provider_format_changed");
});

test("does not fetch IMDb pages before the user downloads the local ratings dataset", async () => {
  let fetchCount = 0;
  const worker = createWorker(async () => {
    fetchCount += 1;
    throw new Error("IMDb lookup must not fetch a page");
  });

  const result = await worker.send("LOOKUP_IMDB_RATING", { title: "Inception", year: "2010" });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "imdb_data_missing");
  assert.equal(fetchCount, 0);
});

test("schedules IMDb auto-refresh only after local data exists", async () => {
  const updatedAt = Date.now() - 1000;
  const worker = createWorker(async () => response(503, ""), {
    metadata: { generation: "g1", updatedAt, rowCount: 2 }
  });
  const result = await worker.send("SET_IMDB_REFRESH_POLICY", { mode: "auto", intervalDays: 7 });

  assert.equal(result.ok, true);
  assert.equal(worker.alarms.created.length, 1);
  assert.equal(worker.alarms.created[0].name, "douRateIMDbRefresh");
  assert.ok(worker.alarms.created[0].info.when >= updatedAt + 6 * 24 * 60 * 60 * 1000);
});

test("manual IMDb updates remove the scheduled refresh", async () => {
  const worker = createWorker(async () => response(503, ""), {
    metadata: { generation: "g1", updatedAt: Date.now(), rowCount: 2 }
  });
  const result = await worker.send("SET_IMDB_REFRESH_POLICY", { mode: "manual" });

  assert.equal(result.ok, true);
  assert.deepEqual(worker.alarms.cleared, ["douRateIMDbRefresh"]);
});

test("keeps ready IMDb data after an automatic refresh fails", async () => {
  const worker = createWorker(async () => response(503, ""), {
    metadata: { generation: "g1", updatedAt: Date.now() - 10_000, rowCount: 2 }
  });
  await worker.send("SET_IMDB_REFRESH_POLICY", { mode: "auto", intervalDays: 7 });
  worker.alarms.alarmListener({ name: "douRateIMDbRefresh" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const status = await worker.send("GET_IMDB_DATASET_STATUS");
  assert.equal(status.phase, "ready");
  assert.match(status.error, /HTTP 503/);
  assert.ok(worker.alarms.created.length >= 2);
});

test("reuses a verified detail score for the same Netflix catalog id", async () => {
  let fetchCount = 0;
  const urls = [];
  const worker = createWorker(async (url) => {
    fetchCount += 1;
    urls.push(String(url));
    if (!/search\.douban\.com/.test(String(url))) {
      throw new Error(`Unexpected URL: ${url}`);
    }
    return response(
      200,
      `window.__DATA__ = ${JSON.stringify({
        items: [
          {
            tpl_name: "search_subject",
            id: "123",
            url: "https://movie.douban.com/subject/123/",
            title: "Inception",
            abstract: "2010 film",
            labels: [],
            rating: { value: "8.8" }
          }
        ]
      })}; window.__USER__ = {};`
    );
  });

  const detailResult = await worker.lookup({
    title: "Inception",
    year: "2010",
    mediaType: "movie",
    contentId: "netflix:999"
  });
  assert.equal(detailResult.score, "8.8", `${JSON.stringify(detailResult)} ${urls.join(", ")}`);
  assert.equal(fetchCount, 1);

  const cardResult = await worker.lookup({
    title: "INCEPTION",
    contentId: "netflix:999"
  });
  assert.equal(cardResult.score, "8.8");
  assert.equal(fetchCount, 1);
});

test("requires a unique metadata-aligned Wikidata candidate and parses duration", () => {
  const worker = createWorker(async () => response(503, ""));
  const items = [
    { id: "Q2008", label: "The Hustle", description: "2008 film" },
    { id: "Q2019", label: "The Hustle", description: "2019 film directed by Chris Addison" }
  ];
  assert.equal(worker.testing.chooseCanonicalEntity(items, "The Hustle", "", "movie"), null);
  assert.equal(worker.testing.chooseCanonicalEntity(items, "The Hustle", "2019", "movie").id, "Q2019");
  assert.equal(worker.testing.extractRuntimeMinutes({
    claims: { P2047: [{ mainsnak: { datavalue: { value: { amount: "+94", unit: "http://www.wikidata.org/entity/Q7727" } } } }] }
  }), 94);
});
