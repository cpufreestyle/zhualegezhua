# 抓了个抓

## 游戏简介

参照 Pokémon GO 核心玩法的 AR 捕捉微信小游戏。摄像头扫描桌面/地面，Q 版精灵出现在你的房间里，滑动扔球捕捉，收集 8 只精灵图鉴。单机可玩，无内购。

## 玩法

- 一局 3~5 只精灵，球尽局终。
- 滑动扔球：扔出时屏幕收缩瞄准圈，按住球落在 Excellent / Great / Nice 区间获得加成。
- 捕捉概率 = 基础率 × 圈加成，稀有度分 常见 / 稀有 / 传说。
- 图鉴每新捕获一种 +15 球，每日分享 +20 球。
- 三种球：普通球 ×1.0 / 大师球 ×1.6（图鉴全收集 +30、捕获传说 +1）/ 甜甜圈球（命中冻结精灵 5 秒；每日任务与出手彩蛋获取）。
- 每日任务：捕获 3 只 / 命中 2 次 Excellent / 分享 1 次，结算页手动领取奖励（甜甜圈球/球）。
- 捕捉瞬间可拍照分享（canvas 合成截图），好友通过链接进入 +10 球新手礼（一次性）。

## AR 模式

- 支持 `wx.createVKSession` v2 平面检测的设备走真 AR：精灵贴在你锁定的桌面/地面上。
- 不支持的设备自动降级"经典模式"（陀螺仪虚拟房间），UI 右上角有标识。
- 开发者工具内自动走经典模式。

## 本地运行

微信开发者工具 → 导入项目目录 `zhualegezhua/` → AppID 选"测试号"（项目已内置游戏测试号 AppID，正式提审前替换为自行注册的 AppID）。

npm 不参与构建（three.js 已 vendored 到 `libs/`）。

## 开发

- `npm test`：Node 内置 test runner，纯逻辑单测 45 个。
- `npm run check`：模块冒烟。
- 数值全部在 `js/config.js`（经济/捕捉率/瞄准圈/手感/生成权重），调参不用碰逻辑。
- 精灵模型清单在 `js/render/glb_manifest.js`（CDN GLB，主包不含模型）。

## 技术栈

- 微信小游戏原生（无引擎框架）+ threejs-miniprogram r108（vendored）+ `wx.createVKSession` v2。
- 架构：`ar_context.js` 统一真/伪 AR 接口，游戏层不感知模式差异。
- 纯逻辑模块（概率/经济/刷怪/存档）不依赖 wx 环境，Node 双跑可测。

## 提审注意

- 类目 = 休闲游戏；无内购免版号。
- VKSession 相机用途需在隐私接口声明（用途：AR 识别平面放置精灵）。
- 分享文案合规。
- 首包不含 3D 模型（全部 CDN 加载）。
- 小程序后台需将 GLB 所在域名（js/render/glb_manifest.js 中的 CDN 域名，当前为 tuanjie-ai-prd.tos-cn-shanghai.volces.com）加入 downloadFile 合法域名；开发工具因 urlCheck:false 不告警，真机未加域名时全部回落占位体

## 目录结构

```
zhualegezhua/
├── game.js                 # 入口：生命周期、主循环、场景装配
├── game.json               # 小游戏配置（竖屏、隐藏状态栏）
├── project.config.json     # 开发者工具项目配置（AppID 等）
├── js/
│   ├── config.js           # 全部数值（经济/捕捉率/瞄准圈/手感/生成权重）
│   ├── ar/                 # ar_context 统一真/伪 AR 接口、VKSession、陀螺仪相机
│   ├── core/               # events.js 轻量事件总线
│   ├── game/               # 玩法：投掷、弹道、瞄准圈、捕捉判定、精灵 AI
│   ├── meta/               # 系统：经济、刷怪、存档
│   ├── render/             # 渲染：three 适配、GLB 加载、精灵与模型清单
│   └── ui/                 # 屏幕界面与特效
├── libs/                   # threejs-miniprogram r108 + GLTFLoader（vendored）
├── tests/                  # 纯逻辑单测（Node --test）
└── scripts/check.js        # 模块冒烟检查
```
