"use strict";

const STORAGE_KEY = "douRateLoadingMode";
const DIAGNOSTICS_KEY = "douRateDiagnostics";
const DEFAULT_MODE = "details";
const validModes = new Set(["details", "browse-visible", "browse-full"]);
const inputs = [...document.querySelectorAll("input[name='loading-mode']")];
const status = document.getElementById("status");
const diagnostics = document.getElementById("diagnostics");
const diagnosticsPanel = document.getElementById("diagnostics-panel");

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

  return { problem: false, text: "尚未查询评分。" };
}

async function renderDiagnostics() {
  try {
    const settings = await chrome.storage.local.get(DIAGNOSTICS_KEY);
    const state = settings[DIAGNOSTICS_KEY] || {};
    const message = diagnosticsMessage(state);
    diagnostics.textContent = message.text;
    diagnosticsPanel.classList.toggle("problem", message.problem);
  } catch {
    diagnostics.textContent = "暂时无法读取查询状态。";
    diagnosticsPanel.classList.add("problem");
  }
}

chrome.storage.local
  .get(STORAGE_KEY)
  .then((settings) => selectMode(settings[STORAGE_KEY]))
  .catch(() => selectMode(DEFAULT_MODE));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[DIAGNOSTICS_KEY]) renderDiagnostics();
});

renderDiagnostics();

for (const input of inputs) {
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: input.value });
    status.textContent = "已保存。请刷新当前流媒体页面。";
  });
}
