# 1. 是否有安装权限校验模块

> 如果已经安装了的话走第三步

```shell
nginx -V 2>&1 | grep -- 'http_auth_request_module'
# 提示有以下信息即可 否则输出空字符串 执行步骤2
configure arguments: --with-http_auth_request_module
```

# 2. 安装权限子模块

```shell
# 重新编译nginx
./configure --with-http_auth_request_module
# 安装
make
sudo make install
# 查看是否安装
configure arguments: --with-http_auth_request_module
```

# 3. 修改nginx配置文件

**<font color=red>这段配置文件加在 api和 ^~ images 中间！</font>**

```shell
location ^~ /images/data-collector/video-alarm/ {
    auth_request /auth-proxy;
    auth_request_set $auth_status $upstream_status;
    proxy_set_header Authorization $http_authorization;  
    alias /u01/apps/hesp/images/hesp-video-analysis-data-collector/video-alarm/;	 
	error_page 401 /404.html;
}

location /auth-proxy {
    internal;
    proxy_pass http://hrmw-web-01:8081/api/info;  # 将请求转发给后端服务器

    proxy_set_header X-Original-URI $request_uri;  # 可选，用于传递原始 URI
    proxy_set_header X-Requested-With XMLHttpRequest;  # 可选，用于指示异步请求
    # 配置其他参数
    # 将所有请求头全部传递给后端服务
    proxy_set_header Host $host;
	proxy_set_header Authorization $http_authorization;
}
```

**配置后如下, 请确保一致**

```she
location ^~/api/ {
	proxy_pass  http://hrmw-web-01:8081/api/;
}

location ^~ /images/data-collector/video-alarm/ {
    auth_request /auth-proxy;
    auth_request_set $auth_status $upstream_status;
    proxy_set_header Authorization $http_authorization;  
    alias /u01/apps/hesp/images/hesp-video-analysis-data-collector/video-alarm/;	 
	error_page 401 /404.html;
}

location /auth-proxy {
    internal;
    proxy_pass http://hrmw-web-01:8081/api/info;  # 将请求转发给后端服务器

    proxy_set_header X-Original-URI $request_uri;  # 可选，用于传递原始 URI
    proxy_set_header X-Requested-With XMLHttpRequest;  # 可选，用于指示异步请求
    # 配置其他参数
    # 将所有请求头全部传递给后端服务
    proxy_set_header Host $host;
	proxy_set_header Authorization $http_authorization;
}


location ^~/images/ {
	alias        /u01/apps/hesp/images/;
} 
```

