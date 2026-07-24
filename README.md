# DouRate — local demonstration

Version 0.2.3 · Manifest V3 · local installation only

DouRate displays an available Douban score such as 9.4/10 from Douban on title pages and as a compact badge on browse cards for Netflix, Prime Video, and Disney+. Clicking a score opens the matched Douban page.

## Local installation

Chrome installs a development extension from an unpacked folder, not by double-clicking the ZIP file.

1. Extract dourate-demo-0.2.3.zip, if using the packaged artifact.
2. Open chrome://extensions.
3. Enable Developer mode.
4. Click Load unpacked and select the extracted netflix-douban-rating folder.
5. Open or reload a Netflix, Prime Video, or Disney+ title or browse page.

When updating the source folder, select Update on the extensions page, then reload the current streaming tab.

## Behaviour and data flow

- Runs only on Netflix, Prime Video, and Disney+ website pages.
- Reads the visible platform title, and when available its release year and media type, to resolve a rating.
- Makes direct requests from the user's browser to Douban; Wikidata is used only as a cross-language title disambiguation fallback.
- The browser may attach an existing normal Douban session to those requests. The extension does not request, read, persist, or expose usernames, passwords, or cookie values.
- Stores matched title/rating results in chrome.storage.local for up to 15 days. This device-local cache reduces repeat requests and is never synced or sent to a developer-operated service.
- If a Douban verification page, HTTP 403, or HTTP 429 is detected, pauses new direct-Douban lookups globally for about 30 minutes. Cached ratings remain available without a new request.
- It does not alter platform playback or DRM, and does not send title metadata or browsing history to a developer-operated service.
- Scores are shown only for sufficiently confident matches. Ambiguous or unavailable results show a question-mark search link rather than a guessed score. When a browse card exposes a year or media type, that metadata is included in matching.

## Loading modes

- Details only (default) fetches only when an individual streaming title is open.
- Browse: visible area fetches only cards near the viewport; new cards are fetched after scrolling.
- Browse: full page fetches all currently rendered cards in display order. Cards below the fold wait at least eight seconds before their lookup begins.

Select a mode from the DouRate toolbar popup, then refresh the current streaming page for it to take effect. The full-page option remains automated use and can still trigger Douban's security checks; its slower pace is not a guarantee against verification or account action.

The toolbar popup also reports recent lookup success/failure and an active verification pause. Its Douban link opens only when the user selects it; opening the popup does not initiate an additional test request.

A small number of titles can still be unavailable because Douban has no available result, the platform and Douban titles use different translations, or a sufficiently reliable match cannot be made. In those cases, DouRate shows a question-mark search link instead of a guessed score.

## Loading expectations

- On an individual streaming title page, an available rating usually appears quickly.
- In full-page mode, cards the platform has already rendered are looked up one at a time in display order, including cards below the fold. Scores fill in progressively, so please allow time for the page-wide list to complete.

## Package contents

- manifest.json — Manifest V3 definition and the exact sites the extension can access.
- content.js / content.css — Netflix, Prime Video, and Disney+ page and browse-card overlay.
- service-worker.js — local matching, caching, and direct lookup logic.
- shared.js — title normalisation and confidence scoring.
- assets/douban-mark.svg — the in-overlay mark.
- tests/ — dependency-free checks for matching and score extraction.

## Verification

Run these commands from this folder:

    node --test tests/shared.test.mjs
    node --check content.js
    node --check service-worker.js

## Scope note

This package is a private, locally installed demonstration for evaluating the product and discussing possible authorisation. It is not represented as a public Chrome Web Store release or as an official Netflix, Prime Video, Disney+, or Douban product.
