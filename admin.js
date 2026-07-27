(() => {
  "use strict";

  const MAX_LINKS = 6;
  const CONFIG = window.LINK_HUB_CONFIG || {};
  const API_URL = typeof CONFIG.apiUrl === "string" ? CONFIG.apiUrl.trim() : "";
  const LINKS_STORAGE_KEY = "link-checkin-published-links-v1";
  const RECORDS_STORAGE_KEY = "link-checkin-records-v1";
  const DEFAULT_LINKS = [
    { id: "video-1", title: "视频号内容", description: "打开视频号链接，查看内容后完成签到。", url: "https://weixin.qq.com/sph/AQk4HX6E6v" },
    { id: "article-1", title: "微信公众号文章", description: "打开公众号文章，阅读完成后完成签到。", url: "https://mp.weixin.qq.com/s/YeI2lXYCQ9_Zal0_oq1USA" }
  ];

  const input = document.querySelector("#admin-link-input");
  const feedback = document.querySelector("#publish-feedback");
  const publishButton = document.querySelector("#publish-button");
  let links = loadLinks();
  let adminPassword = "";
  let cloudRecords = { checkins: [], events: [] };

  input.value = links.map((link) => link.url).join(";\n");
  render();
  if (API_URL) loadCloudLinks();

  publishButton.addEventListener("click", async () => {
    if (publishButton.disabled) return;
    publishButton.disabled = true;
    publishButton.textContent = "发布中…";
    setFeedback("正在发布链接，请稍候…", "");

    try {
      const result = parseLinks(input.value);
      if (!result.urls.length) throw new Error("没有识别到有效的 http 或 https 链接。");

      const nextLinks = result.urls.slice(0, MAX_LINKS).map((url, index) => createLink(url, index));
      if (API_URL) {
        adminPassword = document.querySelector("#admin-password").value;
        if (!adminPassword) throw new Error("请输入管理员密码。");
        const response = await callApi({ action: "publishLinks", adminPassword, links: nextLinks });
        links = sanitizeLinks(response.links || nextLinks);
        await loadCloudRecords();
        render();
      } else {
        links = nextLinks;
        saveLinks();
        render();
      }
      const extra = result.urls.length > MAX_LINKS ? `，已取前 ${MAX_LINKS} 个` : "";
      const invalid = result.invalidCount ? `，忽略 ${result.invalidCount} 个无效内容` : "";
      setFeedback(`发布成功：已发布 ${links.length} 个链接${extra}${invalid}。`, "success");
    } catch (error) {
      setFeedback(`发布失败：${error.message}`, "error");
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = "发布到公共端";
    }
  });

  document.querySelector("#refresh-records-button").addEventListener("click", async () => {
    if (!API_URL) { render(); return; }
    adminPassword = document.querySelector("#admin-password").value;
    if (!adminPassword) { setFeedback("请输入管理员密码后再刷新记录。", "error"); return; }
    try { await loadCloudRecords(); render(); setFeedback("云端记录已刷新。", "success"); }
    catch (error) { setFeedback(`读取失败：${error.message}`, "error"); }
  });

  async function loadCloudLinks() {
    try {
      const response = await callApi({ action: "getLinks" });
      if (Array.isArray(response.links) && response.links.length) {
        links = sanitizeLinks(response.links);
        input.value = links.map((link) => link.url).join(";\n");
        render();
      }
    } catch (error) { setFeedback(`云端链接加载失败：${error.message}`, "error"); }
  }

  async function loadCloudRecords() {
    const response = await callApi({ action: "getRecords", adminPassword, limit: 500 });
    cloudRecords = { checkins: response.checkins || [], events: response.events || [] };
  }

  async function callApi(payload) {
    if (!API_URL) return { local: true };
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch (error) { throw new Error("云端返回格式错误"); }
    if (!response.ok || result.ok === false) throw new Error(result.error || `云端请求失败（${response.status}）`);
    return result;
  }

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
    const localRecords = loadRecords();
    const entries = API_URL
      ? cloudRecords.checkins.map((record) => ({ link: links.find((item) => item.id === record.linkId) || { title: record.linkTitle || "已删除链接" }, record: { name: record.name, signedAt: record.checkedAt || record.time, screenshot: record.screenshot || [] } }))
      : links.flatMap((link) => localRecords[link.id] && localRecords[link.id].name ? [{ link, record: localRecords[link.id] }] : []);
    if (!entries.length) { recordList.textContent = API_URL ? "暂无云端签到记录，或请先输入管理员密码刷新。" : "暂无本机签到记录。"; return; }
    entries.forEach(({ link, record }) => {
      const item = document.createElement("div");
      item.className = "record-item";
      const screenshotText = Array.isArray(record.screenshot) && record.screenshot.length ? ` · 截图：${record.screenshot.map((file) => file.name).filter(Boolean).join("、") || "已上传"}` : "";
      item.innerHTML = `<strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(link.title)} · ${formatTime(record.signedAt)}${escapeHtml(screenshotText)}</span>`;
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
