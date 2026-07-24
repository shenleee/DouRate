(function attachNetflixDoubanHelpers(globalScope) {
  "use strict";

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s*[|\-–—]\s*(?:Netflix|Disney\+)\s*$/i, "")
      .replace(/^Prime Video:\s*/i, "")
      .replace(/^Watch\s+/i, "")
      .replace(/\s*\([^)]*\)\s*$/i, "")
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
    const match = String(value || "").match(/\b((?:19|20)\d{2})\b/);
    return match ? match[1] : "";
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

  globalScope.NetflixDouban = {
    cleanTitle,
    normalizedTitle,
    parseYear,
    pickSuggestion,
    extractDoubanRating,
    looksLikeDoubanChallenge
  };
})(globalThis);
