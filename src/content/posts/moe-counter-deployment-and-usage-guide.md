---
title: "Moe Counter 萌系访问计数器：从在线使用到 Docker 自建与 Halo 接入"
published: 2026-07-19T00:29:06.374779781Z
updated: 2026-07-19T00:29:06.327354055Z
draft: false
description: "想给博客加一个有辨识度的访问计数，又不想塞进一整套统计平台，Moe Counter 是一个很轻量的选择：每次请求一个固定名称的计数器，服务端把数字加一，再用指定主题拼成 SVG 返回。本文先以公开实例 https://url.wuw.li/ 演示用法，再按 journey-ad/Moe-Counte"
image: "https://wuw.li/r2-assets/tu/2026-07-19T08-bys1q.svg"
cardImage: "/post-thumbnails/moe-counter-deployment-and-usage-guide.webp"
category: ["测试"]
tags: []
pinned: false
haloName: "post-cuh2wdod"
allowComment: true
---
<figure data-content-type="image" data-release-marker="moe-counter-guide-v1"><img src="https://wuw.li/r2-assets/tu/2026-07-19T08-bys1q.svg" alt="Moe Counter 萌系访问计数器部署与使用教程封面"></figure>
<p>想给博客加一个有辨识度的访问计数，又不想塞进一整套统计平台，Moe Counter 是一个很轻量的选择：每次请求一个固定名称的计数器，服务端把数字加一，再用指定主题拼成 SVG 返回。本文先以公开实例 <code>https://url.wuw.li/</code> 演示用法，再按 <code>journey-ad/Moe-Counter</code> 官方 README、<code>.env.example</code> 与 <code>docker-compose.yml</code> 完成 SQLite 自建部署。</p>
<blockquote>
<p>本文只把 <code>https://url.wuw.li/</code> 当作可访问实例引用，不推断、也不声称了解它使用的镜像版本、数据库、反向代理或服务器内部配置。生产部署请以自己的环境和项目当前版本为准。</p>
</blockquote>
<h2>一、三分钟用起来</h2>
<p>Moe Counter 的核心地址格式是：</p>
<pre><code class="language-text">https://url.wuw.li/@计数器名称?theme=主题&amp;padding=7
</code></pre>
<p>例如为自己的 Halo 站点取一个稳定且唯一的名称：</p>
<pre><code class="language-markdown">![访问计数](https://url.wuw.li/@my-halo-home?theme=moebooru&amp;padding=7&amp;offset=0&amp;scale=1&amp;align=top&amp;pixelated=1&amp;darkmode=auto)
</code></pre>
<p>HTML 中可以这样写：</p>
<pre><code class="language-html">&lt;img
  src=&quot;https://url.wuw.li/@my-halo-home?theme=moebooru&amp;padding=7&amp;offset=0&amp;scale=1&amp;align=top&amp;pixelated=1&amp;darkmode=auto&quot;
  alt=&quot;本站访问计数&quot;
  loading=&quot;lazy&quot;
&gt;
</code></pre>
<p>把它放进 Halo 文章的 HTML/Markdown 内容块，或放到主题支持的页脚自定义区域即可。是否允许外链图片、是否清洗 <code>&lt;img&gt;</code> 标签，取决于主题和编辑器；发布后应到前台页面检查，而不是只看编辑器预览。</p>
<p>计数器名称决定数据归属。首页、文章页想分别计数，可使用不同名称，如 <code>my-site-home</code> 与 <code>post-docker-guide</code>。名称不要包含隐私信息，也不要临时随机生成，否则会不断创建新计数项。官方当前路由把名称限制为不超过 32 个字符，取短而稳定的字母、数字和连字符组合最省心。</p>
<p>如果只需要 JSON，可访问：</p>
<pre><code class="language-text">https://url.wuw.li/record/@my-halo-home
</code></pre>
<p>注意：这个记录接口本身也会调用计数逻辑，因此它不是“无副作用查询”；不要用监控程序高频轮询它来读取数值。</p>
<h2>二、参数逐项说明</h2>
<p>一个完整示例：</p>
<pre><code class="language-text">https://url.wuw.li/@my-halo-home?theme=normal-1&amp;padding=8&amp;offset=-2&amp;scale=0.8&amp;align=center&amp;pixelated=0&amp;darkmode=auto
</code></pre>
<h3><code>name</code>：计数器身份</h3>
<p><code>@</code> 后面的 <code>my-halo-home</code> 就是 <code>name</code>。同一实例中，同名请求共享一个计数；改名等于换了一只新计数器。它不是页面标题，也不是用于显示的标签。公开服务上的名称可能被其他人猜到并请求，因此计数只能视为展示值，不能当作严格唯一访客统计。</p>
<h3><code>theme</code>：数字素材主题</h3>
<p><code>theme</code> 决定 0—9 的图案。官方项目内置主题较多，例如 <code>moebooru</code>、<code>normal-1</code>、<code>minecraft</code>、<code>miku</code> 等；实际可用列表应以目标实例首页展示为准，因为部署版本和主题资源可能不同。官方还支持 <code>random</code>，每次随机选主题，但稳定展示和缓存场景更推荐固定主题。</p>
<h3><code>padding</code>：最少位数</h3>
<p>数值不足时左侧补零，例如真实值为 123、<code>padding=7</code> 时显示 <code>0000123</code>。当前官方代码接受整数 0—16，默认 7。它只改变显示位数，不会改变数据库中的数值。</p>
<h3><code>offset</code>：数字间距</h3>
<p>控制相邻数字图块的横向偏移，单位可理解为 SVG 布局像素；负值会让图块更紧甚至重叠，正值会拉开。当前官方代码范围为 -500—500，默认 0。主题尺寸差异很大，建议从 <code>-2</code>、<code>0</code>、<code>2</code> 小步试。</p>
<h3><code>scale</code>：整体缩放</h3>
<p>对每个数字图块按比例缩放，当前官方范围 0.1—2，默认 1。页脚空间有限时可尝试 <code>0.7</code> 或 <code>0.8</code>。如果仅靠 CSS 限宽，也应保留图片的自适应样式，避免移动端溢出：</p>
<pre><code class="language-css">.moe-counter { max-width: 100%; height: auto; }
</code></pre>
<h3><code>align</code>：不同高度图块的纵向对齐</h3>
<p>可选 <code>top</code>、<code>center</code>、<code>bottom</code>，默认 <code>top</code>。某些主题的各数字素材高度不完全一致，选择居中或底部对齐会更整齐。</p>
<h3><code>pixelated</code>：像素化渲染</h3>
<p><code>1</code> 开启，<code>0</code> 关闭，默认 <code>1</code>。开启时 SVG 会使用像素化图像渲染，复古像素主题放大后边缘更利落；插画或平滑素材可试 <code>0</code>。它不是图片压缩开关。</p>
<h3><code>darkmode</code>：暗色模式亮度</h3>
<p>可选 <code>0</code>、<code>1</code>、<code>auto</code>，默认 <code>auto</code>。<code>1</code> 会对 SVG 使用较暗的亮度滤镜，<code>0</code> 不启用，<code>auto</code> 会依据浏览器 <code>prefers-color-scheme: dark</code> 自动切换。若主题本身很暗，建议实际在 Halo 的浅色、深色主题下各看一次。</p>
<h2>三、为什么不要用 <code>num</code> 和 <code>prefix</code> 伪造真实计数</h2>
<p>官方把 <code>num</code>、<code>prefix</code> 放在“不常用选项”中。<code>num&gt;0</code> 时，服务端直接用这个数字生成图片，不读取、不递增该名称的真实计数；它适合主题预览或截图，不适合展示站点访问量。任何人都能把 URL 改成 <code>num=999999</code>，所以该值没有统计可信度。</p>
<p><code>prefix</code> 会把指定数字直接拼到计数结果前面。例如真实计数 123，前缀 9 可能显示为 9123；它同样只是渲染层装饰，不是数据库基数，也不代表历史访问。迁移旧统计时若需要准确继承基数，应通过受控的数据迁移处理 SQLite/MongoDB 数据，而不是长期依赖公开 URL 参数。展示真实计数时，建议完全省略 <code>num</code> 与 <code>prefix</code>。</p>
<h2>四、Docker + SQLite 自建</h2>
<p>官方 README 推荐预构建镜像 <code>ghcr.io/journey-ad/moe-counter:latest</code>，官方仓库的 compose 示例则使用 <code>build: .</code>。若想免去本机构建，可在独立目录创建如下 <code>compose.yaml</code>：</p>
<pre><code class="language-yaml">services:
  moe-counter:
    image: ghcr.io/journey-ad/moe-counter:latest
    restart: unless-stopped
    ports:
      - &quot;127.0.0.1:3000:3000&quot;
    volumes:
      - ./data:/app/data
    environment:
      APP_SITE: &quot;https://counter.example.com&quot;
      APP_PORT: &quot;3000&quot;
      DB_TYPE: &quot;sqlite&quot;
      DB_INTERVAL: &quot;60&quot;
      LOG_LEVEL: &quot;info&quot;
</code></pre>
<p>这里把端口只绑定到回环地址，让公网统一经过 Nginx。<code>./data:/app/data</code> 是关键：SQLite 数据位于容器的 <code>/app/data</code>，不挂载就会在重建容器后丢失。然后启动并检查：</p>
<pre><code class="language-bash">mkdir -p moe-counter/data
cd moe-counter
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:3000/heart-beat
</code></pre>
<p><code>.env.example</code> 中的配置含义如下：<code>APP_SITE</code> 指定首页生成链接所用的网站 URL；<code>APP_PORT</code> 默认 3000；<code>DB_TYPE</code> 可选 <code>sqlite</code> 或 <code>mongodb</code>；MongoDB 才需要 <code>DB_URL</code>；<code>DB_INTERVAL</code> 是数据库写入间隔秒数，0 表示实时写入；<code>LOG_LEVEL</code> 可用 <code>debug/info/warn/error/none</code>；<code>GA_ID</code> 是可选的 Google Analytics G-Tag。低写入延迟和更少磁盘写入之间需要取舍：默认示例为 60 秒，这意味着异常掉电前尚未落盘的内存增量可能丢失；特别重视每一次计数时可设 0，但磁盘写入会更多。</p>
<p>升级前先看发行说明并备份，再拉取镜像：</p>
<pre><code class="language-bash">docker compose pull
docker compose up -d
curl -fsS http://127.0.0.1:3000/heart-beat
</code></pre>
<p>不要在未备份时直接删除 <code>data</code> 目录。</p>
<h2>五、Nginx 与 HTTPS</h2>
<p>先让域名解析到服务器并准备好证书，再加入站点配置：</p>
<pre><code class="language-nginx">server {
    listen 80;
    server_name counter.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name counter.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
</code></pre>
<p>检查并平滑重载：</p>
<pre><code class="language-bash">sudo nginx -t &amp;&amp; sudo systemctl reload nginx
curl -I https://counter.example.com/heart-beat
</code></pre>
<p>证书路径应替换为本机真实路径。若使用 CDN，还需确认回源 HTTPS、真实 IP 头及缓存规则；不要盲信客户端可伪造的 <code>X-Forwarded-For</code>。</p>
<h2>六、备份、缓存与防滥用</h2>
<p>备份目标是整个持久化 <code>data</code> 目录。最稳妥的方法是在低流量时短暂停止容器后归档，避免复制到一半遇到 SQLite 写入：</p>
<pre><code class="language-bash">docker compose stop
tar -C . -czf &quot;moe-counter-data-$(date +%F).tar.gz&quot; data
docker compose start
</code></pre>
<p>备份应再复制到另一台机器或对象存储，并定期做恢复演练。只“生成了压缩包”不等于备份有效。</p>
<p>官方计数 SVG 响应明确设置为不缓存；<code>demo</code> 名称例外，会长期缓存。若 CDN 或 Nginx 强行缓存普通 <code>@name</code> 响应，请求可能不再到达应用，计数也就不会增长。反过来，完全不缓存意味着图片每次加载都会触发计数：爬虫、预加载、刷新、RSS 阅读器都可能增加数值，所以它不是 UV/PV 分析系统。</p>
<p>公开实例很容易被刷。可在 Nginx/CDN 按 IP 做合理限速、限制异常 User-Agent/来源、启用连接数限制，并监控请求率、日志和磁盘。限速阈值不要过低，否则共享出口、校园网或 CDN 回源会误伤。名称并非密钥，不能靠“难猜”保护；如果数字必须具备业务可信度，应使用带服务端鉴权和去重逻辑的统计系统。</p>
<h2>七、故障排查清单</h2>
<ol>
<li><strong>页面打不开</strong>：先在主机执行 <code>curl http://127.0.0.1:3000/heart-beat</code>。失败就看 <code>docker compose ps</code> 与 <code>docker compose logs --tail=200 moe-counter</code>；本机正常再查 Nginx、证书、DNS、防火墙。</li>
<li><strong>返回 400 或参数无效</strong>：检查范围和枚举值，尤其是 <code>align</code>、<code>pixelated</code>、<code>darkmode</code>；删除所有参数后从最短 URL 逐个加回。</li>
<li><strong>主题不显示</strong>：主题名可能拼错或目标实例版本不含该主题，以实例首页列表为准。</li>
<li><strong>重启后归零</strong>：检查 <code>./data:/app/data</code> 是否实际挂载、目录权限是否允许容器写入，以及是否在错误工作目录启动了另一份 compose。</li>
<li><strong>数值偶尔回退</strong>：检查 <code>DB_INTERVAL</code>、异常重启和磁盘错误。非零间隔会缓存增量，未正常落盘前宕机可能丢失一小段计数。</li>
<li><strong>计数不增长</strong>：排查浏览器、Halo、Nginx 和 CDN 缓存；用不同查询参数测试只能辅助定位，别把随机参数长期加到生产页面制造无意义请求。</li>
<li><strong>计数暴涨</strong>：查看代理访问日志，识别爬虫或集中来源，逐步加入限速；不要直接修改显示参数掩盖问题。</li>
<li><strong>Halo 后台可见、前台不见</strong>：检查文章是否真正发布、主题是否过滤外链图片、浏览器控制台是否有 CSP/混合内容错误。Halo 站点为 HTTPS 时，计数器也必须使用 HTTPS。</li>
</ol>
<h2>八、Halo 中的放置与上线验收</h2>
<p>计数器放在哪里，决定它统计的究竟是什么。放在全站页脚时，只要主题渲染页脚，请求就可能发生，因此首页、文章、归档页的浏览都会汇入同一个名称；放在某篇文章正文里，则更接近该文章图片被加载的次数。单页应用主题在路由切换时可能复用页脚，不一定每次切页都重新请求图片。浏览器懒加载也可能让屏幕外的计数器暂不加载。因此上线前先定义口径，不要事后把它解释成精确“访客数”。</p>
<p>建议为生产和测试分开命名，例如 <code>site-home</code> 与 <code>site-home-test</code>。调样式时用测试名，避免自己刷新预览把正式数字推高；确认主题、尺寸和暗色效果后，再把最终 URL 放到生产位置。为了无障碍体验，给图片写清晰的 <code>alt</code>，并避免在标题或正文首屏放置过宽的数字串。计数器失效不应阻断正文阅读，所以不要写依赖其返回结果才能渲染页面的 JavaScript。</p>
<p>上线验收可以按固定顺序执行：先直接打开 SVG 地址，确认响应类型和图像；再以匿名窗口访问 Halo 前台，确认没有混合内容、CSP 或防盗链错误；随后查看手机宽度和深色模式；最后重启一次容器，重新访问并确认数值没有归零。还应记录所用镜像标签、compose 文件、域名和数据目录，方便后续维护。若使用 <code>latest</code>，每次升级前记录镜像摘要；更强调可重复部署时，固定到经过验证的版本标签或摘要，并主动跟踪官方安全更新。</p>
<p>完成部署后，至少做三项验收：心跳返回 <code>alive</code>；普通 <code>@name</code> 返回 <code>image/svg+xml</code>；连续访问时数字增长且容器重启后仍能延续。做到这一步，才算从“图片能打开”走到了“计数服务可维护”。</p>

