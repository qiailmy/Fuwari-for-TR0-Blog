---
title: "Cap-Pow 部署与使用教程：给网站接入无图片 PoW 人机验证"
published: 2026-07-19T00:13:58.082824553Z
updated: 2026-07-19T00:13:47.816316837Z
draft: false
description: "本文重点使用已经上线的实例 https://cap-pow.wuw.li/。需要先说明：这个实例采用的是 onexru/cap-pow-php-server 的接口形态并配有定制前端脚本；它与当前 Cap 官方 Standalone（Docker + Valkey + 站点密钥）不是同一套部署和调用"
image: "https://wuw.li/r2-assets/tu/2026-07-19T07-4ep69.svg"
category: ["测试"]
tags: []
pinned: false
haloName: "post-1rud2a6v"
allowComment: true
---
<figure data-content-type="image"><img src="https://wuw.li/r2-assets/tu/2026-07-19T07-4ep69.svg" alt="Cap-Pow 工作量证明人机验证教程封面"></figure>
<blockquote>
<p>本文重点使用已经上线的实例 <code>https://cap-pow.wuw.li/</code>。需要先说明：这个实例采用的是 <code>onexru/cap-pow-php-server</code> 的接口形态并配有定制前端脚本；它与当前 Cap 官方 Standalone（Docker + Valkey + 站点密钥）不是同一套部署和调用方式，不能把两套示例直接混用。</p>
</blockquote>
<p>传统验证码经常要求选图片、拖动滑块，既打断操作，也可能引入第三方跟踪。Cap/Cap-Pow 的思路是让浏览器完成一小段工作量证明（Proof of Work，PoW）：服务端生成挑战，浏览器计算答案，服务端核验后签发一次性 token，业务后端再消费这个 token。</p>
<p>本文分为三部分：</p>
<ol>
<li>直接使用已经部署好的 <code>cap-pow.wuw.li</code>；</li>
<li>自建与该实例相同接口的 PHP 服务；</li>
<li>了解当前官方 Cap Standalone 的 Docker 方案及其差异。</li>
</ol>
<hr>
<h2>一、先理解完整验证链路</h2>
<p>以现有实例为例，流程不是“前端显示一个绿色勾就算通过”，而是：</p>
<ol>
<li>浏览器向 <code>POST /challenge</code> 获取挑战；</li>
<li>浏览器计算 SHA-256 PoW；</li>
<li>浏览器将挑战 token 和答案提交到 <code>POST /redeem</code>；</li>
<li>服务端返回验证 token；</li>
<li>页面把验证 token 与表单数据一起交给业务后端；</li>
<li>业务后端调用 <code>POST /api/validate</code>；</li>
<li>只有响应中的 <code>success</code> 为 <code>true</code>，业务后端才继续处理登录、注册、留言或表单提交。</li>
</ol>
<p><code>cap-pow.wuw.li</code> 首页列出的三个接口正是 <code>/challenge</code>、<code>/redeem</code> 和 <code>/api/validate</code>。实际页面脚本也实现了上述流程。</p>
<p><strong>安全边界一定要记住：前端回调只能拿到 token，真正决定“放行”的步骤必须在业务后端。</strong> 如果只在 JavaScript 中判断，攻击者可以绕开页面直接请求业务接口。</p>
<hr>
<h2>二、直接使用已部署实例</h2>
<h3>1. 引入现有实例的脚本和样式</h3>
<p>页面提供了可跨域加载的 JS 与 CSS：</p>
<pre><code class="language-html">&lt;link rel=&quot;stylesheet&quot; href=&quot;https://cap-pow.wuw.li/cap-pow.css&quot;&gt;
&lt;script src=&quot;https://cap-pow.wuw.li/cap-pow.js&quot;&gt;&lt;/script&gt;
</code></pre>
<p>当前脚本为零依赖实现，内部固定使用 <code>https://cap-pow.wuw.li</code> 作为 API 地址；计算依赖浏览器的 <code>TextEncoder</code>、<code>crypto.subtle.digest()</code> 和 <code>fetch()</code>。</p>
<p>为了避免只复制首页中带省略号的演示代码，可使用下面这份与现有 CSS/JS 类名匹配的完整组件：</p>
<pre><code class="language-html">&lt;div class=&quot;cap-wrap&quot;&gt;
  &lt;div class=&quot;captcha&quot;&gt;
    &lt;div
      class=&quot;cap-ct&quot;
      id=&quot;cap-ct&quot;
      role=&quot;button&quot;
      tabindex=&quot;0&quot;
      aria-label=&quot;点击进行人机验证&quot;
      onclick=&quot;CapPow.go()&quot;
    &gt;
      &lt;div class=&quot;cap-cb&quot;&gt;
        &lt;div class=&quot;cap-check&quot;&gt;
          &lt;svg viewBox=&quot;0 0 24 24&quot; aria-hidden=&quot;true&quot;&gt;
            &lt;polyline points=&quot;4,12 9,17 20,6&quot;&gt;&lt;/polyline&gt;
          &lt;/svg&gt;
        &lt;/div&gt;
        &lt;svg class=&quot;cap-ring&quot; viewBox=&quot;0 0 32 32&quot; aria-hidden=&quot;true&quot;&gt;
          &lt;circle class=&quot;cap-ring-bg&quot; cx=&quot;16&quot; cy=&quot;16&quot; r=&quot;14&quot;&gt;&lt;/circle&gt;
          &lt;circle class=&quot;cap-ring-fg&quot; cx=&quot;16&quot; cy=&quot;16&quot; r=&quot;14&quot;&gt;&lt;/circle&gt;
        &lt;/svg&gt;
      &lt;/div&gt;
      &lt;div class=&quot;cap-lw&quot;&gt;
        &lt;span class=&quot;cap-label active&quot;&gt;验证你是人类&lt;/span&gt;
      &lt;/div&gt;
    &lt;/div&gt;
    &lt;a class=&quot;cap-credits&quot; href=&quot;https://github.com/tiagozip/cap&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;&gt;Cap&lt;/a&gt;
  &lt;/div&gt;
&lt;/div&gt;
</code></pre>
<p>脚本会给可点击元素补充 Enter/空格键支持。成功状态约 30 秒后复位；失败状态约 4 秒后复位。这只是组件显示状态的时间，不等于后端 token 的有效期。</p>
<h3>2. 接收 token</h3>
<p>推荐在表单里准备一个隐藏字段，并通过回调写入：</p>
<pre><code class="language-html">&lt;form id=&quot;protected-form&quot; method=&quot;post&quot; action=&quot;/your-submit-endpoint&quot;&gt;
  &lt;!-- 你的其他字段 --&gt;
  &lt;input type=&quot;hidden&quot; name=&quot;cap_token&quot; id=&quot;cap-token&quot;&gt;

  &lt;!-- 把上一节的 Cap-Pow 组件放在这里 --&gt;

  &lt;button type=&quot;submit&quot;&gt;提交&lt;/button&gt;
&lt;/form&gt;

&lt;script&gt;
  CapPow.onDone = function (token) {
    document.getElementById(&#39;cap-token&#39;).value = token;
  };

  CapPow.onFail = function (message) {
    document.getElementById(&#39;cap-token&#39;).value = &#39;&#39;;
    console.warn(&#39;Cap-Pow 验证失败：&#39;, message);
  };
&lt;/script&gt;
</code></pre>
<p>也可以监听脚本发出的 <code>cap-solve</code> 自定义事件：</p>
<pre><code class="language-js">document.getElementById(&#39;cap-ct&#39;).addEventListener(&#39;cap-solve&#39;, function (event) {
  console.log(event.detail.token);
});
</code></pre>
<p>注意：当前 <code>CapPow.onDone</code> 和 <code>CapPow.onFail</code> 是全局单一回调。如果同一页放多个受保护表单，需要自行按元素管理状态，不能假设每个组件都拥有独立回调。</p>
<h3>3. 在业务后端消费 token</h3>
<p>现有实例首页给出了 PHP 核验思路。下面增加了超时、网络失败和 JSON 格式检查：</p>
<pre><code class="language-php">&lt;?php
$capToken = $_POST[&#39;cap_token&#39;] ?? &#39;&#39;;
if ($capToken === &#39;&#39;) {
    http_response_code(400);
    exit(&#39;请先完成人机验证&#39;);
}

$ch = curl_init(&#39;https://cap-pow.wuw.li/api/validate&#39;);
curl_setopt_array($ch, [
    CURLOPT_POST =&gt; true,
    CURLOPT_RETURNTRANSFER =&gt; true,
    CURLOPT_HTTPHEADER =&gt; [&#39;Content-Type: application/json&#39;],
    CURLOPT_POSTFIELDS =&gt; json_encode([&#39;token&#39; =&gt; $capToken]),
    CURLOPT_CONNECTTIMEOUT =&gt; 3,
    CURLOPT_TIMEOUT =&gt; 8,
]);

$raw = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$error = curl_error($ch);
curl_close($ch);

$result = is_string($raw) ? json_decode($raw, true) : null;
if ($error !== &#39;&#39; || $status !== 200 || !is_array($result) || ($result[&#39;success&#39;] ?? false) !== true) {
    http_response_code(403);
    exit(&#39;人机验证失败或已过期，请重试&#39;);
}

// 只有到这里，才继续执行真正的登录、注册、留言或提交逻辑。
</code></pre>
<p>核验时应采用 <strong>fail closed</strong>：验证服务超时、返回非 200、JSON 无法解析或 <code>success</code> 不为 <code>true</code> 时一律拒绝，而不是跳过验证码。</p>
<p>仓库源码显示，PHP 版本的验证 token 默认有效期为 20 分钟，并在成功验证后立即删除。因此 token 是一次性的：重复提交、浏览器后退后再次提交、前端重试复用旧 token 都会失败。本文实测现有实例也符合这一行为：第一次核验成功，第二次使用同一 token 返回失败。</p>
<h3>4. 接口调试</h3>
<p>只测试挑战获取可执行：</p>
<pre><code class="language-bash">curl -sS &#39;https://cap-pow.wuw.li/challenge&#39; \
  -X POST \
  -H &#39;Content-Type: application/json&#39; \
  -d &#39;{}&#39;
</code></pre>
<p>返回结构类似：</p>
<pre><code class="language-json">{
  &quot;challenge&quot;: { &quot;c&quot;: 8, &quot;s&quot;: 64, &quot;d&quot;: 3 },
  &quot;token&quot;: &quot;……&quot;,
  &quot;expires&quot;: 1784419034000
}
</code></pre>
<p>这里的数值是核实时现有实例返回的配置，不应当视为项目永久默认值。上游 PHP 仓库默认值是 <code>c=64</code>、<code>s=128</code>、<code>d=4</code>，部署者可以修改。</p>
<p>不要用假的 token 判断整个流程是否可用；完整成功路径必须先完成 challenge 与 redeem，最后再 validate。</p>
<hr>
<h2>三、在 Halo 中怎么用</h2>
<h3>场景 A：把组件放进 Halo 文章做演示</h3>
<p>如果只是写一篇演示文章，可以把组件 HTML 放入支持原始 HTML 的内容位置，并确保页面最终加载 CSS 与 JS。具体脚本放置方式取决于正在使用的 Halo 编辑器、主题及其安全策略，应以页面最终源码和浏览器控制台为准。</p>
<p>但这只是一段演示 UI，<strong>不会自动保护 Halo 的评论、登录、注册或插件表单</strong>。</p>
<h3>场景 B：真正保护 Halo 表单</h3>
<p>要保护 Halo 中的某个操作，至少要同时完成两端改造：</p>
<ul>
<li>前端：在对应主题模板或插件 UI 中渲染组件，把 token 随请求提交；</li>
<li>服务端：在执行真实业务之前调用 <code>/api/validate</code>，验证失败就拒绝请求。</li>
</ul>
<p>只编辑文章内容无法给 Halo 服务端新增 token 核验逻辑。评论、登录或注册等核心流程应通过合适的 Halo 插件/扩展点实现；不要仅靠隐藏提交按钮或前端 JavaScript。</p>
<p>如果你修改主题，应避免直接改已安装主题的成品文件后长期运行，因为主题更新可能覆盖改动。更稳妥的做法是维护自己的主题派生版本，或把功能封装成插件。</p>
<h3>场景 C：Halo 只是发布这篇教程</h3>
<p>Halo 控制台支持“保存但不发布”和未发布预览。因此本文可先作为草稿导入/粘贴，完成代码块、主题样式和移动端预览检查后再决定是否发布。</p>
<hr>
<h2>四、自建与现有实例同源的 PHP 版本</h2>
<p>对应仓库为：</p>
<pre><code class="language-text">https://github.com/onexru/cap-pow-php-server
</code></pre>
<h3>1. 已核实的环境要求</h3>
<p>仓库 README 明确列出：</p>
<ul>
<li>推荐 Nginx；</li>
<li>推荐 PHP 8.0+；</li>
<li>使用 SQLite。</li>
</ul>
<p>源码还表明运行环境需要：</p>
<ul>
<li>PHP 的 PDO SQLite 驱动；</li>
<li>Web/PHP 运行用户对数据库目录具有写权限；</li>
<li><code>random_bytes()</code>、SHA-256 等 PHP 标准能力。</li>
</ul>
<p>仓库只有 <code>cap.php</code>、<code>challenge.php</code>、<code>redeem.php</code>、<code>validate.php</code>、演示首页等文件，<strong>没有官方 Dockerfile 或 docker-compose 文件</strong>。因此不要把互联网上未经核对的 PHP 镜像编排当作该仓库的官方 Docker 安装方式。</p>
<h3>2. 安装步骤</h3>
<p>下载源码后，将文件部署到站点目录。仓库提供的 Nginx 规则为：</p>
<pre><code class="language-nginx">location / {
    try_files $uri $uri/ $uri.php?$query_string;
    if ($request_filename ~* .*\.php$) {
        return 403;
    }
}
</code></pre>
<p>这条规则的目的，是把 <code>/challenge</code> 映射到 <code>challenge.php</code>，同时阻止用户直接访问以 <code>.php</code> 结尾的 URL。它需要合并进你现有站点配置，不能不看上下文就覆盖完整的 Nginx <code>server</code> 块；PHP-FPM 的实际转发配置仍应沿用服务器现有、已经可用的配置。</p>
<p>默认数据库路径在 <code>cap.php</code> 中为：</p>
<pre><code class="language-php">private $db_Driver = &#39;.data/cap.db&#39;;
</code></pre>
<p>首次运行时程序会尝试创建目录、SQLite 数据库、<code>challenges</code> 表、<code>tokens</code> 表和索引。部署完成后应检查：</p>
<pre><code class="language-bash">php -m | grep -Ei &#39;pdo|sqlite&#39;
</code></pre>
<p>并确认 PHP-FPM 用户能够写入 <code>.data/</code>。数据库文件不应被 Web 服务器作为静态文件下载；生产环境更稳妥的做法是把数据库放到站点公开目录之外，再通过构造配置指定绝对路径。</p>
<h3>3. 难度与超时配置</h3>
<p>仓库默认配置：</p>
<pre><code class="language-php">$config = [
    &#39;db_Driver&#39; =&gt; &#39;.data/cap.db&#39;,
    &#39;c&#39; =&gt; 64,
    &#39;s&#39; =&gt; 128,
    &#39;d&#39; =&gt; 4,
];
$cap = new Cap($config);
</code></pre>
<p>含义按项目命名分别为运算次数 <code>c</code>、每次运算输入长度 <code>s</code> 和难度 <code>d</code>。生成挑战时还能设置挑战参数及过期秒数：</p>
<pre><code class="language-php">$cap = new Cap();
$challenge = [
    &#39;c&#39; =&gt; 32,
    &#39;s&#39; =&gt; 64,
    &#39;d&#39; =&gt; 4,
];
$expires = 60;
$cap-&gt;createChallenge($challenge, $expires);
</code></pre>
<p>难度越高，客户端计算时间通常越长。不要直接照抄某个实例的值上线，应在手机、低性能电脑和主流浏览器上测试等待时间与失败率。</p>
<h3>4. 自建后的前端地址</h3>
<p>PHP 仓库 README 使用官方 Cap Widget：</p>
<pre><code class="language-html">&lt;script src=&quot;https://cdn.jsdelivr.net/npm/@cap.js/widget&quot;&gt;&lt;/script&gt;
&lt;cap-widget
  id=&quot;cap&quot;
  data-cap-api-endpoint=&quot;https://你的-Cap-Pow-地址/&quot;
&gt;&lt;/cap-widget&gt;
</code></pre>
<p>不过 <code>cap-pow.wuw.li</code> 当前公开的是自己的 <code>cap-pow.js</code>/<code>cap-pow.css</code>，并非 README 里的原始组件。若想复刻现有实例外观，需要同时部署或改写对应的前端资源，并把脚本中的 API 常量改为自己的域名。不要把当前实例脚本原样放到自己的域名后就认为已经自托管——其公开 JS 内部仍固定指向 <code>https://cap-pow.wuw.li</code>。</p>
<h3>5. PHP 分支的安全注意</h3>
<p>仓库 <code>cap.php</code> 文件头明确写着该版本“不带防重放攻击”，并推荐需要该能力时使用作者的 One-Pow 分支。与此同时，当前仓库代码确实会把 challenge 和最终验证 token 设为一次性并在消费后删除；这里应忠实保留项目作者的风险声明，不把它宣传成可替代所有反滥用措施的完整方案。</p>
<p>生产环境还应在反向代理或应用层补充：</p>
<ul>
<li>对 challenge、redeem、validate 做合理限流；</li>
<li>只允许 HTTPS；</li>
<li>限制允许调用挑战接口的来源；</li>
<li>监控异常请求和失败率；</li>
<li>定期清理过期数据（当前源码只在访问对应 token 时删除过期记录，未见全表定时清理逻辑）；</li>
<li>保护 SQLite 文件与备份。</li>
</ul>
<p>最后一条“过期数据清理”来自源码检查：建表并写入 <code>expires</code>，但公开仓库中没有独立清理任务。因此高流量部署前应自行评估数据库增长，而不是假设项目已提供后台清理器。</p>
<hr>
<h2>五、Docker：当前官方 Cap Standalone 是另一条路线</h2>
<p>如果你的目标不是一比一复刻 PHP 实例，而是部署当前 Cap 官方推荐版本，官方文档推荐 Docker。它运行于 Bun，使用 Redis/Valkey，带管理面板、多个 site key、统计、instrumentation challenge，以及兼容 reCAPTCHA 风格的服务端核验 API。</p>
<p>官方当前提供的 Compose 核心配置如下：</p>
<pre><code class="language-yaml">services:
  cap:
    image: tiago2/cap:latest
    container_name: cap
    ports:
      - &quot;3000:3000&quot;
    environment:
      ADMIN_KEY: your_secret_password
      REDIS_URL: redis://valkey:6379
    depends_on:
      valkey:
        condition: service_healthy
    restart: unless-stopped

  valkey:
    image: valkey/valkey:9-alpine
    container_name: cap-valkey
    volumes:
      - valkey-data:/data
    command: valkey-server --save 60 1 --loglevel warning --maxmemory-policy noeviction
    healthcheck:
      test: [&quot;CMD&quot;, &quot;valkey-cli&quot;, &quot;ping&quot;]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  valkey-data:
</code></pre>
<p>启动：</p>
<pre><code class="language-bash">docker compose up -d
</code></pre>
<p>然后访问 <code>http://服务器地址:3000</code>，用 <code>ADMIN_KEY</code> 登录并创建 site key。官方建议 <code>ADMIN_KEY</code> 至少 32 个字符。</p>
<p>官方 Standalone 的前端 endpoint 包含 site key：</p>
<pre><code class="language-html">&lt;script type=&quot;module&quot; src=&quot;https://cdn.jsdelivr.net/npm/cap-widget&quot;&gt;&lt;/script&gt;

&lt;form&gt;
  &lt;cap-widget
    required
    data-cap-api-endpoint=&quot;https://cap.example.com/你的-site-key/&quot;
  &gt;&lt;/cap-widget&gt;
  &lt;button type=&quot;submit&quot;&gt;提交&lt;/button&gt;
&lt;/form&gt;
</code></pre>
<p>组件位于表单中时，会自动注入默认名为 <code>cap-token</code> 的隐藏字段。业务后端应调用：</p>
<pre><code class="language-bash">curl &#39;https://cap.example.com/你的-site-key/siteverify&#39; \
  -X POST \
  -H &#39;Content-Type: application/json&#39; \
  -d &#39;{&quot;secret&quot;:&quot;你的-site-secret&quot;,&quot;response&quot;:&quot;浏览器返回的-token&quot;}&#39;
</code></pre>
<p>成功响应为：</p>
<pre><code class="language-json">{ &quot;success&quot;: true }
</code></pre>
<p>请区分三种密钥/值：</p>
<ul>
<li><code>ADMIN_KEY</code>：登录 Standalone 管理面板；</li>
<li>site key：公开给浏览器，用在 endpoint 中；</li>
<li>site secret：只保存在业务后端，用于 <code>/siteverify</code>。</li>
</ul>
<p>它们与 PHP 实例的 <code>/api/validate</code> 无密钥调用方式不同。</p>
<h3>Standalone 常用环境变量</h3>
<p>官方文档中与常见部署最相关的选项包括：</p>
<ul>
<li><code>CORS_ORIGIN</code>：默认 <code>*</code>，可用逗号分隔多个来源；</li>
<li><code>REDIS_URL</code>：Redis/Valkey 连接地址；</li>
<li><code>REDIS_PREFIX</code>：共享 Redis 时给键增加命名空间；</li>
<li><code>RATELIMIT_IP_HEADER</code>：反向代理后指定真实 IP 请求头，Cloudflare 可用 <code>cf-connecting-ip</code>，多数代理环境常用 <code>x-forwarded-for</code>；</li>
<li><code>ENABLE_ASSETS_SERVER=true</code>：由实例提供 widget/WASM 静态资源；</li>
<li><code>WIDGET_VERSION</code>、<code>WASM_VERSION</code>：固定资源版本。官方不建议生产环境使用可能引入破坏性变更的 <code>latest</code>；</li>
<li><code>SHOW_ERRORS=true</code>：取消错误信息脱敏，仅适合有明确需求的调试环境；</li>
<li><code>DISABLE_ERROR_LOGGING=true</code>：关闭错误日志。</li>
</ul>
<p>如果为 IP 数据库绑定宿主目录到 <code>/usr/src/app/data</code>，官方文档说明容器以 UID 1000 运行，该目录必须对 UID 1000 可写。无法调整所有权时，可改用 Docker named volume 或不做宿主目录绑定。</p>
<hr>
<h2>六、常见问题</h2>
<h3>1. 点击后提示“网络错误”或“提交失败”</h3>
<p>依次检查：</p>
<ul>
<li>页面是否为 HTTPS；</li>
<li><code>cap-pow.js</code> 与 <code>cap-pow.css</code> 是否加载成功；</li>
<li>浏览器开发者工具 Network 中 <code>/challenge</code>、<code>/redeem</code> 是否返回 200；</li>
<li>CSP 是否阻止外部脚本、样式、<code>connect-src</code> 或 WebAssembly；</li>
<li>浏览器是否支持 <code>crypto.subtle</code>；</li>
<li>自建服务的跨域配置是否允许当前站点。</li>
</ul>
<p>现有 <code>cap-pow.wuw.li</code> 的 JS、CSS 和 API 响应目前都带有 <code>Access-Control-Allow-Origin: *</code>，但自建实例不能据此假设自己的 Nginx/PHP 配置也会自动具有相同响应头。</p>
<h3>2. 前端已显示“你是人类”，后端仍失败</h3>
<p>常见原因：</p>
<ul>
<li>提交的字段名与后端读取字段名不一致；</li>
<li>token 已被消费一次；</li>
<li>token 过期；</li>
<li>页面刷新或组件重置后仍提交旧 token；</li>
<li>后端调用了错误的验证接口；</li>
<li>混用了 PHP 实例的 <code>/api/validate</code> 与 Standalone 的 <code>/&lt;site-key&gt;/siteverify</code>。</li>
</ul>
<h3>3. 页面能显示组件，但业务接口仍可被绕过</h3>
<p>说明只做了前端，没有在业务后端强制核验 token。前端组件不是访问控制边界。</p>
<h3>4. SQLite 报错 <code>unable to open database file</code></h3>
<p>重点检查数据库父目录是否存在、PHP-FPM 用户是否有写权限、路径是否按运行目录解析。建议改为明确的绝对路径，并确保数据库不在可下载的公开静态目录内。</p>
<h3>5. Nginx 访问 <code>/challenge</code> 返回 404</h3>
<p>检查仓库提供的 <code>try_files $uri $uri/ $uri.php?$query_string;</code> 是否合并到正确的 <code>server/location</code>，以及 PHP-FPM 转发规则是否实际生效。不要为了修复单个路由直接覆盖整份站点配置。</p>
<h3>6. 手机验证很慢</h3>
<p>PoW 会消耗客户端 CPU。先降低挑战参数并进行真机测试；不要只在高性能桌面电脑上评估。官方 Standalone 还提供按 site key 配置的挑战方式，但那属于 Standalone 路线，不能直接套入 PHP 分支。</p>
<h3>7. 能否完全离线、不依赖第三方 CDN？</h3>
<ul>
<li>当前实例方案：如果页面直接加载 <code>cap-pow.wuw.li</code> 的 JS/CSS 并调用它的 API，就仍然依赖第三方实例；</li>
<li>PHP 自建：应把前端文件一并托管到自己的域名并确认 API 地址已改成自己的实例；</li>
<li>官方 Standalone：可开启 asset server，自行提供 widget 与 WASM，并固定版本。</li>
</ul>
<p>“上游项目隐私友好”不等于“调用任意第三方实例时没有数据出站”。访问第三方验证域名时，至少会发生网络请求，部署者应结合隐私政策、可用性和日志策略自行评估。</p>
<hr>
<h2>七、上线检查清单</h2>
<ul>
<li><input disabled="" type="checkbox"> 明确选择 PHP 分支或官方 Standalone，没有混用接口；</li>
<li><input disabled="" type="checkbox"> 页面端能完成 challenge → redeem；</li>
<li><input disabled="" type="checkbox"> 业务后端强制执行 validate/siteverify；</li>
<li><input disabled="" type="checkbox"> 验证服务故障时默认拒绝，而不是绕过；</li>
<li><input disabled="" type="checkbox"> token 验证成功后不重复使用；</li>
<li><input disabled="" type="checkbox"> 全站 HTTPS；</li>
<li><input disabled="" type="checkbox"> CORS 只放行所需站点（自建时）；</li>
<li><input disabled="" type="checkbox"> 反向代理传递并正确解析客户端 IP；</li>
<li><input disabled="" type="checkbox"> challenge/redeem 等接口有限流；</li>
<li><input disabled="" type="checkbox"> 移动设备和低性能设备完成过验证耗时测试；</li>
<li><input disabled="" type="checkbox"> SQLite 或 Valkey 数据有持久化与备份策略；</li>
<li><input disabled="" type="checkbox"> 前端资源固定版本或纳入自己的发布流程；</li>
<li><input disabled="" type="checkbox"> Halo 主题/插件升级后重新做完整流程回归测试。</li>
</ul>
<hr>
<h2>参考资料</h2>
<ol>
<li>已部署实例与接入示例：<a href="https://cap-pow.wuw.li/">https://cap-pow.wuw.li/</a></li>
<li>已部署实例 JavaScript：<a href="https://cap-pow.wuw.li/cap-pow.js">https://cap-pow.wuw.li/cap-pow.js</a></li>
<li>已部署实例 CSS：<a href="https://cap-pow.wuw.li/cap-pow.css">https://cap-pow.wuw.li/cap-pow.css</a></li>
<li>Cap-Pow PHP Server 仓库：<a href="https://github.com/onexru/cap-pow-php-server">https://github.com/onexru/cap-pow-php-server</a></li>
<li>PHP Server README：<a href="https://github.com/onexru/cap-pow-php-server/blob/main/README.md">https://github.com/onexru/cap-pow-php-server/blob/main/README.md</a></li>
<li>PHP 核心实现 <code>cap.php</code>：<a href="https://github.com/onexru/cap-pow-php-server/blob/main/cap.php">https://github.com/onexru/cap-pow-php-server/blob/main/cap.php</a></li>
<li>Cap 官方仓库：<a href="https://github.com/tiagozip/cap">https://github.com/tiagozip/cap</a></li>
<li>Cap Standalone 官方文档：<a href="https://trycap.dev/guide/standalone/">https://trycap.dev/guide/standalone/</a></li>
<li>Cap Standalone 配置选项：<a href="https://trycap.dev/guide/standalone/options">https://trycap.dev/guide/standalone/options</a></li>
<li>Cap Widget 官方文档：<a href="https://trycap.dev/guide/widget">https://trycap.dev/guide/widget</a></li>
<li>Cap 官方 Compose 文件：<a href="https://github.com/tiagozip/cap/blob/main/standalone/docker-compose.yml">https://github.com/tiagozip/cap/blob/main/standalone/docker-compose.yml</a></li>
<li>Halo 文章管理文档：<a href="https://docs.halo.run/user-guide/posts">https://docs.halo.run/user-guide/posts</a></li>
</ol>
<blockquote>
<p>版本提示：Cap 上游仍在持续更新，正式部署前应重新核对镜像标签、Widget 版本、环境变量和接口文档；生产环境不应无审查地追随 <code>latest</code>。</p>
</blockquote>

