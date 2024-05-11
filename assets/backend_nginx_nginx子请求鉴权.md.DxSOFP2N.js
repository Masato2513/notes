import{_ as n,E as p,c as t,m as s,J as e,w as l,a4 as a,o as h,a as k}from"./chunks/framework.BCGKjEAc.js";const m=JSON.parse('{"title":"1. 是否有安装权限校验模块","description":"","frontmatter":{},"headers":[],"relativePath":"backend/nginx/nginx子请求鉴权.md","filePath":"backend/nginx/nginx子请求鉴权.md","lastUpdated":1715420922000}'),r={name:"backend/nginx/nginx子请求鉴权.md"},d=a(`<h1 id="_1-是否有安装权限校验模块" tabindex="-1">1. 是否有安装权限校验模块 <a class="header-anchor" href="#_1-是否有安装权限校验模块" aria-label="Permalink to &quot;1. 是否有安装权限校验模块&quot;">​</a></h1><blockquote><p>如果已经安装了的话走第三步</p></blockquote><div class="language-shell vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">shell</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nginx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -V</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;&amp;1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;http_auth_request_module&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 提示有以下信息即可 否则输出空字符串 执行步骤2</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">configure</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> arguments:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --with-http_auth_request_module</span></span></code></pre></div><h1 id="_2-安装权限子模块" tabindex="-1">2. 安装权限子模块 <a class="header-anchor" href="#_2-安装权限子模块" aria-label="Permalink to &quot;2. 安装权限子模块&quot;">​</a></h1><div class="language-shell vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">shell</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 重新编译nginx</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">./configure</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --with-http_auth_request_module</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 安装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">make</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> make</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 查看是否安装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">configure</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> arguments:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --with-http_auth_request_module</span></span></code></pre></div><h1 id="_3-修改nginx配置文件" tabindex="-1">3. 修改nginx配置文件 <a class="header-anchor" href="#_3-修改nginx配置文件" aria-label="Permalink to &quot;3. 修改nginx配置文件&quot;">​</a></h1>`,6),o=a(`<div class="language-shell vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">shell</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">location</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ^~</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /images/data-collector/video-alarm/</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    auth_request</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /auth-proxy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    auth_request_set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $auth_status $upstream_status;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    proxy_set_header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Authorization</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $http_authorization;  </span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    alias</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /u01/apps/hesp/images/hesp-video-analysis-data-collector/video-alarm/</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;	 </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">	error_page</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 401</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /404.html</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">location</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /auth-proxy</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    internal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    proxy_pass</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> http://hrmw-web-01:8081/api/info</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 将请求转发给后端服务器</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    proxy_set_header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> X-Original-URI</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $request_uri;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 可选，用于传递原始 URI</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    proxy_set_header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> X-Requested-With</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> XMLHttpRequest</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 可选，用于指示异步请求</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 配置其他参数</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 将所有请求头全部传递给后端服务</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    proxy_set_header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Host</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $host;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">	proxy_set_header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Authorization</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $http_authorization;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>配置后如下, 请确保一致</strong></p><div class="language-she vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">she</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>location ^~/api/ {</span></span>
<span class="line"><span>	proxy_pass  http://hrmw-web-01:8081/api/;</span></span>
<span class="line"><span>}</span></span>
<span class="line"><span></span></span>
<span class="line"><span>location ^~ /images/data-collector/video-alarm/ {</span></span>
<span class="line"><span>    auth_request /auth-proxy;</span></span>
<span class="line"><span>    auth_request_set $auth_status $upstream_status;</span></span>
<span class="line"><span>    proxy_set_header Authorization $http_authorization;  </span></span>
<span class="line"><span>    alias /u01/apps/hesp/images/hesp-video-analysis-data-collector/video-alarm/;	 </span></span>
<span class="line"><span>	error_page 401 /404.html;</span></span>
<span class="line"><span>}</span></span>
<span class="line"><span></span></span>
<span class="line"><span>location /auth-proxy {</span></span>
<span class="line"><span>    internal;</span></span>
<span class="line"><span>    proxy_pass http://hrmw-web-01:8081/api/info;  # 将请求转发给后端服务器</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    proxy_set_header X-Original-URI $request_uri;  # 可选，用于传递原始 URI</span></span>
<span class="line"><span>    proxy_set_header X-Requested-With XMLHttpRequest;  # 可选，用于指示异步请求</span></span>
<span class="line"><span>    # 配置其他参数</span></span>
<span class="line"><span>    # 将所有请求头全部传递给后端服务</span></span>
<span class="line"><span>    proxy_set_header Host $host;</span></span>
<span class="line"><span>	proxy_set_header Authorization $http_authorization;</span></span>
<span class="line"><span>}</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>location ^~/images/ {</span></span>
<span class="line"><span>	alias        /u01/apps/hesp/images/;</span></span>
<span class="line"><span>}</span></span></code></pre></div>`,3);function c(g,F,_,y,u,E){const i=p("font");return h(),t("div",null,[d,s("p",null,[s("strong",null,[e(i,{color:"red"},{default:l(()=>[k("这段配置文件加在 api和 ^~ images 中间！")]),_:1})])]),o])}const B=n(r,[["render",c]]);export{m as __pageData,B as default};
