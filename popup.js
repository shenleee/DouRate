"use strict";

const STORAGE_KEY = "douRateLoadingMode";
const DEFAULT_MODE = "details";
const validModes = new Set(["details", "browse-visible", "browse-full"]);
const inputs = [...document.querySelectorAll("input[name='loading-mode']")];
const status = document.getElementById("status");

function selectMode(mode) {
  const selected = validModes.has(mode) ? mode : DEFAULT_MODE;
  const input = inputs.find((candidate) => candidate.value === selected);
  if (input) input.checked = true;
}

chrome.storage.local
  .get(STORAGE_KEY)
  .then((settings) => selectMode(settings[STORAGE_KEY]))
  .catch(() => selectMode(DEFAULT_MODE));

for (const input of inputs) {
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: input.value });
    status.textContent = "已保存。请刷新当前流媒体页面。";
  });
}
