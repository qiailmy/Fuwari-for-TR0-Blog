---
title: "把 Halo 博客部署到 Cloudflare Workers：更快、更稳，也更安全"
published: 2026-07-20T19:37:46.478257918Z
updated: 2026-07-21T01:38:53.459095317Z
draft: false
description: "保留 Halo 作为内容后台，把公开页面静态化到 Cloudflare Workers，并使用 R2 管理图片：从架构、导出、部署到评论点赞安全代理的完整实践。"
image: "https://wuw.li/r2-assets/tu/2026-07-21T09-e3kur.webp"
cardImage: "/post-thumbnails/halo-cloudflare-workers-static-deployment-guide.webp"
category: ["测试"]
tags: []
pinned: false
haloName: "post-evmyodzs"
allowComment: true
---
# 把 Halo 博客部署到 Cloudflare Workers：更快、更稳，也更安全

如果博客已经使用 Halo，为什么还要在前面增加 Cloudflare Workers？

答案不是为了替代 Halo。Halo 仍然是最舒服的写作与内容管理后台；Workers 负责把已经发布的页面变成离访客更近的静态内容。这样既保留 Halo 的编辑体验，又获得边缘网络的速度和稳定性。

![Halo 到 Cloudflare Workers 的访问链路](https://wuw.li/r2-assets/tu/2026-07-21T09-e3kur.webp)

## 一、为什么这样做

### 1. 全球访问更快

普通部署中，每位访客都要连接 Halo 源站。距离远、服务器带宽小或并发较高时，首屏会明显变慢。

静态化以后，HTML、CSS、JavaScript 等文件由 Cloudflare 边缘节点直接返回。多数访问不必再穿透到 Halo，网络路径更短，响应也更稳定。

### 2. 减轻 Halo 源站压力

Halo 需要运行 Java、数据库、主题和插件。即使访客只是阅读文章，动态渲染也会消耗连接与计算资源。

把公开页面导出成静态文件后，源站主要负责：

- 后台写作和管理；
- 生成新的公开内容；
- 评论、点赞等确实需要写入的动作；
- 为下次静态导出提供数据。

这很适合配置不高的 VPS，也能减少突发流量对后台的影响。

### 3. 源站故障时更有韧性

只要最近一次静态版本已经成功部署，即使 Halo 短时重启或维护，访客仍能浏览已发布的页面。动态功能可能暂时不可用，但文章本身不会跟着消失。

### 4. 缩小攻击面

不要把 Workers 做成“任意路径都能转发”的开放代理。公开页面静态化之后，动态代理只放行必须的路径，再叠加文章白名单、Origin 校验、请求格式检查和 IP 限流，可以显著减少源站暴露面。

![静态访问层与受控动态通道](https://wuw.li/r2-assets/tu/2026-07-21T09-2vrjb.webp)

## 二、整体架构

一个实用的分工是：

```text
访客
  ├─ HTML / CSS / JS / 普通图片 → Cloudflare Workers Static Assets
  └─ 评论 / 点赞 / 实时统计     → Worker 严格校验 → Halo API

管理员
  └─ 写作、编辑、发布           → Halo 后台

同步任务
  └─ 从 Halo 导出公开页面 → 检查 → wrangler deploy
```

图片可以继续由 Halo 附件系统管理，并把存储策略设为 Cloudflare R2。这样正文图片不需要塞进 Worker 包中，更新文章时也更自然。

## 三、准备工作

你需要：

1. 一套能正常访问的 Halo 站点；
2. Cloudflare 账号和一个 Worker；
3. Node.js 20 或更新版本；
4. Wrangler；
5. 一个用于存放静态导出结果的目录，例如 `dist/`。

初始化项目：

```bash
mkdir halo-workers-static
cd halo-workers-static
npm init -y
npm install -D wrangler
mkdir -p src scripts dist
```

登录 Cloudflare：

```bash
npx wrangler login
```

生产环境更建议使用最小权限 API Token，并放在受限环境变量或 CI Secret 中。不要把 Token、Halo 密码或 R2 密钥提交进 Git。

## 四、配置 Worker 静态资源

创建 `wrangler.jsonc`：

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "halo-static-blog",
  "main": "./src/index.js",
  "compatibility_date": "2026-07-20",
  "vars": {
    "ASSET_ORIGIN": "https://halo-origin.example.com"
  },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "404-page"
  }
}
```

最小 Worker 入口可以先这样写：

```js
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
```

这时 Workers 只负责读取 `dist/` 中的静态文件。后面如果需要评论和点赞，再增加明确的 API 路由，而不是把全部请求直接转发给 Halo。

## 五、从 Halo 导出静态页面

导出器通常要做五件事：

1. 从 Halo 获取首页、文章、分类、标签、分页等公开路由；
2. 下载页面依赖的同源 CSS、JavaScript 和主题资源；
3. 将页面写入对应目录，如 `/archives/demo/` 写成 `dist/archives/demo/index.html`；
4. 把指向源站的内部链接改成正式域名或相对路径；
5. 检查是否残留源站地址、动态模板标记、超大文件和 404 资源。

建议维护一份明确的公开路由清单，不要盲目遍历 Halo 的管理接口。静态导出完成后至少检查：

```bash
node --check src/index.js
node scripts/check.mjs
npx wrangler deploy --dry-run
```

只有三项都通过，再正式部署。

![四步部署流程](https://wuw.li/r2-assets/tu/2026-07-21T09-n7s2g.webp)

## 六、部署到 Cloudflare Workers

确认 `dist/` 内容正确后执行：

```bash
npx wrangler deploy
```

成功后会得到一个 `workers.dev` 地址。先检查：

- 首页、文章页、分类页是否返回 200；
- CSS、JavaScript 和图片是否加载；
- 手机端导航与深色模式是否正常；
- 页面中是否还出现 Halo 源站内部地址；
- 404 页面是否符合预期。

然后在 Cloudflare Dashboard 中给 Worker 添加自定义域名。切换正式域名前，可以先降低 DNS TTL，并准备随时回退到上一个 Worker 版本。

## 七、评论和点赞不能只靠静态文件

静态 HTML 中的评论数、点赞数只是导出时的快照。要获得实时数据，需要一个小型统计接口：

```text
GET /static-api/post-stats?name=<post-name>
```

Worker 收到请求后向 Halo 查询公开文章统计，只返回经过清洗的数字：

```json
{
  "upvote": 12,
  "comment": 3,
  "visit": 128
}
```

点赞和评论写入必须更严格：

- 只允许固定的 API 路径；
- 校验 `Origin`；
- 检查文章是否在“已发布且公开”的白名单内；
- 验证 `group`、`plural`、文章名称和请求体；
- 按客户端 IP 限流；
- 响应设置 `Cache-Control: no-store`。

### 关于取消点赞

Halo 2.25.4 的公开接口中，`POST /trackers/downvote` 表示增加“踩”，并不会直接减少已有的 upvote。若界面只在浏览器里 `-1`，刷新后就会恢复，这是“假取消”。

如果产品需要真正的切换式点赞，可以在 Worker 侧用 Durable Object 持久记录取消量，展示值按：

```text
展示点赞数 = Halo upvote − 已持久化取消量
```

同时仍把每次变更限制在公开文章、可信来源和速率限制之内。这样取消后的数字跨刷新仍一致。更长期、更标准的方案，是为 Halo 编写专门的取消点赞插件/API，让权威计数完全落在 Halo 内部。

## 八、图片为什么放在 Halo 的 Cloudflare R2 分类

本文图片就是先上传到 Halo 附件库，再选择 Cloudflare R2 存储策略和对应附件分组。这样有几个好处：

- 图片仍能在 Halo 后台统一搜索和管理；
- 正文只保存稳定的图片 URL；
- 图片不占 Worker 静态资源包大小；
- R2 适合存放大量对象，并可配合独立图片域名；
- 以后更换主题或重新导出，图片无需重复上传。

上传时建议同时设置：

- 合理的 WebP/AVIF 转换；
- 长缓存头；
- 不可猜测或避免冲突的文件名；
- 限制上传 MIME 和体积；
- 定期备份 R2 Bucket 配置与关键附件。

## 九、自动同步建议

稳定后可以把流程封装为：

```bash
set -euo pipefail
node scripts/export.mjs
node scripts/check.mjs
npx wrangler deploy
```

再由 CI 或定时任务调用。但自动化前必须保留三道保险：

1. 导出失败时不替换上一版 `dist/`；
2. 检查失败时禁止部署；
3. 保存上一次可用 Worker Version，便于快速回滚。

不要每次心跳都重新部署。只有 Halo 内容指纹发生变化时才同步，可以减少 Workers 请求和无意义上传。

## 十、这种方案适合谁

适合：

- 以公开文章阅读为主的个人博客；
- 希望保留 Halo 后台体验，但降低源站压力；
- 访问者分布较广；
- 能接受发布后经过一次导出才更新前台。

不太适合：

- 页面高度个性化、每个用户内容不同；
- 大量内容必须秒级实时更新；
- 依赖许多无法代理或静态化的插件；
- 没有能力维护导出检查与回滚流程。

## 总结

这套方案不是“把 Halo 搬进 Workers”，而是明确分层：

- Halo 负责创作、管理与权威内容；
- R2 负责图片等对象存储；
- Workers 负责全球静态分发；
- 少量受控 API 保留评论、点赞和实时统计；
- 导出检查、最小权限与回滚保证发布安全。

最终得到的是一个打开更快、源站更轻、故障时更有韧性，同时仍然方便写作的 Halo 博客。

