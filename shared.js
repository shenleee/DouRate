(function attachNetflixDoubanHelpers(globalScope) {
  "use strict";

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s*[|\-–—]\s*(?:Netflix|Disney\+)\s*$/i, "")
      .replace(/^Prime Video:\s*/i, "")
      .replace(/^Watch\s+/i, "")
      .replace(/\s*\([^)]*\)\s*$/i, "")
      .replace(/[×✕]/g, " x ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedTitle(value) {
    return cleanTitle(value)
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function parseYear(value) {
    // Netflix sometimes concatenates metadata spans without spaces (for
    // example, "20241h 53m"). A digit boundary is reliable here while a word
    // boundary is not: the following duration unit is also a word character.
    // Handle that specific year-plus-duration form before ordinary year text.
    const text = String(value || "");
    const concatenatedDurationMatch = text.match(
      /(?:^|[^\d])((?:19|20)\d{2})(?=\d{1,2}\s*h\b)/i
    );
    const match = concatenatedDurationMatch || text.match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/);
    return match ? match[1] : "";
  }

  function parseRuntimeMinutes(value) {
    // Strip Netflix's concatenated year first: "20241h 53m" means 2024 and
    // 1h 53m, not a 2,024-hour runtime.
    const text = String(value || "").replace(
      /(?:19|20)\d{2}(?=\d{1,2}\s*(?:h|hr|hrs|hours)\b)/i,
      ""
    );
    const hoursAndMinutes = text.match(
      /(\d{1,2})\s*(?:h|hr|hrs|hours)\s*(?:(\d{1,2})\s*(?:m|min|mins|minutes))?/i
    );
    if (hoursAndMinutes) {
      return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] || 0);
    }
    const minutes = text.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes)\b/i);
    return minutes ? Number(minutes[1]) : 0;
  }

  function episodeMarkerIndex(value) {
    const text = cleanTitle(value);
    const spacedMarker = /(?:\s+|[|:·—-]\s*)(?:s\d{1,2}\s*[:.-]?\s*e\d{1,3}|season\s*\d+\s*episode\s*\d+|episode\s*\d+|e\d{1,3})(?=\s|[|:·—-]|$)/i.exec(text);
    if (spacedMarker) return spacedMarker.index;
    const compactChineseMarker = /(?:s\d{1,2}\s*[:.-]?\s*e\d{1,3}|e\d{1,3})(?=[\u4e00-\u9fff])/i.exec(text);
    return compactChineseMarker ? compactChineseMarker.index : -1;
  }

  function seriesTitleFromEpisodeTitle(value) {
    const text = cleanTitle(value);
    const index = episodeMarkerIndex(text);
    return index > 0 ? cleanTitle(text.slice(0, index)) : "";
  }

  function scoreCandidate(candidate, expectedTitle, expectedYear, expectedMediaType) {
    if (expectedYear && candidate.year && String(candidate.year) !== expectedYear) {
      return Number.NEGATIVE_INFINITY;
    }
    if (
      expectedMediaType &&
      candidate.type &&
      String(candidate.type).toLowerCase() !== expectedMediaType
    ) {
      return Number.NEGATIVE_INFINITY;
    }

    const expected = normalizedTitle(expectedTitle);
    const candidateNames = [candidate.title, candidate.sub_title]
      .filter(Boolean)
      .map(normalizedTitle);
    const exactName = candidateNames.includes(expected);
    const prefixName = candidateNames.some(
      (name) => name && expected && name.startsWith(`${expected} `)
    );
    const includedName = candidateNames.some(
      (name) => name && expected && (name.includes(expected) || expected.includes(name))
    );
    const yearMatches = expectedYear && String(candidate.year || "") === expectedYear;

    return (exactName ? 100 : prefixName ? 70 : includedName ? 35 : 0) + (yearMatches ? 15 : 0);
  }

  function pickSuggestion(suggestions, title, year, mediaType = "", minimumScore = 1) {
    if (!Array.isArray(suggestions)) return null;

    const supported = suggestions.filter(
      (candidate) => candidate && candidate.id && candidate.url && /^(movie|tv)$/i.test(candidate.type || "movie")
    );
    if (!supported.length) return null;

    const bestMatch = supported
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate, title, year, mediaType) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => right.score - left.score)[0];
    return bestMatch && bestMatch.score >= minimumScore ? bestMatch.candidate : null;
  }

  function extractDoubanRating(html) {
    const text = String(html || "");
    const propertyMatch = text.match(
      /<strong\b[^>]*\bproperty=["']v:average["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/strong>/i
    );
    const classMatch = text.match(
      /<strong\b[^>]*\bclass=["'][^"']*\brating_num\b[^"']*["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/strong>/i
    );
    const score = Number((propertyMatch || classMatch || [])[1]);
    return Number.isFinite(score) && score >= 0 && score <= 10 ? score.toFixed(1) : null;
  }

  function looksLikeDoubanChallenge(html) {
    return /name=["']sec["']|id=["']tok["']|载入中\s*\.\.\./i.test(String(html || ""));
  }

  function parseIMDbRatingRow(line) {
    const [id, scoreText, votesText] = String(line || "").trim().split("\t");
    const score = Number(scoreText);
    const votes = Number(votesText);
    if (!/^tt\d{5,}$/i.test(id || "")) return null;
    if (!Number.isFinite(score) || score <= 0 || score > 10) return null;
    if (!Number.isSafeInteger(votes) || votes < 0) return null;
    return { id, score: score.toFixed(1), votes };
  }

  function validateIMDbRefreshPolicy(value) {
    if (value?.mode === "manual") return { mode: "manual", intervalDays: null };
    const intervalDays = Number(value?.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 90) return null;
    return { mode: "auto", intervalDays };
  }

  function defaultIMDbRefreshPolicy() {
    return { mode: "auto", intervalDays: 7 };
  }

  function nextIMDbRefreshAt(updatedAt, policy, lastAttemptAt = 0) {
    if (policy?.mode !== "auto" || !Number.isFinite(Number(updatedAt))) return 0;
    const baseline = Math.max(Number(updatedAt), Number(lastAttemptAt) || 0);
    return baseline + Number(policy.intervalDays) * 24 * 60 * 60 * 1000;
  }

  globalScope.NetflixDouban = {
    cleanTitle,
    normalizedTitle,
    parseYear,
    parseRuntimeMinutes,
    episodeMarkerIndex,
    seriesTitleFromEpisodeTitle,
    pickSuggestion,
    extractDoubanRating,
    looksLikeDoubanChallenge,
    parseIMDbRatingRow,
    validateIMDbRefreshPolicy,
    defaultIMDbRefreshPolicy,
    nextIMDbRefreshAt
  };
})(globalThis);
