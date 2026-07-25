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

function createWorker(fetchImpl) {
  const storage = new Map();
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
    fetch: fetchImpl,
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
      }
    }
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = () => vm.runInContext(sharedSource, context, { filename: "shared.js" });
  vm.runInContext(workerSource, context, { filename: "service-worker.js" });

  return {
    storage,
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
