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
    lookup(payload) {
      return new Promise((resolve) => {
        const keepOpen = messageListener(
          { type: "LOOKUP_DOUBAN_RATING", payload },
          {},
          resolve
        );
        assert.equal(keepOpen, true);
      });
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
