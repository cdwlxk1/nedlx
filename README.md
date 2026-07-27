# 常用链接签到页

这是一个无需安装、可直接用浏览器打开的静态网页。网页中已经放入两条链接：

1. 视频号内容：<https://weixin.qq.com/sph/AQk4HX6E6v>
2. 微信公众号文章：<https://mp.weixin.qq.com/s/YeI2lXYCQ9_Zal0_oq1USA>

## 签到网页

- `index.html`：公共浏览端。用户填写一次姓名，打开链接并签到。
- `admin.html`：管理端。粘贴链接，用英文分号 `;`、中文分号 `；` 或换行分隔，然后点击“发布到公共端”。最多生成 6 个链接窗口。

## 光学工具页

首页的“光学工具”区域已经接入以下 4 个独立页面：

- `optical_layout.html`：光学系统布局、像面扫描与视标卷积成像。
- `thin_lens_object_image_relation_v6.html`：薄透镜物象关系 V6。
- `preview.html`：薄透镜物象关系预览版。
- `optics_app.html`：几何光学交互系统，主题为薄透镜成像。

这些页面均为独立 HTML，不依赖本目录中的额外脚本或图片；薄透镜页面会尝试加载 Google Fonts，加载失败时仍可正常显示。放在本目录后即可通过 GitHub Pages 直接访问。原始文件名分别为 `optical_layout(3).html`、`thin_lens_object_image_relation_v6.html`、`preview.html` 和 `optics_app (1).html`；其中两个带括号的文件已改为更适合网页地址的名称。

## 使用方法

双击打开 `index.html` 可以预览页面，本机签到记录会保存在浏览器中；如果要启用跨设备同步，请把整个 `link-checkin` 文件夹部署到 HTTPS 静态网页空间（例如 GitHub Pages）。直接使用 `file://` 预览时，云端接口会受到浏览器来源限制，这是预期行为。

管理员打开 `admin.html` 发布链接；其他人打开 `index.html`，在页面上方填写一次姓名，然后点击“打开链接”查看内容，再点击对应的“确定签到”。截图上传为可选项，每个链接不再重复填写姓名。

生成后的链接列表和签到记录会保存在当前浏览器中，下次打开页面仍会保留。

## 重要边界

## 旧版 CloudBase 接口（当前网页不再使用）

网页代码已经预留 CloudBase HTTP 云函数接口。要让不同用户的签到记录进入管理员端，请按下面顺序配置：

1. 在云开发数据库中创建 `link_configs`、`link_events` 和 `checkins` 三个集合。
2. 将本项目更新后的 `cloudfunctions/trackEvent` 上传并部署，并为它开启 HTTP 访问/HTTP 触发器。
3. 在该云函数的环境变量中配置：
   - `ADMIN_PASSWORD`：管理员端使用的密码；
   - `ALLOWED_ORIGIN`：`https://nedvision.cn`。
4. 复制云函数的 HTTP 访问地址，填写到 `link-checkin/cloud-config.js` 的 `apiUrl`：

```js
window.LINK_HUB_CONFIG = Object.freeze({
  envId: "nedlx-d9gnei91y81b6e12b",
  apiUrl: "粘贴云函数 HTTP 访问地址"
});
```

5. 在 CloudBase 的安全来源/安全域名中加入 `https://cdwlxk1.github.io`。
6. 把 `link-checkin` 目录中的 `cloud-config.js`、`index.html`、`app.js`、`admin.html`、`admin.js`、`styles.css` 上传到 GitHub 仓库根目录。

部署后，公共端是 `https://nedvision.cn/`，管理端是 `https://nedvision.cn/admin.html`。管理端输入 `ADMIN_PASSWORD` 后，可以发布链接并查看云端签到记录。

当前网页端用浏览器生成的 `visitorId` 识别一次访问设备，姓名来自用户填写，不等同于微信实名认证身份。如需网页端微信登录，还需要另外配置网页授权。

CloudBase 网页调用需要配置安全来源；相关说明见[网页 SDK 初始化](https://docs.cloudbase.net/en/authentication-v2/method/sdk-init)和[HTTP 云函数调用](https://docs.cloudbase.net/en/cloud-function/function-calls/)。

## 当前推荐：飞书版

网页端现在已经预留飞书 Worker 接口。请阅读 [FEISHU_SETUP.md](FEISHU_SETUP.md)，创建飞书应用和多维表格后，将 `feishu-worker.js` 部署到 Worker，并在 `cloud-config.js` 中填写 Worker 地址。

飞书 App Secret 只能配置在 Worker 的服务端环境变量中，不能上传到 GitHub。部署完成后，管理员页面发布的链接和用户签到记录会保存到飞书多维表格；用户选择上传截图时，截图会写入 `checkins` 表的“截图”附件字段。
