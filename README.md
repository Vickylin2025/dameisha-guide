# 玩转大梅沙

一个介绍深圳大梅沙及周边景点的中文网站，包含景点图片、游玩提示、交通建议、地图导航入口，以及基于 Supabase Auth 的邮箱账号功能。

## 预览

需要 Node.js 20 或更高版本。项目没有第三方依赖，在项目目录运行：

```sh
npm start
```

然后访问 <http://127.0.0.1:3000>。认证页面通过 `/api/config` 读取 Supabase 公共配置，直接用浏览器打开 HTML 文件不能使用认证功能。

本地开发前，在启动服务时设置 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`。不要使用或公开 Supabase Secret key、service_role key 或数据库密码。Vercel 部署时，在项目 Settings → Environment Variables 中设置同名变量，并为 Production（以及需要测试时的 Preview/Development）环境启用。

## 项目结构

- `index.html`：网站首页主体、样式和交互逻辑。
- `login.html`、`register.html`、`profile.html`：登录、注册和个人中心页面。
- `server.js`：本地静态预览服务及 Supabase 公共配置接口。
- `api/config.js`：Vercel Function，向浏览器提供 Supabase URL 与公开 Publishable key。
- `supabase.js`、`auth.js`：Supabase 客户端初始化、注册、登录、会话恢复与退出。
- `auth.css`：认证页面共用的样式。
- `test/`：注册、登录、退出及静态页面接口测试。
- `jingdian/`：页面使用的景点与酒店图片素材。

## 测试

```sh
npm test
```

## 本地账号说明

账号和密码由 Supabase Auth 管理。当前项目不需要额外用户资料表；注册时填写的用户名保存在 Auth 用户 metadata 中。若以后将个人资料放入数据库表，必须启用 RLS 并限制用户只能访问自己的记录。

## 更新提示

景点开放情况、预约要求、交通和商户信息可能变化。出行前请以景区及相关官方渠道的最新公告为准。
