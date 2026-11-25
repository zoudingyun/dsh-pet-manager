# dsh-pet-manager

给 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 桌宠引擎做**管理**的 DSH 插件。

它不含任何渲染、动画、桌面窗口——那些都属于 dsh-pet 本体。本插件只做一件事：
**让你在设置页里给 dsh-pet 增删宠物包、开关单只宠物。**

## 为什么是两个插件

| 插件 | 职责 |
|---|---|
| `dsh-pet` | 运行时：播放 webm、拖拽抛掷、气泡、桌面透明窗口、余额/待办联动 |
| `dsh-pet-manager` | 管理器：列出 `pet/` 下的宠物包、启用/停用、删除、导入 |

管理器**不 import 运行时的任何模块**，只通过它公开的 `/dsh-pet-7340` 路由通信。
这样两者可以独立升级：运行时更新不会碰管理器，管理器出错也不会让宠物停止渲染。

## 用起来

装好两个插件后，打开 **设置 → 桌宠管理**：

- **宠物包列表**：显示每个包的前缀、动画段数、包含的宠物
- **启用 / 停用**：切换该宠物的 `display`（`both` ↔ `none`）
- **删除**：连同素材目录一起删除（不可撤销）
- **导入**：填一个本地目录路径，该目录需包含 `<前缀>-config.json`，可带同名 `<前缀>-animation/`

每次改完都会自动请运行时重载，桌宠窗口按新配置重建。

## 宠物包长什么样

```
$DSH_HOME/dsh-pet/pet/
├── clippy-config.json      ← 前缀 clippy
└── clippy-animation/
    ├── Idle1_1.webm
    └── ...
```

配置格式见 dsh-pet 的 `CONFIG.md`。动画必须是透明带 alpha 的 `.webm`（VP9-alpha）
或 `.mov`（HEVC-alpha，macOS）。

想做一个自己的宠物包，见 [`tools/clippy-pack`](tools/clippy-pack) —— 它把
clippyjs 的精灵图集转成 dsh-pet 素材，整套流程可复用。

## 源码地图

| 文件 | 职责 |
|---|---|
| `src/host/index.ts` | 插件入口：注册管理器路由 |
| `src/host/routes.ts` | 四个动作的 HTTP 层：packs / remove / import / toggle |
| `src/host/pet-packs.ts` | 只读扫描 `pet/` 目录，产出可展示清单 |
| `src/host/operations.ts` | 写操作：删除、导入、改 display |
| `src/host/jsonc.ts` | 最小 JSONC 解析（剥注释与尾逗号） |
| `src/host/reload-runtime.ts` | 回调运行时的 `/reload` |
| `src/client/app.ts` | 浏览器半侧装配：注册设置页区块 |
| `src/client/pack-card.ts` | 设置页卡片：列表与操作 |
| `src/client/api.ts` | 调自己路由段的 HTTP 客户端 |
| `src/client/styles.ts` | 卡片样式（`dpm-` 前缀，与运行时 `dsh-pet-` 不冲突） |
| `src/shared/constants.ts` | 路由段与目录名常量 |
| `src/shared/types.ts` | 两端共用的数据契约 |

## 安全边界

- **前缀白名单**：只接受 `[A-Za-z0-9_-]+`，拒绝 `.` / `..`
- **删除前解析真实路径**并校验仍在 `pet/` 内，防止符号链接或拼接逃逸
- **导入不覆盖**：同名包已存在直接拒绝，避免静默毁掉用户已有的宠物
- **写配置用临时文件 + rename**，不留下半截文件

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build      # 产出 lib/index.js 与 lib/client.js
```

装进 DSH：

```bash
dsh plugin --profile <名> add file:D:/path/to/dsh-pet-manager/dsh-pet-manager
```

> `pnpm-workspace.yaml` 里的 `rolldown` override 不是可选项：tsdown 0.8.x 对
> rolldown 版本有硬约束，去掉它构建会因 `rolldown/experimental` 缺导出而失败。

## 许可

MIT。dsh-pet 与其素材的许可见上游仓库。
