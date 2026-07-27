(() => {
  "use strict";

  const DEFAULT_LINKS = [
    {
      id: "video-1",
      title: "视频号内容",
      description: "打开视频号链接，查看内容后完成签到。",
      url: "https://weixin.qq.com/sph/AQk4HX6E6v"
    },
    {
      id: "article-1",
      title: "微信公众号文章",
      description: "打开公众号文章，阅读完成后完成签到。",
      url: "https://mp.weixin.qq.com/s/YeI2lXYCQ9_Zal0_oq1USA"
    }
  ];

  const MAX_LINKS = 6;
  const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
  const CONFIG = window.LINK_HUB_CONFIG || {};
  const API_URL = typeof CONFIG.apiUrl === "string" ? CONFIG.apiUrl.trim() : "";
  const RECORDS_STORAGE_KEY = "link-checkin-records-v1";
  const LINKS_STORAGE_KEY = "link-checkin-published-links-v1";
  const NAME_STORAGE_KEY = "link-checkin-visitor-name-v1";
  const VISITOR_ID_KEY = "link-checkin-visitor-id-v1";
  const state = loadRecords();
  const attentionIds = new Set();
  const screenshotFiles = new Map();
  let links = loadLinks();
  let visitorName = loadVisitorName();
  const list = document.querySelector("#link-list");
  const template = document.querySelector("#link-card-template");
  const visitorNameInput = document.querySelector("#visitor-name");
  const saveNameButton = document.querySelector("#save-name-button");
  const nameFeedback = document.querySelector("#name-feedback");
  const submitAllButton = document.querySelector("#submit-all-button");
  const submitFeedback = document.querySelector("#submit-feedback");

  refreshNameForm();
  renderLinks();
  if (API_URL) syncLinksFromCloud();

  submitAllButton.addEventListener("click", submitAllCheckins);

  saveNameButton.addEventListener("click", () => {
    if (visitorNameInput.disabled) {
      visitorNameInput.disabled = false;
      saveNameButton.textContent = "保存姓名";
      setNameFeedback("可以修改姓名，保存后会用于后续签到。", "");
      visitorNameInput.focus();
      return;
    }

    const name = visitorNameInput.value.trim();
    if (!name) {
      setNameFeedback("请先填写姓名。", "error");
      visitorNameInput.focus();
      return;
    }

    visitorName = name;
    saveVisitorName();
    refreshNameForm();
    setNameFeedback(`已保存姓名：${visitorName}。每个链接签到时都会使用这个姓名。`, "success");
  });

  document.querySelector("#clear-button").addEventListener("click", () => {
    if (!window.confirm("确定要清除这台设备上的所有查看和签到记录吗？")) return;
    Object.keys(state).forEach((key) => delete state[key]);
    saveRecords();
    visitorName = "";
    saveVisitorName();
    refreshNameForm();
    links.forEach((link) => refreshCard(link.id));
    updateSummary();
  });

  async function syncLinksFromCloud() {
    try {
      const response = await callApi({ action: "getLinks" });
      if (Array.isArray(response.links) && response.links.length) {
        links = sanitizeLinks(response.links);
        removeRecordsForMissingLinks();
        renderLinks();
      }
    } catch (error) {
      setNameFeedback("云端链接加载失败，当前显示本机缓存。", "error");
    }
  }

  async function callApi(payload, file) {
    if (!API_URL) return { local: true };
    let options;
    if (file) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, String(value ?? "")));
      formData.append("screenshot", file, file.name || "checkin-screenshot.png");
      options = { method: "POST", body: formData };
    } else {
      options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
    }
    const response = await fetch(API_URL, options);
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch (error) { throw new Error("云端返回格式错误"); }
    if (!response.ok || result.ok === false) throw new Error(result.error || `云端请求失败（${response.status}）`);
    return result;
  }

  function loadRecords() {
    try {
      const saved = window.localStorage.getItem(RECORDS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveRecords() {
    try {
      window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // 浏览器禁用本地存储时，页面仍可完成本次交互。
    }
  }

  function loadVisitorName() {
    try {
      const saved = window.localStorage.getItem(NAME_STORAGE_KEY);
      return typeof saved === "string" ? saved.trim().slice(0, 20) : "";
    } catch (error) {
      return "";
    }
  }

  function saveVisitorName() {
    try {
      if (visitorName) window.localStorage.setItem(NAME_STORAGE_KEY, visitorName);
      else window.localStorage.removeItem(NAME_STORAGE_KEY);
    } catch (error) {
      // 浏览器禁用本地存储时，当前页面仍可完成本次交互。
    }
  }

  function getVisitorId() {
    try {
      let id = window.localStorage.getItem(VISITOR_ID_KEY);
      if (!id) {
        id = window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(VISITOR_ID_KEY, id);
      }
      return id;
    } catch (error) {
      return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function refreshNameForm() {
    visitorNameInput.value = visitorName;
    visitorNameInput.disabled = Boolean(visitorName);
    saveNameButton.textContent = visitorName ? "修改姓名" : "保存姓名";
  }

  function setNameFeedback(message, type) {
    nameFeedback.textContent = message;
    nameFeedback.className = `name-feedback${type ? ` ${type}` : ""}`;
  }

  function loadLinks() {
    try {
      const saved = window.localStorage.getItem(LINKS_STORAGE_KEY) || window.localStorage.getItem("link-checkin-links-v1");
      const parsed = saved ? JSON.parse(saved) : null;
      const validLinks = sanitizeLinks(parsed);
      return validLinks.length ? validLinks : [...DEFAULT_LINKS];
    } catch (error) {
      return [...DEFAULT_LINKS];
    }
  }

  function saveLinks() {
    try {
      window.localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
    } catch (error) {
      // 浏览器禁用本地存储时，当前页面仍可显示已生成的链接。
    }
  }

  function sanitizeLinks(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.url === "string" && isHttpUrl(item.url)).map((item, index) => ({
      id: typeof item.id === "string" ? item.id : createId(item.url),
      title: typeof item.title === "string" && item.title ? item.title : `链接 ${index + 1}`,
      description: typeof item.description === "string" && item.description ? item.description : "打开链接，查看内容后完成签到。",
      url: item.url
    })).slice(0, MAX_LINKS);
  }

  function parseLinks(text) {
    const parts = String(text || "").split(/[;；\n\r]+/).map((part) => part.trim()).filter(Boolean);
    const urls = [];
    let invalidCount = 0;

    parts.forEach((part) => {
      if (!isHttpUrl(part)) {
        invalidCount += 1;
        return;
      }
      const normalized = normalizeUrl(part);
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    });

    return { urls, invalidCount };
  }

  function isHttpUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function normalizeUrl(value) {
    try {
      return new URL(value).href;
    } catch (error) {
      return value;
    }
  }

  function createLink(url, index) {
    let host = "网页内容";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      // URL has already been checked by parseLinks.
    }
    return {
      id: `generated-${createId(url)}`,
      title: `链接 ${index + 1}`,
      description: `打开 ${host}，查看内容后完成签到。`,
      url
    };
  }

  function createId(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function removeRecordsForMissingLinks() {
    const ids = new Set(links.map((link) => link.id));
    Object.keys(state).forEach((id) => {
      if (!ids.has(id)) delete state[id];
    });
    saveRecords();
  }

  function renderLinks() {
    list.replaceChildren();
    links.forEach((link, index) => renderCard(link, index));
    document.querySelector("#link-count-text").textContent = `已生成 ${links.length} / ${MAX_LINKS} 个`;
    updateSummary();
  }

  function renderCard(link, index) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".link-card");
    const openButton = fragment.querySelector(".open-link-button");
    const screenshotInput = fragment.querySelector(".screenshot-input");
    const screenshotPreview = fragment.querySelector(".screenshot-preview");
    const screenshotPreviewImage = fragment.querySelector(".screenshot-preview-image");
    const screenshotFileName = fragment.querySelector(".screenshot-file-name");
    card.dataset.linkId = link.id;
    fragment.querySelector(".card-index").textContent = String(index + 1).padStart(2, "0");
    fragment.querySelector(".card-title").textContent = link.title;
    fragment.querySelector(".card-description").textContent = link.description;
    fragment.querySelector(".url-preview").textContent = link.url;
    openButton.href = link.url;
    openButton.setAttribute("aria-label", `打开${link.title}`);

    if (screenshotInput) {
      screenshotInput.addEventListener("change", () => {
        const file = screenshotInput.files && screenshotInput.files[0];
        if (!file) {
          screenshotFiles.delete(link.id);
          if (screenshotPreview) screenshotPreview.hidden = true;
          if (screenshotPreviewImage) screenshotPreviewImage.removeAttribute("src");
          if (screenshotFileName) screenshotFileName.textContent = "";
          return;
        }
        if (!file.type.startsWith("image/")) {
          screenshotInput.value = "";
          screenshotFiles.delete(link.id);
          if (screenshotPreview) screenshotPreview.hidden = true;
          setFeedback(card.querySelector(".feedback"), "请选择图片格式的截图。", "error");
          return;
        }
        if (file.size === 0 || file.size > MAX_SCREENSHOT_BYTES) {
          screenshotInput.value = "";
          screenshotFiles.delete(link.id);
          if (screenshotPreview) screenshotPreview.hidden = true;
          setFeedback(card.querySelector(".feedback"), "截图不能为空，且图片大小不能超过 10MB。", "error");
          return;
        }
        screenshotFiles.set(link.id, file);
        if (screenshotFileName) screenshotFileName.textContent = `${file.name}（${formatFileSize(file.size)}）`;
        if (screenshotPreviewImage) screenshotPreviewImage.src = URL.createObjectURL(file);
        if (screenshotPreview) screenshotPreview.hidden = false;
        setFeedback(card.querySelector(".feedback"), "截图已选择，点击页面下方“提交签到”即可上传。", "");
      });
    }

    openButton.addEventListener("click", () => {
      const record = getRecord(link.id);
      state[link.id] = { ...record, viewed: true };
      attentionIds.delete(link.id);
      saveRecords();
      refreshCard(link.id);
      updateSummary();
      if (API_URL) callApi({ action: "open", visitorId: getVisitorId(), name: visitorName, linkId: link.id, linkTitle: link.title, linkUrl: link.url }).catch(() => {});
    });

    list.appendChild(fragment);
    refreshCard(link.id);
  }

  function getRecord(id) {
    return state[id] && typeof state[id] === "object" ? state[id] : {};
  }

  function refreshCard(id) {
    const link = links.find((item) => item.id === id);
    const card = list.querySelector(`[data-link-id="${CSS.escape(id)}"]`);
    if (!link || !card) return;

    const record = getRecord(id);
    const status = card.querySelector(".card-status");
    const feedback = card.querySelector(".feedback");

    card.classList.toggle("is-viewed", Boolean(record.viewed));
    card.classList.toggle("is-signed", Boolean(record.name));
    card.classList.toggle("needs-attention", attentionIds.has(id));

    if (record.name) {
      status.textContent = "已签到";
      setFeedback(feedback, `已记录：${record.name}`, "success");
    } else if (record.viewed) {
      status.textContent = "待签到";
      setFeedback(feedback, "已打开链接，请填写姓名完成签到。", "");
    } else if (attentionIds.has(id)) {
      status.textContent = "请先打开";
      setFeedback(feedback, "请先打开这个链接后再提交。", "error");
    } else {
      status.textContent = "未查看";
      setFeedback(feedback, "", "");
    }
  }

  function setFeedback(element, message, type) {
    element.textContent = message;
    element.className = `feedback${type ? ` ${type}` : ""}`;
  }

  function setGeneratorFeedback(element, message, type) {
    element.textContent = message;
    element.className = `generator-feedback${type ? ` ${type}` : ""}`;
  }

  async function submitAllCheckins() {
    if (submitAllButton.disabled) return;

    const unopenedLinks = links.filter((link) => !getRecord(link.id).viewed);
    attentionIds.clear();
    unopenedLinks.forEach((link) => attentionIds.add(link.id));
    links.forEach((link) => refreshCard(link.id));

    if (unopenedLinks.length) {
      setSubmitFeedback(`还有 ${unopenedLinks.length} 个链接未打开，请先打开红色标记的链接。`, "error");
      const firstCard = list.querySelector(`[data-link-id="${CSS.escape(unopenedLinks[0].id)}"]`);
      firstCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!visitorName) {
      setSubmitFeedback("请先在页面上方填写姓名。", "error");
      visitorNameInput.focus();
      return;
    }

    const pendingLinks = links.filter((link) => !getRecord(link.id).name);
    if (!pendingLinks.length) {
      setSubmitFeedback("所有链接已经完成签到。", "success");
      submitAllButton.disabled = true;
      submitAllButton.textContent = "已完成签到";
      return;
    }

    submitAllButton.disabled = true;
    submitAllButton.textContent = "提交中…";
    setSubmitFeedback("正在提交签到，请稍候。", "");
    try {
      for (const link of pendingLinks) {
        const screenshotFile = screenshotFiles.get(link.id) || null;
        if (API_URL) {
          const response = await callApi({ action: "checkin", visitorId: getVisitorId(), name: visitorName, linkId: link.id, linkTitle: link.title, linkUrl: link.url }, screenshotFile);
          if (response.status !== "checked-in") throw new Error(`${link.title}没有完成签到`);
        }
        const record = getRecord(link.id);
        state[link.id] = { ...record, name: visitorName, signedAt: new Date().toISOString(), screenshotName: screenshotFile ? screenshotFile.name : "" };
        refreshCard(link.id);
      }
      saveRecords();
      updateSummary();
      setSubmitFeedback(`已成功提交 ${pendingLinks.length} 个链接的签到。`, "success");
      submitAllButton.textContent = "已完成签到";
    } catch (error) {
      setSubmitFeedback(`提交失败：${error.message}`, "error");
      submitAllButton.disabled = false;
      submitAllButton.textContent = "重新提交签到";
    }
  }

  function setSubmitFeedback(message, type) {
    submitFeedback.textContent = message;
    submitFeedback.className = `submit-feedback${type ? ` ${type}` : ""}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function updateSummary() {
    const signedCount = links.filter((link) => Boolean(getRecord(link.id).name)).length;
    const viewedCount = links.filter((link) => Boolean(getRecord(link.id).viewed)).length;
    const total = links.length;
    const progress = total ? Math.round((signedCount / total) * 100) : 0;

    document.querySelector("#progress-text").textContent = `${signedCount} / ${total} 已签到`;
    document.querySelector("#progress-bar").style.width = `${progress}%`;
    document.querySelector("#viewed-text").textContent = `已打开 ${viewedCount} 个链接`;
  }
})();
