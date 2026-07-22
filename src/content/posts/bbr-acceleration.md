---
title: "BBR acceleration"
published: 2024-04-14T09:21:00Z
updated: 2024-05-01T14:25:40.984856776Z
draft: false
description: "开启BBR加速 以下 BBR 加速，自选一种： 1、系统自带 BBR 加速 bash echo \"net.core.default_qdisc=fq\" >> /etc/sysctl.conf echo \"net.ipv4.tcp_congestion_control=bbr\" >> /etc/sys"
image: "https://wuw.li/r2-assets/tu/2026-07-22T15-e21iq.webp"
category: []
tags: []
pinned: false
haloName: "22cf6912-334a-4505-b895-cd058eaa3302"
allowComment: true
---
<p style="">开启BBR加速<br>以下 BBR 加速，自选一种：</p><p style="text-align: justify; ; line-height: 2">1、系统自带 BBR 加速<br><strong>bash<br>echo "net.core.default_qdisc=fq" &gt;&gt; /etc/sysctl.conf<br>echo "net.ipv4.tcp_congestion_control=bbr" &gt;&gt; /etc/sysctl.conf<br>sysctl -p</strong><br>2、BBRplus 加速<br><strong>bash<br>wget -N --no-check-certificate "</strong><a href="https://raw.githubusercontent.com/chiakge/Linux-NetSpeed/master/tcp.sh"><strong><u>https://raw.githubusercontent.com/chiakge/Linux-NetSpeed/master/tcp.sh</u></strong></a><strong>" &amp;&amp; chmod +x tcp.sh &amp;&amp; ./tcp.sh</strong></p>
