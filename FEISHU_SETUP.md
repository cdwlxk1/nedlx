# 飞书版部署说明

## 一、飞书多维表格

创建一个多维表格，并创建三张数据表。字段名请按下面填写，建议全部使用“文本”字段：

### links

`ID`、`标题`、`描述`、`链接`、`更新时间`

### events

`visitorId`、`姓名`、`链接ID`、`链接标题`、`链接地址`、`点击时间`、`日期`

### checkins

`visitorId`、`姓名`、`链接ID`、`链接标题`、`链接地址`、`签到时间`、`日期`

记录表的默认字段“文本”可以删除或保留，但代码使用的字段名必须准确一致。

## 二、飞书应用权限

创建飞书自建应用，记录：

- App ID
- App Secret
- 多维表格的 App Token
- 三张表的 Table ID

把应用添加到多维表格，并授予多维表格记录的读取、创建、修改、删除权限。App Secret 不要写进 GitHub。

## 三、部署 Worker

将 `feishu-worker.js` 部署到 Cloudflare Workers 或其他支持标准 Fetch 的 Serverless 服务。

配置以下服务端环境变量：

```text
FEISHU_APP_ID=你的飞书 App ID
FEISHU_APP_SECRET=你的飞书 App Secret
FEISHU_APP_TOKEN=多维表格 App Token
FEISHU_LINKS_TABLE_ID=links 表的 Table ID
FEISHU_EVENTS_TABLE_ID=events 表的 Table ID
FEISHU_CHECKINS_TABLE_ID=checkins 表的 Table ID
ADMIN_PASSWORD=管理员密码
ALLOWED_ORIGIN=https://cdwlx.github.io
```

Worker 部署后得到一个 `https://....workers.dev` 地址。把它填写到 `cloud-config.js`：

```js
window.LINK_HUB_CONFIG = Object.freeze({
  apiUrl: "https://你的-worker地址.workers.dev"
});
```

然后把 `cloud-config.js`、`index.html`、`app.js`、`admin.html`、`admin.js`、`styles.css` 上传到 GitHub 仓库根目录。

公共页面：`https://cdwlx.github.io/nedlx/`

管理页面：`https://cdwlx.github.io/nedlx/admin.html`
