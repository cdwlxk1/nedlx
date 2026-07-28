const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const MAX_LINKS = 6;

const DEFAULT_LINKS = [
  { id: "video-1", title: "视频号内容", description: "打开视频号链接，查看内容后完成签到。", url: "https://weixin.qq.com/sph/AQk4HX6E6v" },
  { id: "article-1", title: "微信公众号文章", description: "打开公众号文章，阅读后完成签到。", url: "https://mp.weixin.qq.com/s/YeI2lXYCQ9_Zal0_oq1USA" }
];

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    try {
      if (request.method !== "POST") return json({ ok: false, error: "只支持 POST 请求" }, 405, corsHeaders);
      const contentType = request.headers.get("Content-Type") || "";
      const result = contentType.toLowerCase().startsWith("multipart/form-data")
        ? await handleMultipart(await request.formData(), env)
        : await handle(await request.json(), env);
      return json({ ok: true, ...result }, 200, corsHeaders);
    } catch (error) {
      const status = error.statusCode || 500;
      return json({ ok: false, error: error.message || "接口处理失败" }, status, corsHeaders);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanupExportedCheckins(env));
  }
};

function getCorsHeaders(request, env) {
  const configured = String(env.ALLOWED_ORIGIN || "https://nedvision.cn").trim();
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigins = configured.split(",").map((origin) => origin.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes("*") ? "*" : (allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
}

async function handleMultipart(form, env) {
  const action = clean(form.get("action"), 40);
  if (action !== "checkin") throw httpError(400, "不支持的上传操作");
  const screenshot = form.get("screenshot");
  if (!(screenshot instanceof File)) throw httpError(400, "请上传签到截图");
  return checkinRecord({
    visitorId: form.get("visitorId"),
    name: form.get("name"),
    linkId: form.get("linkId"),
    linkTitle: form.get("linkTitle"),
    linkUrl: form.get("linkUrl")
  }, env, screenshot);
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers });
}

async function handle(request, env) {
  const action = clean(request.action, 40);
  if (action === "getLinks") return { links: await getLinks(env) };

  if (action === "publishLinks") {
    requireAdmin(request, env);
    const links = cleanLinks(request.links);
    if (!links.length) throw httpError(400, "没有有效链接可发布");
    await replaceLinks(links, env);
    return { status: "published", links };
  }

  if (action === "open") {
    const visitorId = clean(request.visitorId, 120);
    const linkId = clean(request.linkId, 80);
    const linkUrl = clean(request.linkUrl, 2000);
    if (!visitorId || !linkId || !isHttpUrl(linkUrl)) throw httpError(400, "点击记录信息不完整");
    await createRecord(env, env.FEISHU_EVENTS_TABLE_ID, {
      visitorId,
      姓名: clean(request.name, 40),
      链接ID: linkId,
      链接标题: clean(request.linkTitle, 100),
      链接地址: linkUrl,
      点击时间: new Date().toISOString(),
      日期: beijingDay()
    });
    return { status: "recorded" };
  }

  if (action === "checkin") {
    return checkinRecord(request, env);
  }

  if (action === "getCheckinsForExport") {
    requireAdmin(request, env);
    const rows = (await listRecords(env, env.FEISHU_CHECKINS_TABLE_ID)).filter((row) => !row.exportedAt);
    return { status: "ready", checkins: rows };
  }

  if (action === "markCheckinsExported") {
    requireAdmin(request, env);
    const recordIds = Array.isArray(request.recordIds) ? request.recordIds.filter((id) => typeof id === "string").slice(0, 1000) : [];
    if (!recordIds.length) return { status: "marked", count: 0 };
    const idSet = new Set(recordIds);
    const rows = (await listRecords(env, env.FEISHU_CHECKINS_TABLE_ID)).filter((row) => idSet.has(row.recordId) && !row.exportedAt);
    const exportedAt = new Date().toISOString();
    for (const row of rows) await updateRecord(env, env.FEISHU_CHECKINS_TABLE_ID, row.recordId, { 导出时间: exportedAt });
    return { status: "marked", exportedAt, count: rows.length };
  }

  if (action === "getRecords") {
    requireAdmin(request, env);
    const [events, checkins] = await Promise.all([
      listRecords(env, env.FEISHU_EVENTS_TABLE_ID),
      listRecords(env, env.FEISHU_CHECKINS_TABLE_ID)
    ]);
    return { events, checkins };
  }

  throw httpError(400, "不支持的操作");
}

async function checkinRecord(request, env, screenshot) {
  const visitorId = clean(request.visitorId, 120);
  const name = clean(request.name, 40);
  const linkId = clean(request.linkId, 80);
  const linkUrl = clean(request.linkUrl, 2000);
  if (!visitorId || !name || !linkId || !isHttpUrl(linkUrl)) throw httpError(400, "签到信息不完整");

  let attachment;
  if (screenshot) {
    if (!(screenshot instanceof File)) throw httpError(400, "截图格式不正确");
    validateScreenshot(screenshot);
    attachment = await uploadFeishuAttachment(env, screenshot);
  }

  const day = beijingDay();
  const fields = {
    visitorId,
    姓名: name,
    链接ID: linkId,
    链接标题: clean(request.linkTitle, 100),
    链接地址: linkUrl,
    签到时间: new Date().toISOString(),
    日期: day
  };
  if (attachment) fields.截图 = [attachment];
  const existing = (await listRecords(env, env.FEISHU_CHECKINS_TABLE_ID)).find((item) => item.visitorId === visitorId && item.linkId === linkId && item.day === day);
  if (existing) await updateRecord(env, env.FEISHU_CHECKINS_TABLE_ID, existing.recordId, fields);
  else await createRecord(env, env.FEISHU_CHECKINS_TABLE_ID, fields);
  return { status: "checked-in", name, day, screenshot: Boolean(attachment) };
}

async function getLinks(env) {
  const rows = await listRecords(env, env.FEISHU_LINKS_TABLE_ID);
  const links = rows.map((row) => ({ id: row.id, title: row.title, description: row.description, url: row.url })).filter((link) => link.id && isHttpUrl(link.url)).slice(0, MAX_LINKS);
  return links.length ? links : [...DEFAULT_LINKS];
}

async function replaceLinks(links, env) {
  const oldRows = await listRecords(env, env.FEISHU_LINKS_TABLE_ID);
  for (const row of oldRows) await deleteRecord(env, env.FEISHU_LINKS_TABLE_ID, row.recordId);
  for (const link of links) {
    await createRecord(env, env.FEISHU_LINKS_TABLE_ID, { ID: link.id, 标题: link.title, 描述: link.description, 链接: link.url, 更新时间: new Date().toISOString() });
  }
}

async function getTenantAccessToken(env) {
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }) });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || !result.tenant_access_token) throw httpError(500, `飞书鉴权失败：${result.msg || response.status}`);
  return result.tenant_access_token;
}

async function feishuRequest(env, path, options = {}) {
  const token = await getTenantAccessToken(env);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${FEISHU_API_BASE}${path}`, { ...options, headers });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw httpError(500, `飞书接口失败：${result.msg || response.status}`);
  return result;
}

async function feishuMultipartRequest(env, path, formData) {
  const token = await getTenantAccessToken(env);
  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw httpError(500, `飞书附件上传失败：${result.msg || response.status}`);
  return result;
}

function validateScreenshot(file) {
  const maxBytes = 10 * 1024 * 1024;
  if (!file || file.size <= 0) throw httpError(400, "截图不能为空");
  if (file.size > maxBytes) throw httpError(400, "截图不能超过 10MB");
  if (!String(file.type || "").toLowerCase().startsWith("image/")) throw httpError(400, "截图必须是图片格式");
}

async function uploadFeishuAttachment(env, file) {
  if (!env.FEISHU_APP_TOKEN) throw httpError(500, "Worker 尚未配置飞书多维表格 App Token");
  const fileName = clean(String(file.name || "checkin-screenshot.png").replace(/[\\/\r\n]/g, "_"), 180) || "checkin-screenshot.png";
  const formData = new FormData();
  formData.append("file_name", fileName);
  formData.append("parent_type", "bitable_file");
  formData.append("parent_node", String(env.FEISHU_APP_TOKEN));
  formData.append("size", String(file.size));
  formData.append("file", file, fileName);
  const result = await feishuMultipartRequest(env, "/drive/v1/medias/upload_all", formData);
  const fileToken = result.data && result.data.file_token;
  if (!fileToken) throw httpError(500, "飞书没有返回附件 file_token");
  return { file_token: fileToken, name: fileName, size: file.size, type: file.type || "image/png" };
}

async function listRecords(env, tableId) {
  if (!tableId) throw httpError(500, "Worker 尚未配置表格 ID");
  const rows = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const result = await feishuRequest(env, `/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${tableId}/records?${query}`);
    const data = result.data || {};
    (data.items || []).forEach((item) => rows.push(toRow(item)));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);
  return rows;
}

function toRow(item) {
  const fields = item.fields || {};
  return {
    recordId: item.record_id,
    id: fieldText(fields.ID),
    title: fieldText(fields.标题),
    description: fieldText(fields.描述),
    url: fieldText(fields.链接),
    visitorId: fieldText(fields.visitorId),
    name: fieldText(fields.姓名),
    linkId: fieldText(fields.链接ID),
    linkTitle: fieldText(fields.链接标题),
    linkUrl: fieldText(fields.链接地址),
    time: fieldText(fields.点击时间 || fields.签到时间),
    checkedAt: fieldText(fields.签到时间),
    day: fieldText(fields.日期),
    exportedAt: fieldText(fields.导出时间),
    screenshot: fieldAttachments(fields.截图)
  };
}

function fieldText(value) {
  if (Array.isArray(value)) return value.map((item) => item && typeof item === "object" ? item.text || item.name || "" : String(item)).join(", ");
  return value === undefined || value === null ? "" : String(value);
}

function fieldAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").map((item) => ({
    name: clean(item.name, 180),
    fileToken: clean(item.file_token, 200),
    url: clean(item.tmp_url, 2000)
  })).filter((item) => item.name || item.fileToken || item.url);
}

async function createRecord(env, tableId, fields) {
  await feishuRequest(env, `/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${tableId}/records`, { method: "POST", body: JSON.stringify({ fields }) });
}

async function updateRecord(env, tableId, recordId, fields) {
  await feishuRequest(env, `/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${tableId}/records/${recordId}`, { method: "PUT", body: JSON.stringify({ fields }) });
}

async function deleteRecord(env, tableId, recordId) {
  await feishuRequest(env, `/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${tableId}/records/${recordId}`, { method: "DELETE" });
}

async function cleanupExportedCheckins(env) {
  const rows = await listRecords(env, env.FEISHU_CHECKINS_TABLE_ID);
  const exportedRows = rows.filter((row) => row.exportedAt);
  for (const row of exportedRows) {
    await deleteRecord(env, env.FEISHU_CHECKINS_TABLE_ID, row.recordId);
  }
  return { deleted: exportedRows.length };
}

function clean(value, maxLength = 200) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function isHttpUrl(value) { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch (error) { return false; } }
function cleanLinks(value) { return Array.isArray(value) ? value.filter((item) => item && isHttpUrl(item.url)).slice(0, MAX_LINKS).map((item, index) => ({ id: clean(item.id, 80) || `link-${index + 1}`, title: clean(item.title, 100) || `链接 ${index + 1}`, description: clean(item.description, 200) || "打开链接，查看内容后完成签到。", url: clean(item.url, 2000) })) : []; }
function beijingDay() { return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function requireAdmin(request, env) { if (!env.ADMIN_PASSWORD || clean(request.adminPassword, 100) !== clean(env.ADMIN_PASSWORD, 100)) throw httpError(401, "管理员密码错误"); }
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
