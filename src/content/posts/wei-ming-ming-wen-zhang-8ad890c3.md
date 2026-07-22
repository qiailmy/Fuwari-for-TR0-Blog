---
title: "伪静态"
published: 2024-05-17T14:40:00Z
updated: 2024-05-27T01:07:29.872453877Z
draft: false
description: "location ^~ /ailm { # 服务器文本 proxy_pass http://127.0.0.1:7777/ailm; proxy_s"
image: ""
cardImage: ""
category: []
tags: []
pinned: false
haloName: "8ad890c3-99e3-4941-b363-160b7048fd77"
allowComment: true
---
<p style="">location ^~ <strong>/<span fontsize="" color="rgb(220, 38, 38)" style="color: rgb(220, 38, 38)">ailm</span></strong> {                 <strong> <span fontsize="" color="rgb(22, 163, 74)" style="color: rgb(22, 163, 74)"># </span><span style="font-size: 12px; color: rgb(22, 163, 74)">服务器文本</span></strong></p><p style="">    proxy_pass http://127.0.0.1:7777<strong><span fontsize="" color="rgb(239, 68, 68)" style="color: rgb(239, 68, 68)">/ailm;</span></strong></p><p style="">    proxy_set_header Host $host;</p><p style="">    proxy_set_header X-Real-IP $remote_addr;</p><p style="">    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;</p><p style="">}</p><p style="">location <span fontsize="" color="rgb(220, 38, 38)" style="color: rgb(220, 38, 38)">/</span><strong><span fontsize="" color="rgb(220, 38, 38)" style="color: rgb(220, 38, 38)">ray</span></strong><span fontsize="" color="rgb(220, 38, 38)" style="color: rgb(220, 38, 38)"> </span>{               <strong><span fontsize="" color="rgb(37, 99, 235)" style="color: rgb(37, 99, 235)">  </span><span fontsize="" color="rgb(22, 163, 74)" style="color: rgb(22, 163, 74)">  # </span><span style="font-size: 12px; color: rgb(22, 163, 74)">ws传输</span></strong></p><p style="">        proxy_redirect off;</p><p style="">        proxy_pass http://127.0.0.1:<strong><span fontsize="" color="rgb(220, 38, 38)" style="color: rgb(220, 38, 38)">45612</span></strong>; <span fontsize="" color="rgb(22, 163, 74)" style="color: rgb(22, 163, 74)"> </span><strong><span fontsize="" color="rgb(22, 163, 74)" style="color: rgb(22, 163, 74)">#端口</span></strong></p><p style="">        proxy_http_version 1.1;</p><p style="">        proxy_set_header Upgrade $http_upgrade;</p><p style="">        proxy_set_header Connection "upgrade";</p><p style="">        proxy_set_header Host $http_host;</p><p style="">        proxy_read_timeout 300s;</p><p style="">        # Show realip in v2ray access.log</p><p style="">        proxy_set_header X-Real-IP $remote_addr;</p><p style="">        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;</p><p style="">  }</p>
