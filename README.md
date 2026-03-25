# 派单管理系统

前后端一体的派单/客资管理系统，支持后台管理与移动端领取流程，数据库使用 SQLite。

## 功能概览

- 登录鉴权（NextAuth）
- 用户管理、角色管理、菜单权限
- 套餐管理（新增、导入）
- 单据管理
- 单据新增/编辑/详情/流转记录
- 单据派单、批量派单、批量删除（权限控制）
- 单据导入/客资导入、导出 XLSX
- 地图选点、地址搜索、轨迹查看
- 移动端领取/追加/改约/完结/结束/退回
- 参数配置（Webhook、领取限制开关、精准/客服领取次数）
- PWA 基础支持（manifest + service worker）

## 技术栈

- Next.js 16 (App Router)
- TypeScript
- Prisma + SQLite
- NextAuth
- Tailwind CSS
- xlsx

## 本地启动

```bash
npm install
npm run dev
```

默认访问：

- 登录页: `http://localhost:3000/login`
- 后台: `http://localhost:3000/dashboard`
- 移动端: `http://localhost:3000/mobile`

## 默认账号（以 seed 或当前数据库为准）

- 管理员账号通常为 `admin`
- 密码请以你本地初始化数据为准

## 目录结构

```text
src/app/dashboard   后台页面与服务端动作
src/app/mobile      移动端页面与服务端动作
src/app/api         API 路由
src/components      通用组件与业务组件
src/lib             认证、数据库、系统配置、工具方法
prisma              schema 与初始化脚本
public              静态资源、PWA 文件
```

## 页面展示

当前仓库未附加新的页面截图文件（按你的要求不再截屏）。
可在后续将截图放到 `docs/screenshots/` 后，在 README 中补充：

- 登录页
- 仪表盘
- 单据管理
- 单据详情
- 移动端派单大厅

## 部署说明（简要）

- 建议使用 Node 18+ / 20+
- 生产环境执行 `npm run build && npm run start`
- 反向代理到 3000 端口
- 如需 PWA 与 Web Push，建议启用 HTTPS

## Android App（Capacitor）

项目已接入 Capacitor，可打包 Android APK（壳应用，加载线上地址）。

1. 安装依赖

```bash
npm install
```

2. 可选：指定 APP 加载地址（默认 `https://pd.malanxi.top`）

```bash
export CAPACITOR_SERVER_URL="https://你的域名"
```

3. 同步 Android 工程

```bash
npm run cap:sync
```

4. 打开 Android Studio

```bash
npm run cap:open:android
```

5. 在 Android Studio 中 `Build > Build Bundle(s) / APK(s) > Build APK(s)` 生成安装包。

### Release 签名打包（APK）

已内置 `keystore.properties` 读取逻辑，按下面操作即可生成正式包。

1. 进入 Android 目录并生成签名文件（示例）

```bash
cd android
keytool -genkeypair -v -keystore release-key.jks -alias release -keyalg RSA -keysize 2048 -validity 10000
```

2. 新建 `android/keystore.properties`（可参考 `android/keystore.properties.example`）

```properties
storeFile=release-key.jks
storePassword=你的store密码
keyAlias=release
keyPassword=你的key密码
```

3. 回到项目根目录执行 release 构建

```bash
npm run apk:release
```

4. APK 输出路径

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 仓库

- GitHub: [git@github.com:mxz94/paidan.git](git@github.com:mxz94/paidan.git)
