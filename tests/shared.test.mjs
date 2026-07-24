import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../shared.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const helpers = context.globalThis.NetflixDouban;

test("cleans common Netflix title wrappers", () => {
  assert.equal(helpers.cleanTitle("Watch Inception | Netflix"), "Inception");
  assert.equal(helpers.cleanTitle("The Glory - Netflix"), "The Glory");
});

test("chooses an exact title and year over a loosely related suggestion", () => {
  const choice = helpers.pickSuggestion(
    [
      { id: "1", url: "https://movie.douban.com/subject/1/", type: "movie", title: "Inception", year: "2010" },
      { id: "2", url: "https://movie.douban.com/subject/2/", type: "movie", title: "Inception: The Cobol Job", year: "2010" }
    ],
    "Inception",
    "2010"
  );
  assert.equal(choice.id, "1");
});

test("does not select an unrelated suggestion", () => {
  const choice = helpers.pickSuggestion(
    [{ id: "1", url: "https://movie.douban.com/subject/1/", type: "movie", title: "Other Film", year: "2020" }],
    "Mine",
    "2021"
  );
  assert.equal(choice, null);
});

test("rejects a known year or media-type conflict", () => {
  const choice = helpers.pickSuggestion(
    [{ id: "1", url: "https://movie.douban.com/subject/1/", type: "movie", title: "The Death Note", year: "2016" }],
    "DEATH NOTE",
    "2006",
    "tv"
  );
  assert.equal(choice, null);
});

test("extracts a valid public Douban score", () => {
  assert.equal(
    helpers.extractDoubanRating('<strong class="ll rating_num" property="v:average">9.4</strong>'),
    "9.4"
  );
  assert.equal(helpers.extractDoubanRating('<strong class="rating_num">12.0</strong>'), null);
});

test("recognizes the anti-bot response without trying to solve it", () => {
  assert.equal(helpers.looksLikeDoubanChallenge('<form name="sec"><input id="tok">载入中 ...'), true);
});
