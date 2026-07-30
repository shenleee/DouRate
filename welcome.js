"use strict";

const download = document.getElementById("download");
const downloadSource = document.getElementById("download-source");
const status = document.getElementById("status");

function setDownloadControlsDisabled(disabled) {
  download.disabled = disabled;
  downloadSource.setAttribute("aria-disabled", String(disabled));
}

async function downloadDataset() {
  if (download.disabled) return;
  setDownloadControlsDisabled(true);
  download.textContent = "正在下载与建立索引…";
  status.textContent = "这可能需要一点时间，请保持此页面和浏览器打开。";
  try {
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_IMDB_DATASET" });
    if (result?.ok) {
      download.textContent = "IMDB 数据已准备好";
      status.textContent = "现在刷新 Netflix、Prime Video 或 Disney+ 页面，即可查看可匹配的评分。";
      return;
    }
    setDownloadControlsDisabled(false);
    download.textContent = "重新下载";
    status.textContent = `IMDB 数据未完成下载：${result?.message || result?.reason || "请稍后重试"}`;
  } catch {
    setDownloadControlsDisabled(false);
    download.textContent = "重新下载";
    status.textContent = "无法启动 IMDB 数据下载，请稍后重试。";
  }
}

download.addEventListener("click", downloadDataset);
downloadSource.addEventListener("click", async (event) => {
  event.preventDefault();
  await downloadDataset();
});
