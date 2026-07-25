(() => {
  "use strict";

  const MAX_LINKS = 6;
  const LINKS_STORAGE_KEY = "link-checkin-published-links-v1";
  const RECORDS_STORAGE_KEY = "link-checkin-records-v1";
  const DEFAULT_LINKS = [
    { id: "video-1", title: "视频号内容", description: "打开视频号链接，查看内容后完成签到。", url: "https://weixin.qq.com/sph/AQk4HX6E6v" },
    { id: "article-1", title: "微信公众号文章", description: "打开公众号文章，阅读完成后完成签到。", url: "https://mp.weixin.qq.com/s/YeI2lXYCQ9_Zal0_oq1USA" }
  ];

  const input = document.querySelector("#admin-link-input");
  const feedback = document.querySelector("#publish-feedback");
  let links = loadLinks();

  input.value = links.map((link) => link.url).join(";\n");
  render();

  document.querySelector("#publish-button").addEventListener("click", () => {
    const result = parseLinks(input.value);
    if (!result.urls.length) {
      setFeedback("没有识别到有效的 http 或 https 链接。", "error");
      return;
    }

    links = result.urls.slice(0, MAX_LINKS).map((url, index) => createLink(url, index));
    saveLinks();
    render();
    const extra = result.urls.length > MAX_LINKS ? `，已取前 ${MAX_LINKS} 个` : "";
    const invalid = result.invalidCount ? `，忽略 ${result.invalidCount} 个无效内容` : "";
    setFeedback(`已发布 ${links.length} 个链接${extra}${invalid}。`, "success");
  });

  function loadLinks() {
    try {
      const raw = window.localStorage.getItem(LINKS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : DEFAULT_LINKS;
      const clean = sanitizeLinks(parsed);
      return clean.length ? clean : [...DEFAULT_LINKS];
    } catch (error) {
      return [...DEFAULT_LINKS];
    }
  }

  function saveLinks() {
    window.localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
  }

  function parseLinks(value) {
    const parts = String(value || "").split(/[;；\n\r]+/).map((item) => item.trim()).filter(Boolean);
    const urls = [];
    let invalidCount = 0;
    parts.forEach((part) => {
      if (!isHttpUrl(part)) { invalidCount += 1; return; }
      const url = new URL(part).href;
      if (!urls.includes(url)) urls.push(url);
    });
    return { urls, invalidCount };
  }

  function sanitizeLinks(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && isHttpUrl(item.url)).slice(0, MAX_LINKS);
  }

  function isHttpUrl(value) {
    try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch (error) { return false; }
  }

  function createLink(url, index) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return { id: `published-${hash(url)}`, title: `链接 ${index + 1}`, description: `打开 ${host}，查看内容后完成签到。`, url };
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
    return (result >>> 0).toString(16);
  }

  function render() {
    document.querySelector("#admin-link-count").textContent = `已发布 ${links.length} / ${MAX_LINKS} 个`;
    const linkList = document.querySelector("#admin-link-list");
    linkList.replaceChildren();
    links.forEach((link, index) => {
      const item = document.createElement("div");
      item.className = "admin-link-item";
      item.innerHTML = `<strong>${String(index + 1).padStart(2, "0")} · ${escapeHtml(link.title)}</strong><span>${escapeHtml(link.url)}</span>`;
      linkList.appendChild(item);
    });

    const recordList = document.querySelector("#record-list");
    recordList.replaceChildren();
    const records = loadRecords();
    const entries = links.flatMap((link) => records[link.id] && records[link.id].name ? [{ link, record: records[link.id] }] : []);
    if (!entries.length) { recordList.textContent = "暂无本机签到记录。"; return; }
    entries.forEach(({ link, record }) => {
      const item = document.createElement("div");
      item.className = "record-item";
      item.innerHTML = `<strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(link.title)} · ${formatTime(record.signedAt)}</span>`;
      recordList.appendChild(item);
    });
  }

  function loadRecords() {
    try { return JSON.parse(window.localStorage.getItem(RECORDS_STORAGE_KEY) || "{}"); } catch (error) { return {}; }
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function setFeedback(message, type) { feedback.textContent = message; feedback.className = `generator-feedback${type ? ` ${type}` : ""}`; }
})();
