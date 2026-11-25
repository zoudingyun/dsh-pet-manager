# Clippy 桌宠包：从精灵图集转成 dsh-pet 素材

把微软 Office 的回形针助手 Clippy 接进 dsh-pet-manager，做成一只可切换的桌宠。

## 为什么不是直接嵌入 clippy.html

`clippy.html` 是 3348×3162 的精灵图集配一个自定义播放器，而 dsh-pet 的渲染管线
写死是 `<video>`：浏览器半侧 `src/client/pet/card/view.ts` 硬编码两个 `<video>`，
桌面端 `runtime/electron-helper/playback.js` 用 `el.src = ... .webm`。宠物包只认视频文件。

要把图集当原生精灵插入，得同时改浏览器与桌面两套播放器，并把「一个名字 = 一个文件」
的动画抽象改成「一个名字 = 图集 + 帧序列」——这是架构级改动，会波及现有 114 段动画。

因此选择一次性把 43 段动画转成透明 VP9 WebM。转换后 Clippy 就是标准宠物包，
拖拽抛掷、跨屏飞行、点击穿透、碎碎念、余额联动、待办提醒、右键菜单全部自然可用。

## 流程

```
clippyjs 图集 (map.png) + 元数据 (agent.json)
        ↓  extract_clippy.cjs   从 clippyjs 模块里抽出 base64 图集与动画元数据
        ↓  convert.py           逐帧切片 → 预乘 alpha 放大 → 按原始帧时长拼 concat
        ↓  pack.py              映射到 dsh-pet 的动画槽位，写入 pet/ 目录
   pet/clippy-config.json + pet/clippy-animation/*.webm
```

## 两个必须做对的地方

**1. 帧时长不能统一帧率。** Clippy 的节奏靠可变帧时长：22 种不同时长，
最常见 100ms（1057 帧），最长 2400ms，最短 10ms。统一按 25fps 铺会毁掉动作节奏。
转换用 concat demuxer 为每帧单独声明 `duration`。

**2. 必须预乘 alpha 再放大。** 图集里透明像素的 RGB 是品红 `(255,0,255)`。
直接对 straight-alpha 做 LANCZOS 插值会把品红混进边缘，回形针周围出现紫边。
先拆通道乘 alpha、插值、再除以 alpha，透明区 RGB 归零，边缘才干净。

放大滤波选 LANCZOS 而非 NEAREST：源图是 256 色调色板 + 抖动，NEAREST 会把抖动点
放大成可见方格；LANCZOS 平滑掉抖动又保留线条边缘。

## 验证 alpha 的坑

VP9 的 alpha 存在独立的隐藏流里。`ffprobe` 只报主流的 `yuv420p`，
用 ffmpeg 默认的 native vp9 解码器解出来是「完全不透明 + 品红背景」的假象。

必须显式指定 libvpx-vp9 解码器才能拿到真正的 alpha：

```bash
ffmpeg -c:v libvpx-vp9 -i out.webm -vf "select=eq(n\,5)" -vframes 1 -pix_fmt rgba frame.png
```

`verify_alpha.py` 就是按这个口径写的，判据是「透明像素占比 ≈ 源图」。

## 槽位映射

| dsh-pet 槽位 | Clippy 动画 |
|---|---|
| `idle` | Idle1_1, IdleSideToSide, IdleHeadScratch, IdleFingerTap, IdleEyeBrowRaise, LookRight, LookLeft |
| `turn` | LookRight, LookLeft, LookUpRight, LookUpLeft, LookDownRight, LookDownLeft |
| `drag` | GetAttention, Alert |
| `clicks` | Congratulate, Greeting, Hearing_1, GestureUp, Wave |
| `categories.工作` | Writing, Print, Processing, SendMail, Save, GetTechy, Searching, CheckingSomething |
| `categories.动作` | Wave, GestureUp, GestureDown, GestureLeft, GestureRight, GetWizardy, GetArtsy |
| `categories.表情` | Congratulate, Greeting, Hearing_1, Alert, Explain, Thinking |
| `categories.发呆` | IdleAtom, IdleRopePile, IdleSnooze, RestPose, EmptyTrash, GoodBye |
| `events.balance` | 6 档，从「钱袋满溢」到「分文不剩」 |
| `events.workStatus` | thinking / working / result / waiting / success / error |
| `events.whisper` | Hearing_1, Thinking, Explain |
| `sleep` | Hide（入睡）→ IdleSnooze（打盹循环）→ Show（醒来） |

权重：`idle` 20 + 四个分类合计 80 = 100，符合宿主校验。

## 尺寸

画框固定 16:9，而 Clippy 素材是 4:3（124×93 等比放大到 496×372）。
`object-fit: contain` 会按高度贴合，显示宽度只有画框宽的 75%。
因此 `size` 设为 520（原宠物 main 是 462），实际观感体量才接近。

## 已知取舍

- **随机分支丢失**：Clippy 原文 21 段动画带 `branching` 权重做随机分支，
  转成视频后变成固定序列。高层仍由 dsh-pet 的分类随机池提供随机性。
- **音效丢失**：Clippy 的 15 个音效不进视频。dsh-pet 有自己的点击音效机制。
- **纸片背景保留**：Clippy 原素材自带一张灰纸与阴影，这是原作设计（回形针夹在纸上），
  并非转换瑕疵。对比 `final-vs-source.png` 可见源图本来就是这样。

## 复现

```bash
node  extract_clippy.cjs                      # 抽图集与元数据
python convert.py  ./out2                     # 转 43 段 webm（约 9 MB）
python pack.py                                # 装成宠物包
```

需要 `libvpx-vp9` 的 ffmpeg（本机用 `D:\pro\Electron\aigc-manager\resources\bin\ffmpeg.exe`）
与 Pillow。
