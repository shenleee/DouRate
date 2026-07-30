import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const welcomeHtml = readFileSync(new URL("welcome.html", root), "utf8");
const welcomeSource = readFileSync(new URL("welcome.js", root), "utf8");

function loadWelcome(sendMessage) {
  const download = {
    disabled: false,
    textContent: "下载 IMDB 官方数据包",
    addEventListener(event, listener) { if (event === "click") this.click = listener; }
  };
  const downloadSource = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, listener) { if (event === "click") this.click = listener; }
  };
  const status = { textContent: "" };
  const context = vm.createContext({
    document: {
      getElementById(id) {
        return id === "download" ? download : id === "download-source" ? downloadSource : status;
      }
    },
    chrome: { runtime: { sendMessage } }
  });
  vm.runInContext(welcomeSource, context, { filename: "welcome.js" });
  return { download, downloadSource, status };
}

test("welcome page includes the requested setup steps and one data action", () => {
  assert.match(welcomeHtml, /欢迎使用 DouRate/);
  assert.match(welcomeHtml, /感谢你的下载支持。本产品旨在对你的观影体验有小小的优化。/);
  assert.match(welcomeHtml, /豆瓣评分/);
  assert.match(welcomeHtml, /IMDB 评分/);
  assert.match(welcomeHtml, /https:\/\/datasets\.imdbws\.com\/title\.ratings\.tsv\.gz/);
  assert.match(welcomeHtml, /id="download-source"/);
  assert.equal((welcomeHtml.match(/<button\b/g) || []).length, 1);
});

test("the welcome link and button use the indexed local-download flow", async () => {
  const messages = [];
  const view = loadWelcome(async (message) => {
    messages.push(message);
    return { ok: true };
  });

  await view.download.click();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: "DOWNLOAD_IMDB_DATASET" }]);
  assert.equal(view.download.disabled, true);
  assert.equal(view.download.textContent, "IMDB 数据已准备好");

  const secondView = loadWelcome(async (message) => {
    messages.push(message);
    return { ok: true };
  });
  let prevented = false;
  await secondView.downloadSource.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { type: "DOWNLOAD_IMDB_DATASET" },
    { type: "DOWNLOAD_IMDB_DATASET" }
  ]);
});

test("a welcome download failure enables a retry", async () => {
  const view = loadWelcome(async () => ({ ok: false, message: "HTTP 503" }));
  await view.download.click();
  assert.equal(view.download.disabled, false);
  assert.equal(view.download.textContent, "重新下载");
  assert.match(view.status.textContent, /HTTP 503/);
});
