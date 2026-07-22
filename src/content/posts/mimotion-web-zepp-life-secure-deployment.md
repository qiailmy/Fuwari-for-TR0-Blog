---
title: "Mimotion Web 化部署实战：给 Zepp Life 步数同步加上界面、HTTPS 与人机验证"
published: 2026-07-20T09:39:14.795799715Z
updated: 2026-07-21T01:43:04.402972235Z
draft: false
description: "导语 TonyJiangWJ/mimotion 是一个成熟、直接的 Zepp Life（原小米运动）步数同步工具。本文基于上游 commit a0f614e 做一次“外围 Web 化”：保留原项目的一键 Python 任务及其登录、提交步数逻辑，只增加网页表单、FastAPI 接口、访问频率限制、C"
image: "https://wuw.li/r2-assets/tu/2026-07-20T17-8yi3v.svg"
cardImage: "/post-thumbnails/mimotion-web-zepp-life-secure-deployment.webp"
category: ["测试"]
tags: []
pinned: false
haloName: "post-trjbo2bg"
allowComment: true
---
<figure data-content-type="image" data-release-marker="mimotion-web-guide-v1"><img src="https://wuw.li/r2-assets/tu/2026-07-20T17-8yi3v.svg" alt="Mimotion Web 化部署与安全加固教程封面"></figure>
<h2>导语</h2>
<p><code>TonyJiangWJ/mimotion</code> 是一个成熟、直接的 Zepp Life（原小米运动）步数同步工具。本文基于上游 commit <code>a0f614e</code> 做一次“外围 Web 化”：保留原项目的一键 Python 任务及其登录、提交步数逻辑，只增加网页表单、FastAPI 接口、访问频率限制、Cap-Pow 人机验证、容器约束和 OpenResty HTTPS 入口。</p>
<p>这条边界很重要。Web 服务复用 <code>MiMotionRunner.login_and_post_step</code>，不自行分析或重写 Zepp 协议。这样既能减少协议变更带来的维护成本，也避免把原本已经稳定的核心流程复制成另一套实现。最终用户只需在浏览器中输入账号、密码和目标步数，通过计算量证明后提交；服务端完成一次调用并立即丢弃敏感输入。</p>
<p>本文中的域名、端口外的地址、凭据和路径均为示例。请将 <code>steps.example.com</code>、<code>captcha.example.com</code> 等占位符替换为自己的配置，不要把真实凭据写入镜像、仓库或日志。</p>
<h2>架构与请求流程</h2>
<p>整体链路如下：</p>
<pre><code class="language-text">浏览器
  ├─ GET /                    静态页面
  ├─ POST /cap-api/challenge  OpenResty 同源代理到 Cap-Pow
  ├─ POST /cap-api/redeem     OpenResty 同源代理到 Cap-Pow
  └─ POST /api/steps
          │ 账号、密码、步数、一次性 token
          ▼
      FastAPI
          ├─ 每 IP 10 分钟最多 5 次
          ├─ 向 Cap-Pow 服务端消费 token
          ├─ 获取任务锁
          └─ MiMotionRunner.login_and_post_step
                    ▼
                 Zepp Life
</code></pre>
<p>前端与业务 API、Cap-Pow 都使用同一个 HTTPS 域名。浏览器不直接访问内部验证容器，因此没有跨域配置，也不会暴露内部服务地址。关键顺序是：<strong>先消费一次性 token，验证成功后才允许进入 Zepp 流程</strong>。token 被成功消费后不能重放，即使重复提交完全相同的表单也应返回 <code>403</code>。</p>
<p>FastAPI 仅提供两个业务端点：<code>GET /health</code> 用于探活，<code>POST /api/steps</code> 执行同步。应用只监听宿主机 <code>127.0.0.1:3210</code>，公网入口唯一由 OpenResty 的 HTTPS 虚拟主机提供。</p>
<h2>FastAPI 关键实现</h2>
<p>下面是经过删减的结构示例。导入路径应按上游源码布局调整，重点是直接调用现有 runner，而不是复制登录代码。</p>
<pre><code class="language-python">import asyncio
import os
from collections import defaultdict, deque
from time import monotonic

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from mimotion import MiMotionRunner  # 按项目实际模块路径调整

app = FastAPI(docs_url=None, redoc_url=None)
task_lock = asyncio.Lock()
visits: dict[str, deque[float]] = defaultdict(deque)


class StepRequest(BaseModel):
    account: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)
    steps: int = Field(ge=1000, le=98800)
    cap_token: str = Field(min_length=10, max_length=256)


@app.get(&quot;/health&quot;)
async def health():
    return {&quot;status&quot;: &quot;ok&quot;}


def check_rate_limit(ip: str) -&gt; None:
    now = monotonic()
    bucket = visits[ip]
    while bucket and now - bucket[0] &gt;= 600:
        bucket.popleft()
    if len(bucket) &gt;= 5:
        raise HTTPException(429, &quot;请求过于频繁，请稍后再试&quot;)
    bucket.append(now)


async def consume_pow(token: str) -&gt; None:
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
        response = await client.post(
            os.environ[&quot;CAP_POW_VALIDATE_URL&quot;],
            json={&quot;token&quot;: token},
        )
    if response.status_code != 200 or not response.json().get(&quot;success&quot;):
        raise HTTPException(403, &quot;人机验证无效或已使用&quot;)


def run_mimotion(data: StepRequest):
    runner = MiMotionRunner(data.account, data.password)
    # 使用上游现有入口；不要在 Web 层重写 Zepp 请求协议。
    return runner.login_and_post_step(data.steps)


@app.post(&quot;/api/steps&quot;)
async def post_steps(data: StepRequest, request: Request):
    remote_ip = request.client.host if request.client else &quot;unknown&quot;
    check_rate_limit(remote_ip)
    await consume_pow(data.cap_token)

    if task_lock.locked():
        raise HTTPException(409, &quot;已有同步任务正在执行&quot;)
    async with task_lock:
        try:
            result = await asyncio.to_thread(run_mimotion, data)
        except Exception:
            # 日志不得记录 account、password、cap_token 或上游响应中的敏感字段。
            raise HTTPException(502, &quot;同步失败，请检查账号信息或稍后重试&quot;)
    return {&quot;ok&quot;: True, &quot;message&quot;: str(result)}
</code></pre>
<p>上游内部使用 <code>requests</code> 时，应统一设置 <code>timeout=(5, 15)</code>，即连接超时 5 秒、读取超时 15 秒，避免工作线程无限挂起。任务锁限制同一进程一次只跑一个 Zepp 同步任务，既控制外部请求压力，也避免底层代码若使用共享状态时发生互相覆盖。若将来扩展为多进程或多副本，内存锁和内存限流都不再是全局的，需要迁移到 Redis 等共享存储；本文的 Compose 因此保持单实例、单 worker。</p>
<p>反向代理后，不能无条件相信客户端提交的 <code>X-Forwarded-For</code>。应由 OpenResty覆盖该请求头，FastAPI 再通过可信代理中间件取得真实 IP，否则攻击者可以伪造 IP 绕过“十分钟五次”。限流计数建议在进入 Cap-Pow 和 Zepp 前执行，以免无效请求消耗验证服务资源。</p>
<h2>前端交互</h2>
<p>页面使用原生 HTML、CSS、JavaScript 即可。桌面端采用两栏布局，左侧输入、右侧显示提交状态；移动端折为单栏。背景可使用低对比色，表单容器使用适度毛玻璃、圆角和清晰边框，但不能牺牲文本对比度。</p>
<p>步数由范围滑块与数字输入共同控制，范围固定为 <code>1000..98800</code>，两者双向同步：</p>
<pre><code class="language-html">&lt;label for=&quot;steps&quot;&gt;目标步数&lt;/label&gt;
&lt;input id=&quot;steps&quot; type=&quot;range&quot; min=&quot;1000&quot; max=&quot;98800&quot; step=&quot;100&quot; value=&quot;10000&quot;&gt;
&lt;input id=&quot;stepsNumber&quot; type=&quot;number&quot; min=&quot;1000&quot; max=&quot;98800&quot; step=&quot;100&quot; value=&quot;10000&quot;&gt;

&lt;script&gt;
const slider = document.querySelector(&#39;#steps&#39;);
const number = document.querySelector(&#39;#stepsNumber&#39;);

function clamp(value) {
  return Math.min(98800, Math.max(1000, Number(value) || 1000));
}
slider.addEventListener(&#39;input&#39;, () =&gt; { number.value = slider.value; });
number.addEventListener(&#39;input&#39;, () =&gt; { slider.value = clamp(number.value); });
number.addEventListener(&#39;change&#39;, () =&gt; {
  number.value = slider.value = clamp(number.value);
});
&lt;/script&gt;
</code></pre>
<p>提交时，JavaScript 先从同源 <code>/cap-api/challenge</code> 获取挑战，在浏览器完成 PoW，再向 <code>/cap-api/redeem</code> 换取一次性 token，最后通过 <code>cap_token</code> 字段把 token 与表单一起发往 <code>/api/steps</code>。</p>
<p>这里有一个容易遗漏的状态问题：<strong>Cap-Pow token 是一次性的，每次提交结束后都必须作废并重新获取挑战</strong>。不能只在 Zepp 同步成功时重置；密码错误、Zepp 接口报错、后端返回非 2xx、JSON 解析失败和网络异常，同样不能继续使用旧 token。把清理放进 <code>finally</code>，保证所有结果都执行：</p>
<pre><code class="language-javascript">const payload = {
  username: form.username.value.trim(),
  password: form.password.value,
  steps: Number(steps.value),
  cap_token: capToken,
};

try {
  const response = await fetch(&#39;/api/steps&#39;, {
    method: &#39;POST&#39;,
    headers: { &#39;Content-Type&#39;: &#39;application/json&#39; },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || &#39;同步失败，请稍后重试&#39;);
  form.password.value = &#39;&#39;;
} catch (error) {
  showError(error.message || &#39;网络异常，请稍后重试&#39;);
} finally {
  payload.password = &#39;&#39;;
  payload.cap_token = &#39;&#39;;
  capToken = &#39;&#39;;
  window.CapPow.reset();
  submitButton.disabled = false;
}
</code></pre>
<p>这样密码输入错误后，用户无需刷新整个网页：页面会立即回到待验证状态，Cap-Pow 组件自动加载一个新挑战，完成验证后即可再次提交。页面不要使用 <code>localStorage</code>、<code>sessionStorage</code>、IndexedDB 或自定义脚本保存账号密码；可为敏感字段设置合适的 <code>autocomplete</code> 策略。服务端同样不把账号密码写入配置、数据库、缓存或任务队列，它们只在当前请求和工作线程生命周期内存在。</p>
<h2>Cap-Pow 服务端校验</h2>
<p>浏览器完成 PoW 只证明它计算过挑战，真正的授权点仍在业务后端。不能仅靠前端把按钮设为可用，也不能只检查“token 非空”。本次使用的 Cap-Pow 实例提供服务端 <code>/validate</code> 接口：FastAPI 将 <code>{&quot;token&quot;: token}</code> 发送到该接口，并且只有 HTTP 请求成功且响应中的 <code>success</code> 严格等于 <code>true</code> 时才放行。</p>
<p>验证失败、过期或已消费都统一返回 <code>403</code>，且绝不能调用 <code>MiMotionRunner</code>。OpenResty 的 <code>/cap-api/challenge</code> 与 <code>/cap-api/redeem</code> 同源代理只服务于浏览器交互；业务后端则直接调用验证端点消费 token。当前实例的成功 token 只允许验证一次，重放会得到 <code>Token not found</code>。不同 Cap-Pow 版本的端点名称和请求字段可能不同，部署时应按实际版本调整，同时保留“后端消费一次性 token”这一不变原则。</p>
<h2>Docker Compose</h2>
<p>应用镜像应在 Dockerfile 中创建 UID/GID <code>10001:10001</code>，复制代码后切换为 <code>USER 10001:10001</code>。Compose 再收紧运行时权限：</p>
<pre><code class="language-yaml">services:
  mimotion-web:
    build: ./mimotion-web
    restart: unless-stopped
    user: &quot;10001:10001&quot;
    ports:
      - &quot;127.0.0.1:3210:8080&quot;
    environment:
      CAP_POW_VALIDATE_URL: &quot;https://captcha.example.com/validate&quot;
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=16m,mode=1777
</code></pre>
<p>如果验证服务地址由环境变量注入，不要把带鉴权信息的 URL 提交到仓库。镜像标签应固定到明确版本或 digest，避免一次重建悄悄引入不兼容变更。示例假设 Cap-Pow 已经独立部署，因此 Compose 只负责 Mimotion Web；若验证服务位于同一 Docker 网络，可以把验证 URL 换成内网地址。</p>
<h2>OpenResty HTTPS 配置</h2>
<p>下面展示核心 location。证书路径使用通用占位符；HTTP 站点应单独做 301 跳转到 HTTPS。</p>
<pre><code class="language-nginx">server {
    listen 443 ssl http2;
    server_name steps.example.com;

    ssl_certificate     /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;

    add_header Content-Security-Policy &quot;default-src &#39;self&#39;; script-src &#39;self&#39;; style-src &#39;self&#39;; connect-src &#39;self&#39;; img-src &#39;self&#39; data:; object-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;self&#39;; frame-ancestors &#39;none&#39;&quot; always;
    add_header Cache-Control &quot;no-store&quot; always;
    add_header Referrer-Policy &quot;no-referrer&quot; always;
    add_header X-Frame-Options &quot;DENY&quot; always;
    add_header X-Content-Type-Options &quot;nosniff&quot; always;

    location = /cap-api/challenge {
        limit_except POST { deny all; }
        proxy_pass https://captcha.example.com/challenge;
        proxy_set_header Host captcha.example.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location = /cap-api/redeem {
        limit_except POST { deny all; }
        proxy_pass https://captcha.example.com/redeem;
        proxy_set_header Host captcha.example.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 16k;
    }
}
</code></pre>
<p>若 JavaScript 和 CSS 写在 HTML 内联标签中，严格 CSP 会阻止执行。更简单的做法是把它们拆成同源静态文件；也可使用 nonce，但不要为了省事加入 <code>&#39;unsafe-inline&#39;</code>。<code>no-store</code> 防止包含操作结果的页面和 API 响应被缓存，<code>no-referrer</code> 减少来源信息外泄，<code>frame-ancestors &#39;none&#39;</code> 与 <code>X-Frame-Options: DENY</code> 共同拒绝页面被嵌入，降低点击劫持风险。</p>
<h2>在 1Panel 中纳管两个站点</h2>
<p>部署完成后，不要只把 Nginx 配置文件放进 <code>conf.d</code>。为了能在 1Panel 的“网站”页面查看和维护，需要让两个域名按真实运行方式登记：</p>
<table>
<thead>
<tr>
<th>域名</th>
<th>网站类型</th>
<th>实际后端</th>
<th>关键设置</th>
</tr>
</thead>
<tbody><tr>
<td><code>tz.wuw.li</code></td>
<td>反向代理</td>
<td><code>http://127.0.0.1:3210</code></td>
<td>HTTPS、HTTP 跳转/同时访问、绑定通配符证书</td>
</tr>
<tr>
<td><code>cap-pow.wuw.li</code></td>
<td>运行环境</td>
<td>PHP-FPM 运行环境</td>
<td>网站目录指向实际 PHP 文件，不能误设为反向代理</td>
</tr>
</tbody></table>
<p><code>tz.wuw.li</code> 只代理宿主机回环端口，因此容器仍保持 <code>127.0.0.1:3210:8080</code>，无需把 <code>3210</code> 暴露到公网。Cap-Pow 则由 OpenResty 直接把 PHP 请求交给 PHP-FPM，它没有另一个 HTTP 上游地址；把它改成“反向代理网站”会破坏现有服务。</p>
<h3>Cap-Pow 的目录报错</h3>
<p>如果面板提示：</p>
<pre><code class="language-text">stat /opt/1panel/www/sites/Cap-Pow/index: no such file or directory
</code></pre>
<p>说明 1Panel 中的网站别名与实际目录不一致。例如面板按别名 <code>Cap-Pow</code> 拼出目录，但真实文件位于：</p>
<pre><code class="language-text">/opt/1panel/www/sites/Cap-Pow.wuw.li/index
</code></pre>
<p>修复时应让 1Panel 网站别名、站点目录和现有配置保持一致，不要新建一个空目录掩盖问题，也不要把 PHP 站点改成反代。修改前备份 1Panel 数据库和站点配置，之后执行 OpenResty 配置测试；确认首页和 <code>/challenge</code> 都返回 <code>200</code> 后再进入面板管理。域名匹配不区分大小写，因此 <code>server_name</code> 中不要同时写 <code>cap-pow.wuw.li</code> 与 <code>Cap-Pow.wuw.li</code>，否则会产生重复域名警告。</p>
<p>对于已经运行、后来才补进 1Panel 的站点，还要特别谨慎：面板的“新建网站”通常会生成目录和 Nginx 配置，可能覆盖现有行为；面板的“删除网站”也可能连同目录和配置一起删除。应先备份并核对现有站点，再做纳管，完成后先只读查看配置、证书和日志，确认路径无误后再使用面板修改功能。</p>
<h2>安全边界</h2>
<p>这套方案降低了暴露面，但不等于“账号密码不可见”。服务端进程必须拿到明文密码才能调用上游登录函数，因此服务器管理员、被攻破的进程或恶意依赖仍可能接触凭据。正确表述是：凭据只在请求内使用，不由浏览器持久化，也不在服务端配置中持久化；它并不是端到端零知识方案。</p>
<p>同时应确保日志只记录请求 ID、结果类别、耗时和经过可信代理解析的 IP，禁止记录请求体、Authorization、PoW token、Cookie 及 Zepp 原始响应。错误信息面向用户保持概括，详细异常只写经过脱敏的服务端日志。PoW 用来提高批量滥用成本，不能替代限流、HTTPS、依赖更新和主机防护。内存限流在进程重启后会清空，也不适用于多副本，这些都是当前单机轻量部署的明确边界。</p>
<h2>验收清单</h2>
<p>上线前至少完成以下自动化或浏览器测试：</p>
<ul>
<li><code>GET /health</code> 返回 <code>200</code>，正文为稳定的健康状态对象。</li>
<li>不携带 token 调用 <code>POST /api/steps</code> 返回 <code>403</code>，且确认未进入 Zepp 调用路径。</li>
<li>真实浏览器能够获取挑战、完成 PoW、兑换 token，并通过后端校验。</li>
<li>同一个 token 第一次消费后再次提交返回 <code>403</code>，证明重放失败。</li>
<li>同步成功、密码错误、服务端错误和网络错误后，旧 token 均被清空，组件自动生成新挑战，不需要刷新网页。</li>
<li>同一 IP 在十分钟窗口内最多允许五次，超限返回 <code>429</code>。</li>
<li>并发提交时任务锁生效，第二个任务不会与第一个同时进入 runner。</li>
<li>桌面宽度下两栏完整显示，手机宽度下自动单栏，页面和控件均无横向溢出。</li>
<li>响应包含 CSP、<code>Cache-Control: no-store</code>、<code>Referrer-Policy: no-referrer</code> 和 frame denial 相关头。</li>
<li>容器以 <code>10001:10001</code> 运行，根文件系统只读、capabilities 全部移除，<code>no-new-privileges</code> 与 <code>/tmp</code> tmpfs 生效。</li>
<li>公网无法直连 <code>3210</code> 和 Cap-Pow 容器端口，只能通过 <code>https://steps.example.com</code> 访问。</li>
</ul>
<p>涉及真实 Zepp 账号的端到端验证应由凭据所有者在受控环境中完成，测试报告只记录成功或失败类别，不记录账号及响应详情。不要为了自动化测试而在仓库中放置所谓“测试账号”。</p>
<h2>常见问题</h2>
<p><strong>为什么提交后返回 403？</strong></p>
<p>优先检查 token 是否缺失、过期、用途不匹配或已经使用。再核对浏览器同源代理和后端内网校验是否连接到同一个 Cap-Pow 实例，以及代理后的客户端 IP 是否一致。不要把 403 改成“跳过验证”。</p>
<p><strong>为什么返回 409？</strong></p>
<p>当前有同步任务持有锁。等待其结束后重试即可。如果任务经常占用过久，应先确认上游所有 <code>requests</code> 调用均设置 <code>timeout=(5, 15)</code>，再排查网络质量，而不是移除锁。</p>
<p><strong>为什么页面脚本不执行？</strong></p>
<p>通常是 CSP 拦截了内联脚本或外部 CDN。将 JS/CSS 放到本站静态目录并通过 <code>&#39;self&#39;</code> 加载，浏览器控制台会给出具体拦截原因。</p>
<p><strong>为什么密码错误后不能再次验证？</strong></p>
<p>通常是前端只在成功分支调用了验证组件的 <code>reset()</code>。一次性 token 已经随第一次请求被消费，错误响应不会让它重新可用。应把密码与 token 清理、<code>capToken = &#39;&#39;</code> 和 <code>window.CapPow.reset()</code> 全部放进提交处理的 <code>finally</code>，保证成功、错误和网络异常都重新加载挑战。</p>
<p><strong>为什么获取到的 IP 都是 127.0.0.1？</strong></p>
<p>FastAPI 看到的是反向代理地址。配置可信代理解析，并确保只有 OpenResty 能连接应用端口；OpenResty 必须覆盖而不是追加客户端传来的转发头。</p>
<p><strong>可以部署多个 worker 吗？</strong></p>
<p>不能直接增加。进程内任务锁和限流桶彼此独立，多 worker 会突破并发与频率约束。需要横向扩展时，应先引入共享锁、集中限流和一致的一次性 token 存储。</p>
<h2>结语</h2>
<p>这次 Web 化没有改变 Mimotion 的核心职责：Zepp 登录和步数提交仍由上游 commit <code>a0f614e</code> 的 <code>MiMotionRunner.login_and_post_step</code> 完成。新增部分只负责把一次性 Python 任务包装成受约束的 Web 请求，并在进入核心逻辑前建立 HTTPS、PoW 消费、限流和任务锁。</p>
<p>真正值得保留的不是某一份界面样式，而是清楚的信任边界：浏览器不保存凭据，服务端不配置持久化凭据；Cap-Pow token 必须由后端一次性消费；业务容器不直接暴露公网，并以最小权限运行；错误、日志和缓存都不能成为敏感信息的旁路。沿着这些原则维护，即使以后替换前端样式或验证服务，Zepp 核心逻辑仍可保持小而稳定。</p>

