---
title: "我的服务器上都搭建了什么？项目、域名与用途汇总"
published: 2026-07-21T05:16:47.847661968Z
updated: 2026-07-21T05:55:01.867855018Z
draft: false
description: "按项目名称、域名和用途，汇总服务器上的博客、文件服务、在线工具与监控项目。"
image: "https://wuw.li/r2-assets/tu/2026-07-21T13-vwvxz.webp"
category: ["测试"]
tags: []
pinned: false
haloName: "post-b9kfbqkt"
allowComment: true
---
这台服务器目前承载了博客、文件管理、在线工具和监控告警等多类公开服务。下面按照 **项目名称 → 域名 → 用途** 的顺序进行汇总。

![服务器项目地图](https://wuw.li/r2-assets/tu/2026-07-21T13-vwvxz.webp)

## 面向用户的项目

### Halo 博客

- **域名：** [wuw.li](https://wuw.li)、[www.wuw.li](https://www.wuw.li)
- **用途：** 博客内容管理与公开站点，负责文章、页面、评论和附件管理。

### TG Vault

- **域名：** [blog.wuw.li](https://blog.wuw.li)
- **用途：** Telegram 文件转存与 Web 文件管理，支持归档、预览和下载。

### mimotion Web

- **域名：** [tz.wuw.li](https://tz.wuw.li)
- **用途：** 为 Zepp Life / 小米运动提供步数操作的 Web 界面。

### Moe Counter

- **域名：** [url.wuw.li](https://url.wuw.li)
- **用途：** 提供多主题访问计数器和可嵌入网页的计数徽章。

### OpenList

- **域名：** [openlist.wuw.li](https://openlist.wuw.li)、[list.wuw.li](https://list.wuw.li)
- **用途：** 聚合网盘与文件目录，提供统一的文件浏览和访问入口。

### Bing 每日壁纸 API

- **域名：** [bing-img.wuw.li](https://bing-img.wuw.li)
- **用途：** 展示、跳转、下载 Bing 每日壁纸，并提供程序化 API。

### Cap-Pow

- **域名：** [cap-pow.wuw.li](https://cap-pow.wuw.li)
- **用途：** 提供 Proof-of-Work 挑战、兑换和验证能力，为公开服务增加轻量防滥用保护。

### Halo 静态站导出

- **域名：** [wuw.li](https://wuw.li)
- **用途：** 将 Halo 公共内容同步为 Cloudflare Workers 静态资源，提升访问速度与可用性。

## 监控与运维项目

### Cloudflare Usage Alert

- **域名：** [worker.wuw.li](https://worker.wuw.li)
- **用途：** 监控 Cloudflare Workers 请求与 CPU 用量，展示历史趋势并执行额度告警。

## 总结

这些公开项目覆盖了内容发布、文件归档、在线工具和状态监控。按项目独立划分域名后，每项服务的入口与用途都更直观，也便于后续继续拆分和维护。

> 本文只记录公开项目及其用途，不包含服务器地址、内部端口、密钥或其他敏感配置。

