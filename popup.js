"use strict";

const STORAGE_KEY = "douRateLoadingMode";
const DIAGNOSTICS_KEY = "douRateDiagnostics";
const IMDB_STATUS_KEY = "douRateIMDbStatus";
const DEFAULT_MODE = "browse-visible";
const validModes = new Set(["details", "browse-visible", "browse-full"]);
const inputs = [...document.querySelectorAll("input[name='loading-mode']")];
const status = document.getElementById("status");
const diagnostics = document.getElementById("diagnostics");
const diagnosticsPanel = document.getElementById("diagnostics-panel");
const version = document.getElementById("version");
const imdbPanel = document.getElementById("imdb-data-panel");
const imdbStatus = document.getElementById("imdb-status");
const imdbDownload = document.getElementById("imdb-download");
const imdbDelete = document.getElementById("imdb-delete");

version.textContent = `版本 / Version ${chrome.runtime.getManifest().version}`;

function selectMode(mode) {
  const selected = validModes.has(mode) ? mode : DEFAULT_MODE;
  const input = inputs.find((candidate) => candidate.value === selected);
  if (input) input.checked = true;
}

function formatTime(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? new Intl.NumberFormat("zh-CN").format(count) : "";
}

function failureLabel(reason) {
  switch (reason) {
    case "douban_challenge":
    case "douban_cooldown":
      return "豆瓣要求真人验证";
    case "provider_format_changed":
      return "豆瓣搜索页面格式异常";
    case "no_match":
      return "未找到足够可靠的匹配";
    case "missing_score":
      return "匹配条目没有可用评分";
    case "network_error":
    case "empty_response":
      return "临时网络或请求失败";
    default:
      return "暂时无法查询";
  }
}

function diagnosticsMessage(state) {
  const cooldownUntil = Number(state?.cooldownUntil || 0);
  if (cooldownUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 60000));
    return {
      problem: true,
      text: `豆瓣已要求验证，查询已暂停；约 ${minutes} 分钟后再试。请手动打开豆瓣完成验证后，刷新流媒体页面。`
    };
  }

  if (state?.lastSuccessAt || state?.lastFailureAt) {
    const parts = [];
    if (state.lastSuccessAt) parts.push(`最近成功：${formatTime(state.lastSuccessAt)}。`);
    if (state.lastFailureAt) {
      parts.push(
        `最近失败（${formatTime(state.lastFailureAt)}）：${failureLabel(state.lastFailureReason)}。`
      );
    }
    return {
      problem: Boolean(
        state.lastFailureAt &&
          (!state.lastSuccessAt || Number(state.lastFailureAt) >= Number(state.lastSuccessAt))
      ),
      text: parts.join(" ")
    };
  }

  return { problem: false, text: "尚未查询豆瓣评分。" };
}

async function renderDiagnostics() {
  try {
    const settings = await chrome.storage.local.get(DIAGNOSTICS_KEY);
    const state = settings[DIAGNOSTICS_KEY] || {};
    const message = diagnosticsMessage(state);
    diagnostics.textContent = message.text;
    diagnosticsPanel.classList.toggle("problem", message.problem);
  } catch {
    diagnostics.textContent = "暂时无法读取豆瓣查询状态。";
    diagnosticsPanel.classList.add("problem");
  }
}

async function localStorageUsage() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return formatSize(estimate?.usage);
  } catch {
    return "";
  }
}

function setIMDbControls({ downloading = false, ready = false } = {}) {
  imdbDownload.disabled = downloading;
  imdbDownload.textContent = downloading ? "正在下载与建立索引…" : ready ? "更新 IMDb 数据" : "下载 IMDb 数据";
  imdbDelete.hidden = !ready || downloading;
  imdbDelete.disabled = downloading;
}

async function renderIMDbStatus() {
  let state;
  try {
    state = await chrome.runtime.sendMessage({ type: "GET_IMDB_DATASET_STATUS" });
  } catch {
    state = { phase: "error", error: "暂时无法读取 IMDb 本地数据状态。" };
  }

  const phase = state?.phase || "missing";
  imdbPanel.classList.toggle("problem", phase === "error");
  if (phase === "downloading") {
    const indexed = formatCount(state.rowsIndexed);
    imdbStatus.textContent = indexed
      ? `正在下载 IMDb 官方 ratings 数据并建立本机索引：已处理 ${indexed} 条评分。请保持浏览器打开。`
      : "正在下载 IMDb 官方 ratings 数据并建立本机索引。请保持浏览器打开。";
    setIMDbControls({ downloading: true, ready: Boolean(state.generation) });
    return;
  }

  if (phase === "ready") {
    const parts = ["IMDb 本地数据已就绪"];
    const count = formatCount(state.rowCount);
    if (count) parts.push(`${count} 条评分`);
    if (state.updatedAt) parts.push(`下载于 ${formatTime(state.updatedAt)}`);
    if (state.sourceLastModified) {
      const sourceDate = new Date(state.sourceLastModified);
      if (!Number.isNaN(sourceDate.getTime())) {
        parts.push(`源数据 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(sourceDate)}`);
      }
    }
    const sourceSize = formatSize(state.sourceBytes);
    if (sourceSize) parts.push(`原始下载 ${sourceSize}`);
    const usage = await localStorageUsage();
    if (usage) parts.push(`浏览器本地存储约 ${usage}`);
    imdbStatus.textContent = `${parts.join(" · ")}。刷新流媒体页面后会自动显示可匹配的 IMDb 评分。`;
    setIMDbControls({ ready: true });
    return;
  }

  if (phase === "error") {
    imdbStatus.textContent = `IMDb 数据尚未可用：${state.error || "下载未完成"}。可重新下载。`;
    setIMDbControls();
    return;
  }

  imdbStatus.textContent = "尚未下载 IMDb 本地 ratings 数据（约 9 MB）。下载后会仅在本机查询评分，不会抓取 IMDb 网页。";
  setIMDbControls();
}

chrome.storage.local
  .get(STORAGE_KEY)
  .then((settings) => selectMode(settings[STORAGE_KEY]))
  .catch(() => selectMode(DEFAULT_MODE));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[DIAGNOSTICS_KEY]) renderDiagnostics();
  if (changes[IMDB_STATUS_KEY]) renderIMDbStatus();
});

renderDiagnostics();
renderIMDbStatus();

for (const input of inputs) {
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: input.value });
    status.textContent = "已保存。请刷新当前流媒体页面。";
  });
}

imdbDownload.addEventListener("click", async () => {
  setIMDbControls({ downloading: true });
  imdbStatus.textContent = "正在启动 IMDb 数据下载…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_IMDB_DATASET" });
    if (result?.ok) status.textContent = "IMDb 数据已更新。请刷新当前流媒体页面。";
    else status.textContent = "IMDb 数据没有完成下载；请在下方查看原因后重试。";
  } catch {
    status.textContent = "IMDb 数据下载请求失败；请稍后重试。";
  }
  await renderIMDbStatus();
});

imdbDelete.addEventListener("click", async () => {
  const confirmed = window.confirm("删除本机 IMDb 评分数据？删除后 IMDb 评分将不再显示，直到再次下载。");
  if (!confirmed) return;
  setIMDbControls({ downloading: true, ready: true });
  try {
    const result = await chrome.runtime.sendMessage({ type: "DELETE_IMDB_DATASET" });
    status.textContent = result?.ok
      ? "IMDb 本地数据已删除。请刷新当前流媒体页面。"
      : "暂时无法删除 IMDb 本地数据。";
  } catch {
    status.textContent = "暂时无法删除 IMDb 本地数据。";
  }
  await renderIMDbStatus();
});
