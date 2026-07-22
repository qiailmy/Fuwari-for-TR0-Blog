---
title: "TG-Vault 部署与使用教程：Telegram 全自动转存到私有云"
published: 2026-07-19T00:11:43.607754472Z
updated: 2026-07-19T00:11:30.821221315Z
draft: false
description: "本文基于 hicocos/tg-vault 的 main 分支编写，核对版本为提交 2d6204b（2026-07-17）。该项目目前没有 GitHub Release 和 tag，生产环境若重视可复现性，建议部署时固定到已验证的提交，而不是长期无条件追踪 main。 TG Vault 是一个面向个"
image: "https://wuw.li/r2-assets/tu/2026-07-19T07-cjbkx.svg"
category: ["测试"]
tags: []
pinned: false
haloName: "post-eoo1u6eb"
allowComment: false
---
<figure data-content-type="image"><img src="https://wuw.li/r2-assets/tu/2026-07-19T07-cjbkx.svg" alt="TG-Vault Telegram 自动转存和私有云存储教程封面"></figure>
<blockquote>
<p>本文基于 <code>hicocos/tg-vault</code> 的 <code>main</code> 分支编写，核对版本为提交 <code>2d6204b</code>（2026-07-17）。该项目目前没有 GitHub Release 和 tag，生产环境若重视可复现性，建议部署时固定到已验证的提交，而不是长期无条件追踪 <code>main</code>。</p>
</blockquote>
<p>TG Vault 是一个面向个人或小团队的 Telegram 转存与私有文件管理系统。它由 React 前端、Node.js 后端和 PostgreSQL 组成，既可以在网页里上传、预览、删除及管理文件，也能把 Telegram Bot 当作随手投递文件的入口。</p>
<p>它支持本地磁盘、OneDrive、Google Drive、阿里云 OSS、S3 兼容存储和 WebDAV。Telegram 侧还可以调用 yt-dlp 下载链接、按规则归档文件；登录 Telegram 用户账号后，则可进一步抓取频道/群组媒体和同步订阅。</p>
<h2>先弄清两种 Telegram 模式</h2>
<p>TG Vault 的 <strong>Bot 功能</strong> 与 <strong>账号级下载器</strong> 不是一回事：</p>
<ul>
<li>只配置 Bot：可以私聊发送文件、查看任务和存储统计、删除文件、使用 <code>/ytdlp</code>。</li>
<li>再登录 Telegram 用户账号：才能按日期或标签抓取频道/群组媒体、自动同步订阅，并更稳定地处理超出 Bot 下载能力的大文件。</li>
</ul>
<p>因此，如果只想把 Bot 当作私人上传入口，不必生成用户账号 Session。Session 权限更高，也更敏感，遵循“能不用就不用”的最小权限原则更稳妥。</p>
<h2>一、部署前准备</h2>
<p>建议准备：</p>
<ol>
<li>一台已安装 Docker Engine 与 Docker Compose 插件的 Linux 服务器；</li>
<li>两个已解析到服务器的域名，例如：<ul>
<li><code>cloud.example.com</code>：Web 前端；</li>
<li><code>api.example.com</code>：后端 API；</li>
</ul>
</li>
<li>宿主机上的 Nginx、Caddy 或面板反向代理，用于申请证书并提供 HTTPS；</li>
<li>若启用 Telegram：Bot Token，以及 Telegram API ID/API Hash。</li>
</ol>
<p>官方 Compose <strong>不包含 Nginx 或 Certbot</strong>。它只启动 <code>frontend</code>、<code>backend</code>、<code>postgres</code> 三个服务，并把前后端分别绑定到宿主机回环地址：</p>
<ul>
<li><code>127.0.0.1:47832</code> → 前端；</li>
<li><code>127.0.0.1:51947</code> → 后端。</li>
</ul>
<p>这种绑定方式值得保留：外网只访问反向代理的 80/443 端口，不应直接放行 47832、51947 或 PostgreSQL。</p>
<h2>二、获取代码并准备配置</h2>
<pre><code class="language-bash">git clone https://github.com/hicocos/tg-vault.git
cd tg-vault
cp .env.example .env
</code></pre>
<p>生成数据库密码：</p>
<pre><code class="language-bash">openssl rand -hex 32
</code></pre>
<p>然后编辑 <code>.env</code>：</p>
<pre><code class="language-bash">nano .env
</code></pre>
<p>一个适合双域名、HTTPS 部署的基础示例如下。请替换示例域名和所有秘密值，不要原样使用：</p>
<pre><code class="language-dotenv">DB_PASSWORD=替换为_openssl_rand_hex_32_生成的随机值

VITE_API_URL=https://api.example.com
CORS_ORIGIN=https://cloud.example.com
DOMAIN=cloud.example.com
COOKIE_SECURE=true

PORT=51947
UPLOAD_DIR=/data/uploads
THUMBNAIL_DIR=/data/thumbnails
CHUNK_DIR=/data/chunks

DUPLICATE_FILE_MODE=copy
AUTO_CLEANUP_ORPHANS=true

TELEGRAM_BOT_TOKEN=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_ALLOWED_USER_IDS=
TELEGRAM_USER_SESSION_FILE=/data/telegram_user_session.txt
TELEGRAM_DOWNLOAD_WORKERS=4
TELEGRAM_FILE_DOWNLOAD_CONCURRENCY=2

YTDLP_BIN=yt-dlp
YTDLP_WORK_DIR=./data/uploads/ytdlp
YTDLP_MAX_CONCURRENT=1
</code></pre>
<h3>必须理解的几个变量</h3>
<ul>
<li><code>DB_PASSWORD</code>：PostgreSQL 用户 <code>tgvault</code> 的密码，应使用高强度随机值。</li>
<li><code>VITE_API_URL</code>：浏览器访问后端的公网地址，必须带 <code>http://</code> 或 <code>https://</code>。它是<strong>前端构建时变量</strong>，修改后需要重新构建前端，而非只重启容器。</li>
<li><code>CORS_ORIGIN</code>：允许发起跨域请求的前端 Origin，应是完整且精确的地址，例如 <code>https://cloud.example.com</code>，不要填写路径，也不建议随意设为 <code>*</code>。</li>
<li><code>DOMAIN</code>：应用主域名，不带协议。</li>
<li><code>COOKIE_SECURE</code>：生产环境保持 <code>true</code>，这样登录 Cookie 只经 HTTPS 发送。本地纯 HTTP 排错时才临时设为 <code>false</code>。</li>
<li><code>TRUST_PROXY</code>：模板默认 <code>loopback</code>，宿主机反代到回环端口时通常无需修改。不要为了省事无条件信任所有代理。</li>
</ul>
<p>项目会在首次运行时把内部密钥持久化到 <code>/data/secrets/</code>。也可以在 <code>.env</code> 中显式设置至少 32 字符的 <code>SESSION_SECRET</code> 和 <code>STORAGE_CREDENTIALS_SECRET</code>，但无论采用哪种方式，都必须安全保管；尤其不要把 <code>.env</code> 提交到 Git。</p>
<p>可分别生成：</p>
<pre><code class="language-bash">openssl rand -hex 32
openssl rand -hex 32
</code></pre>
<h2>三、配置 Telegram Bot</h2>
<h3>1. 创建 Bot</h3>
<ol>
<li>在 Telegram 私聊 <a href="https://t.me/BotFather">@BotFather</a>；</li>
<li>发送 <code>/newbot</code>；</li>
<li>按提示设置名称和以 <code>bot</code> 结尾的用户名；</li>
<li>保存 BotFather 返回的 HTTP API Token，并写入：</li>
</ol>
<pre><code class="language-dotenv">TELEGRAM_BOT_TOKEN=1234567890:请替换为真实Token
</code></pre>
<p>Bot Token 相当于机器人密码。若曾泄露，应立即在 BotFather 中撤销并重新生成。</p>
<h3>2. 获取 API ID 与 API Hash</h3>
<p>访问 <a href="https://my.telegram.org">my.telegram.org</a>，使用自己的 Telegram 账号登录，进入 <strong>API development tools</strong> 创建应用，取得 <code>api_id</code> 与 <code>api_hash</code>：</p>
<pre><code class="language-dotenv">TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=请替换为真实APIHash
</code></pre>
<p>当前项目中，Bot 和账号级下载器共用这组 API 配置。</p>
<h3>3. 限制允许使用 Bot 的用户</h3>
<p>强烈建议预先设置 Telegram 数字用户 ID：</p>
<pre><code class="language-dotenv">TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
</code></pre>
<p>多个 ID 用英文逗号分隔。可以通过 Telegram 的 <code>@userinfobot</code> 查询自己的数字 ID。</p>
<p>若该项留空，且系统尚无任何 Telegram 用户认证成功，<strong>第一个正确输入 Bot PIN 的用户会被自动加入允许列表</strong>。这虽然方便首次安装，却会扩大初始化阶段的抢占风险，因此公网部署最好不要留空。初始化后也可在 Web 后台的“设置 → Telegram Bot 设置”维护名单。</p>
<h2>四、校验、构建并启动</h2>
<p>README 将前后端分开构建；Compose 文件本身也定义了构建参数。更简洁且不容易漏掉 <code>VITE_API_URL</code> 的做法是先验证配置，再由 Compose 一次完成构建和启动：</p>
<pre><code class="language-bash">docker compose config --quiet
docker compose up -d --build
docker compose ps
</code></pre>
<p>如果希望完全按分步方式构建，可执行：</p>
<pre><code class="language-bash">set -a
source .env
set +a

docker build \
  --build-arg VITE_API_URL=&quot;${VITE_API_URL}&quot; \
  -t tg-vault-frontend:latest \
  ./frontend

docker build -t tg-vault-backend:latest ./backend
docker compose up -d
</code></pre>
<p>两套方法二选一即可，不需要重复执行。</p>
<blockquote>
<p>修改 <code>VITE_API_URL</code> 后，至少要重新构建并创建前端容器。直接使用 <code>docker compose up -d --build</code> 最省心。</p>
</blockquote>
<p>查看健康状态和后端日志：</p>
<pre><code class="language-bash">docker compose ps
curl -fsS http://127.0.0.1:51947/livez
curl -fsS http://127.0.0.1:51947/readyz
docker compose logs --tail=100 backend frontend postgres
</code></pre>
<p><code>/livez</code> 返回成功只说明后端进程还活着；<code>/readyz</code> 成功才表示数据库、存储和安全密钥等依赖已就绪。</p>
<h2>五、可选：启用账号级 Telegram 下载器</h2>
<p>只有需要频道/群组批量抓取、订阅同步或更稳定的大文件下载时，才执行：</p>
<pre><code class="language-bash">docker compose run --rm --no-deps backend npm run login:telegram-user
</code></pre>
<p>按终端提示输入手机号、Telegram 登录验证码；若账号启用了 Telegram 云密码，还需输入该密码。命令会通过 Compose 的 <code>/data</code> 持久卷保存 Session，默认位置是：</p>
<pre><code class="language-dotenv">TELEGRAM_USER_SESSION_FILE=/data/telegram_user_session.txt
</code></pre>
<p>生成后启动或重建服务：</p>
<pre><code class="language-bash">docker compose up -d --build
</code></pre>
<p>安全提醒：这个 Session 代表已登录的 Telegram 用户账号，并不只是 Bot Token。任何能读取它的人都可能获得相应账号访问能力。不要把它复制到网页、聊天记录或代码仓库；备份也应加密。用于下载器的账号必须已经加入目标频道/群组，并有权查看历史消息。</p>
<h2>六、配置 HTTPS 反向代理</h2>
<p>推荐采用两个域名，分别反代：</p>
<table>
<thead>
<tr>
<th>公网入口</th>
<th>上游地址</th>
</tr>
</thead>
<tbody><tr>
<td><code>https://cloud.example.com</code></td>
<td><code>http://127.0.0.1:47832</code></td>
</tr>
<tr>
<td><code>https://api.example.com</code></td>
<td><code>http://127.0.0.1:51947</code></td>
</tr>
</tbody></table>
<p>反向代理至少应传递 <code>Host</code>、<code>X-Real-IP</code>、<code>X-Forwarded-For</code> 和 <code>X-Forwarded-Proto</code>。API 站点还要为上传设置合适的请求体上限及读写超时。若使用 Nginx，可按业务规模设置类似：</p>
<pre><code class="language-nginx">client_max_body_size 500M;
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
</code></pre>
<p>这里的 <code>client_max_body_size</code> 是反向代理限制；<code>MAX_UPLOAD_CHUNK_MB</code> 则是应用的单分片限制，两者不是同一个概念。仓库示例值为单片 <code>64 MB</code>，请让代理限制足够容纳实际请求。</p>
<p>启用 HTTPS 后确认：</p>
<pre><code class="language-dotenv">VITE_API_URL=https://api.example.com
CORS_ORIGIN=https://cloud.example.com
COOKIE_SECURE=true
</code></pre>
<p>若前端能打开但登录或 API 请求失败，优先检查浏览器控制台中的 CORS、Mixed Content 和 Cookie 提示，再核对这三个变量是否与实际地址逐字一致。</p>
<h2>七、首次初始化与 2FA</h2>
<p>首次访问 <code>https://cloud.example.com</code> 时，系统会要求创建：</p>
<ul>
<li>至少 8 位的网页管理员密码；</li>
<li>用于 Bot <code>/start</code> 认证的 4 位 PIN。</li>
</ul>
<p>两者会使用 scrypt 加盐哈希后保存。登录后使用 HttpOnly Cookie，会对修改类请求校验 Origin。即便如此，4 位 PIN 的搜索空间仍然很小，因此必须配合 <code>TELEGRAM_ALLOWED_USER_IDS</code>，并建议随后启用 TOTP 双重验证：</p>
<ul>
<li>Web：在个人设置中扫码开启；</li>
<li>Bot：发送 <code>/setup_2fa</code>，按对话完成绑定。</li>
</ul>
<h2>八、存储、并发与文件策略</h2>
<h3>Docker 中真正需要保留的数据</h3>
<p>Compose 使用两个 named volume：</p>
<ul>
<li><code>tg-vault_postgres-data</code>：PostgreSQL 数据；</li>
<li><code>tg-vault_file-storage</code>：<code>/data</code> 下的上传文件、缩略图、分片状态、日志、Telegram 用户 Session 和内部密钥等。</li>
</ul>
<p>实际卷名前缀会受 Compose 项目名影响，可用下面的命令核对：</p>
<pre><code class="language-bash">docker volume ls | grep tg-vault
</code></pre>
<p><code>docker compose down</code> 默认不会删除 named volume；但 <strong><code>docker compose down -v</code> 会删除卷</strong>，可能造成永久数据损失，不要在日常维护中使用。</p>
<h3>重复文件与孤儿清理</h3>
<pre><code class="language-dotenv">DUPLICATE_FILE_MODE=copy
AUTO_CLEANUP_ORPHANS=true
ORPHAN_CLEANUP_MIN_AGE_MS=600000
</code></pre>
<ul>
<li><code>copy</code>：出现同名、同目录、同大小文件时生成副本；</li>
<li><code>skip</code>：跳过这类重复文件；</li>
<li>自动孤儿清理会清除本地 uploads 中未登记到数据库的文件，默认保护最近 10 分钟内的文件。</li>
</ul>
<p>如果手工向 volume 写文件、做迁移或排错，先关闭自动清理或确认文件已正确登记，避免它被当成孤儿文件删除。</p>
<h3>Telegram 并发不要一味调高</h3>
<p>Telegram 下载有两层并发：</p>
<pre><code class="language-dotenv">TELEGRAM_FILE_DOWNLOAD_CONCURRENCY=2
TELEGRAM_DOWNLOAD_WORKERS=4
</code></pre>
<p>前者控制同时下载几个文件，后者控制单个文件内部并发拉取多少个约 512 KB 的分片。默认 <code>2 × 4</code> 是较稳妥起点；文件并发可设 <code>1/2/3/4</code>，分片 worker 可选 <code>4/8/12/16</code>。高并发可能触发 Telegram 限流、连接中断或远端存储限速，只有在网络和目标存储都稳定时再逐步增加。</p>
<h2>九、常用 Bot 操作</h2>
<p>通过 <code>/start</code> 完成 PIN（以及已启用时的 TOTP）验证后，可使用：</p>
<ul>
<li><code>/storage</code>：存储统计；</li>
<li><code>/tasks</code>：任务队列；</li>
<li><code>/task_pause [任务ID]</code>、<code>/task_resume [任务ID]</code>：暂停或恢复；</li>
<li><code>/task_cancel &lt;任务ID或all&gt;</code>：取消任务；</li>
<li><code>/ytdlp &lt;https://链接&gt;</code>：解析一个视频链接并保存到当前存储源；</li>
<li><code>/path_rules</code>、<code>/p &lt;目录&gt;</code>、<code>/ps &lt;目录&gt;</code>、<code>/pc</code>：控制保存目录。</li>
</ul>
<p>启用账号级下载器后，还可使用：</p>
<pre><code class="language-text">/tg_download date @channel 2026-01-01 2026-01-31
/tg_download tag @channel #壁纸
/tg_sub @channel
/tg_subs
/tg_unsub @channel
</code></pre>
<p>执行批量抓取前，先确认内容来源、下载和再存储行为符合频道规则及当地法律。</p>
<h2>十、备份与恢复</h2>
<p>仅备份上传目录是不够的。一次可恢复的备份应在同一维护窗口内包含：</p>
<ol>
<li>PostgreSQL custom-format dump；</li>
<li>完整 <code>file-storage</code> 卷；</li>
<li>版本、时间和 SHA-256 清单。</li>
</ol>
<p>仓库提供协调备份脚本。它会先检查空间，然后在数据库导出和 <code>/data</code> 归档期间停止后端，避免上传、删除或 Telegram 后台任务跨越两个快照：</p>
<pre><code class="language-bash">chmod +x deploy/backup.sh deploy/restore-verify.sh
BACKUP_DIR=./backups ./deploy/backup.sh
</code></pre>
<p>备份会短暂停止 API，请安排维护窗口。备份包含 Session、TOTP 及第三方存储凭证等敏感材料，完成后应限制文件权限、加密并异地保存。</p>
<p>恢复前先做只读校验：</p>
<pre><code class="language-bash">./deploy/restore-verify.sh ./backups/&lt;backup-directory&gt;
</code></pre>
<p>校验脚本不能代替恢复演练。建议定期在隔离环境恢复数据库与文件卷，并检查 <code>/readyz</code>、数据行数、文件完整性及加密凭证是否可读。</p>
<h2>十一、更新与回滚意识</h2>
<p>当前仓库没有 Release/tag。更新前先确认工作区和备份：</p>
<pre><code class="language-bash">git fetch origin
git status --short
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
</code></pre>
<p>若 <code>git status --short</code> 有输出，先人工判断改动来源，不要用强制重置覆盖生产配置。更新后检查：</p>
<pre><code class="language-bash">curl -fsS http://127.0.0.1:51947/livez
curl -fsS http://127.0.0.1:51947/readyz
docker compose logs --tail=100 backend frontend postgres
</code></pre>
<p>为了便于回滚，可在升级前记录当前提交：</p>
<pre><code class="language-bash">git rev-parse HEAD
</code></pre>
<p>需要特别说明：仓库当前 <code>deploy/DEPLOY.md</code> 的更新示例仍写有 <code>feat/telegram-task-center</code> 分支，而仓库默认分支及最新 README 均使用 <code>main</code>。本文采用 <code>main</code>，避免把历史文档中的分支名带入生产命令。</p>
<h2>十二、上线前安全检查清单</h2>
<ul>
<li><input disabled="" type="checkbox"> <code>DB_PASSWORD</code>、Bot Token、API Hash、Session 均未提交 Git；</li>
<li><input disabled="" type="checkbox"> <code>TELEGRAM_ALLOWED_USER_IDS</code> 已明确配置；</li>
<li><input disabled="" type="checkbox"> Web 与 API 均只通过 HTTPS 暴露；</li>
<li><input disabled="" type="checkbox"> 47832、51947 只绑定 <code>127.0.0.1</code>，5432 未暴露公网；</li>
<li><input disabled="" type="checkbox"> <code>CORS_ORIGIN</code> 与实际前端 Origin 完全一致；</li>
<li><input disabled="" type="checkbox"> <code>COOKIE_SECURE=true</code>；</li>
<li><input disabled="" type="checkbox"> 管理员密码足够长，Web 与 Bot 均启用了 TOTP；</li>
<li><input disabled="" type="checkbox"> 已备份 PostgreSQL 与完整 <code>/data</code>，备份已加密并异地保存；</li>
<li><input disabled="" type="checkbox"> 已测试 <code>/livez</code>、<code>/readyz</code> 和一次实际上传；</li>
<li><input disabled="" type="checkbox"> 没有在日常命令中使用 <code>docker compose down -v</code>；</li>
<li><input disabled="" type="checkbox"> 更新前记录提交 SHA，并阅读代码变更。</li>
</ul>
<h2>参考来源</h2>
<ul>
<li>TG Vault 仓库：<a href="https://github.com/hicocos/tg-vault">https://github.com/hicocos/tg-vault</a></li>
<li>最新 README（<code>main</code>）：<a href="https://github.com/hicocos/tg-vault/blob/main/README.md">https://github.com/hicocos/tg-vault/blob/main/README.md</a></li>
<li>环境变量模板：<a href="https://github.com/hicocos/tg-vault/blob/main/.env.example">https://github.com/hicocos/tg-vault/blob/main/.env.example</a></li>
<li>Docker Compose：<a href="https://github.com/hicocos/tg-vault/blob/main/docker-compose.yml">https://github.com/hicocos/tg-vault/blob/main/docker-compose.yml</a></li>
<li>服务器部署与备份说明：<a href="https://github.com/hicocos/tg-vault/blob/main/deploy/DEPLOY.md">https://github.com/hicocos/tg-vault/blob/main/deploy/DEPLOY.md</a></li>
<li>Nginx 示例：<a href="https://github.com/hicocos/tg-vault/blob/main/deploy/nginx-site.conf">https://github.com/hicocos/tg-vault/blob/main/deploy/nginx-site.conf</a></li>
<li>协调备份脚本：<a href="https://github.com/hicocos/tg-vault/blob/main/deploy/backup.sh">https://github.com/hicocos/tg-vault/blob/main/deploy/backup.sh</a></li>
<li>本文核对的 <code>main</code> 提交：<a href="https://github.com/hicocos/tg-vault/commit/2d6204b2b3095a10d524e15358ae91dc70301552">https://github.com/hicocos/tg-vault/commit/2d6204b2b3095a10d524e15358ae91dc70301552</a></li>
<li>Telegram BotFather：<a href="https://t.me/BotFather">https://t.me/BotFather</a></li>
<li>Telegram API development tools：<a href="https://my.telegram.org">https://my.telegram.org</a></li>
</ul>
<blockquote>
<p>资料核对时间：2026-07-18（UTC）。项目迭代较快，正式部署前请再次比较 <code>.env.example</code>、<code>docker-compose.yml</code> 与 README。</p>
</blockquote>

