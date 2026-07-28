# 飞书版部署说明

## 一、飞书多维表格

创建一个多维表格，并创建三张数据表。字段名请按下面填写。除特别说明外，建议使用“文本”字段：

### links

`ID`、`标题`、`描述`、`链接`、`更新时间`

### events

`visitorId`、`姓名`、`链接ID`、`链接标题`、`链接地址`、`点击时间`、`日期`

### checkins

`visitorId`、`姓名`、`链接ID`、`链接标题`、`链接地址`、`签到时间`、`日期`、`截图`、`导出时间`

其中 `截图` 如需启用图片留存功能，应创建为“附件”字段，不要创建为文本字段。截图为可选项：用户不上传截图也可以正常签到；用户选择截图后，Worker 会先把图片上传到飞书，再把附件写入这列。

`导出时间` 请创建为“文本”字段。管理端成功导出签到记录后，Worker 会写入导出时间；定时任务只会删除已经写入导出时间的记录。

记录表的默认字段“文本”可以删除或保留，但代码使用的字段名必须准确一致。

## 二、飞书应用权限

创建飞书自建应用，记录：

- App ID
- App Secret
- 多维表格的 App Token
- 三张表的 Table ID

把应用添加到多维表格，并授予多维表格记录的读取、创建、修改、删除权限，同时开通上传图片或文件资源、上传素材所需的权限。App Secret 不要写进 GitHub。

## 三、部署 Worker

将 `feishu-worker.js` 部署到 Cloudflare Workers 或其他支持标准 Fetch 的 Serverless 服务。

在 Cloudflare Worker 中添加 Cron Trigger：`0 18 * * *`。Cloudflare 使用 UTC 时间，这个表达式对应北京时间每天凌晨 2 点。触发后，Worker 会删除 `checkins` 表中已经写入 `导出时间` 的记录；未导出的记录会保留。

配置以下服务端环境变量：

```text
FEISHU_APP_ID=你的飞书 App ID
FEISHU_APP_SECRET=你的飞书 App Secret
FEISHU_APP_TOKEN=多维表格 App Token
FEISHU_LINKS_TABLE_ID=links 表的 Table ID
FEISHU_EVENTS_TABLE_ID=events 表的 Table ID
FEISHU_CHECKINS_TABLE_ID=checkins 表的 Table ID
ADMIN_PASSWORD=管理员密码
ALLOWED_ORIGIN=https://nedvision.cn,https://cdwlxk1.github.io
```

Worker 部署后得到一个 `https://....workers.dev` 地址。把它填写到 `cloud-config.js`：

```js
window.LINK_HUB_CONFIG = Object.freeze({
  apiUrl: "https://你的-worker地址.workers.dev"
});
```

然后把 `cloud-config.js`、`index.html`、`app.js`、`admin.html`、`admin.js`、`styles.css`、`nedlogo.png` 上传到 GitHub 仓库根目录，并重新部署 Worker。

公共页面：`https://nedvision.cn/`

管理页面：`https://nedvision.cn/admin.html`

## 四、截图功能的使用流程

1. 用户在公共浏览端填写姓名。
2. 打开对应链接，在外部页面完成点赞或红心。
3. 如需留存凭证，可返回公共浏览端选择截图；也可以跳过此步。
4. 点击页面下方“提交签到”。如果选择了截图，Worker 会把截图上传到飞书并写入 `checkins` 表的 `截图` 列。
5. 管理员可以直接打开飞书多维表格查看已上传的附件。

## 五、导出与自动清理

1. 管理员进入 `admin.html`，输入管理员密码。
2. 点击“导出签到记录”，浏览器会下载一个 UTF-8 CSV 文件，Excel 可以直接打开。
3. 导出成功后，Worker 会给这些记录写入 `导出时间`。
4. 每天北京时间 02:00，Cron Trigger 自动删除已写入 `导出时间` 的记录。
5. 未导出的记录不会被自动删除。

如选择截图，图片必须为非空图片格式，且不超过 10MB。
