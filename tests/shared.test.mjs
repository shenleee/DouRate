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
  assert.equal(
    helpers.normalizedTitle("HUNTER×HUNTER"),
    helpers.normalizedTitle("Hunter x Hunter")
  );
});

test("extracts Netflix years when metadata spans are concatenated", () => {
  assert.equal(helpers.parseYear("20241h 53m"), "2024");
  assert.equal(helpers.parseYear("2024 1h 53m"), "2024");
  assert.equal(helpers.parseYear("a20245"), "");
});

test("extracts a real runtime from concatenated Netflix metadata", () => {
  assert.equal(helpers.parseRuntimeMinutes("20241h 53m"), 113);
  assert.equal(helpers.parseRuntimeMinutes("2024 1h 53m"), 113);
  assert.equal(helpers.parseRuntimeMinutes("47 min"), 47);
});

test("reduces an episode title to its series title when the marker is reliable", () => {
  assert.equal(helpers.seriesTitleFromEpisodeTitle("Young Sheldon S2:E3 A Crisis of Faith"), "Young Sheldon");
  assert.equal(helpers.seriesTitleFromEpisodeTitle("Young Sheldon"), "");
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

test("accepts a localized result when its English alias and year match", () => {
  const choice = helpers.pickSuggestion(
    [
      {
        id: "36340655",
        url: "https://movie.douban.com/subject/36340655/",
        type: "movie",
        title: "二号陪审员 Juror #2 (2024)",
        year: "2024"
      }
    ],
    "Juror #2",
    "2024",
    "movie"
  );
  assert.equal(choice.id, "36340655");
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

test("parses a valid IMDb ratings dataset row", () => {
  const row = helpers.parseIMDbRatingRow("tt1375666\t8.8\t2700000");
  assert.equal(row.id, "tt1375666");
  assert.equal(row.score, "8.8");
  assert.equal(row.votes, 2700000);
});

test("rejects IMDb dataset rows with an invalid id, score, or vote count", () => {
  assert.equal(helpers.parseIMDbRatingRow("titleId\taverageRating\tnumVotes"), null);
  assert.equal(helpers.parseIMDbRatingRow("tt1375666\t11.1\t2700000"), null);
  assert.equal(helpers.parseIMDbRatingRow("tt1375666\t8.8\t-3"), null);
});

test("validates IMDb refresh settings and calculates the next refresh", () => {
  const auto = helpers.validateIMDbRefreshPolicy({ mode: "auto", intervalDays: 7 });
  assert.equal(auto.mode, "auto");
  assert.equal(auto.intervalDays, 7);
  const manual = helpers.validateIMDbRefreshPolicy({ mode: "manual" });
  assert.equal(manual.mode, "manual");
  assert.equal(manual.intervalDays, null);
  assert.equal(helpers.validateIMDbRefreshPolicy({ mode: "auto", intervalDays: 0 }), null);
  assert.equal(
    helpers.nextIMDbRefreshAt(1_000, { mode: "auto", intervalDays: 7 }),
    1_000 + 7 * 24 * 60 * 60 * 1000
  );
});
