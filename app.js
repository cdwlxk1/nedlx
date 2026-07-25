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
  const RECORDS_STORAGE_KEY = "link-checkin-records-v1";
  const LINKS_STORAGE_KEY = "link-checkin-links-v1";
  const NAME_STORAGE_KEY = "link-checkin-visitor-name-v1";
  const state = loadRecords();
  let links = loadLinks();
  let visitorName = loadVisitorName();
  const list = document.querySelector("#link-list");
  const template = document.querySelector("#link-card-template");
  const linkInput = document.querySelector("#link-input");
  const generatorFeedback = document.querySelector("#generator-feedback");
  const visitorNameInput = document.querySelector("#visitor-name");
  const saveNameButton = document.querySelector("#save-name-button");
  const nameFeedback = document.querySelector("#name-feedback");

  linkInput.value = links.map((link) => link.url).join(";\n");
  refreshNameForm();
  renderLinks();

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

  document.querySelector("#generate-button").addEventListener("click", () => {
    const result = parseLinks(linkInput.value);

    if (result.urls.length === 0) {
      setGeneratorFeedback(generatorFeedback, "没有识别到有效的 http 或 https 链接。", "error");
      return;
    }

    const limitedUrls = result.urls.slice(0, MAX_LINKS);
    links = limitedUrls.map((url, index) => createLink(url, index));
    saveLinks();
    removeRecordsForMissingLinks();
    renderLinks();

    const extraMessage = result.urls.length > MAX_LINKS ? `，已取前 ${MAX_LINKS} 个` : "";
    const invalidMessage = result.invalidCount ? `，忽略 ${result.invalidCount} 个无效内容` : "";
    setGeneratorFeedback(generatorFeedback, `已生成 ${links.length} 个链接窗口${extraMessage}${invalidMessage}。`, "success");
  });

  document.querySelector("#clear-button").addEventListener("click", () => {
    if (Object.keys(state).length === 0) return;
    if (!window.confirm("确定要清除这台设备上的所有查看和签到记录吗？")) return;
    Object.keys(state).forEach((key) => delete state[key]);
    saveRecords();
    visitorName = "";
    saveVisitorName();
    refreshNameForm();
    links.forEach((link) => refreshCard(link.id));
    updateSummary();
  });

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
      const saved = window.localStorage.getItem(LINKS_STORAGE_KEY);
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
    const confirmButton = fragment.querySelector(".confirm-button");

    card.dataset.linkId = link.id;
    fragment.querySelector(".card-index").textContent = String(index + 1).padStart(2, "0");
    fragment.querySelector(".card-title").textContent = link.title;
    fragment.querySelector(".card-description").textContent = link.description;
    fragment.querySelector(".url-preview").textContent = link.url;
    openButton.href = link.url;
    openButton.setAttribute("aria-label", `打开${link.title}`);

    openButton.addEventListener("click", () => {
      const record = getRecord(link.id);
      state[link.id] = { ...record, viewed: true };
      saveRecords();
      refreshCard(link.id);
      updateSummary();
    });

    confirmButton.addEventListener("click", () => {
      const record = getRecord(link.id);
      const feedback = card.querySelector(".feedback");

      if (!record.viewed) {
        setFeedback(feedback, "请先点击“打开链接”查看内容，再进行签到。", "error");
        return;
      }
      if (!visitorName) {
        setFeedback(feedback, "请先在页面上方填写姓名。", "error");
        visitorNameInput.focus();
        return;
      }

      state[link.id] = { ...record, name: visitorName, signedAt: new Date().toISOString() };
      saveRecords();
      refreshCard(link.id);
      updateSummary();
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

    if (record.name) {
      status.textContent = "已签到";
      card.querySelector(".confirm-button").textContent = "已确定";
      setFeedback(feedback, `已记录：${record.name}`, "success");
    } else if (record.viewed) {
      status.textContent = "待签到";
      input.disabled = false;
      card.querySelector(".confirm-button").textContent = "确定签到";
      setFeedback(feedback, "已打开链接，请填写姓名完成签到。", "");
    } else {
      status.textContent = "未查看";
      input.disabled = false;
      card.querySelector(".confirm-button").textContent = "确定签到";
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
