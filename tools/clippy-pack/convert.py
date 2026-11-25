"""clippy 精灵图集 → 透明 VP9 WebM 的转换核心。

只做纯粹的「图集切片 + 合成」：不读配置文件、不决定宠物包结构，那些在上层做。
必须始终成立：帧时长按元数据原样铺（clippy 的节奏靠可变帧时长），颜色只保留调色板
透明索引，不得引入背景色。
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

WORK = Path(r"D:\pro\_clippy_work")
ATLAS = WORK / "map.png"
META = WORK / "agent.json"
FRAMES_DIR = WORK / "frames"
FFMPEG = r"D:\pro\Electron\aigc-manager\resources\bin\ffmpeg.exe"

# 图集规格（来自 README 与元数据）
FRAME_W, FRAME_H = 124, 93
# 放大倍数：源帧只有 124×93，实际显示约 390 宽，必须放大。
# 源图是 256 色调色板 + 抖动，NEAREST 会把抖动点放大成可见方格；
# LANCZOS 平滑掉抖动又保留回形针的线条边缘，观感最好。
SCALE = 4
UpscaleFilter = Image.LANCZOS
OUT_W, OUT_H = FRAME_W * SCALE, FRAME_H * SCALE


def upscale(img):
    """把 124×93 的帧放大到输出尺寸。

    必须预乘 alpha 再插值：图集里透明像素的 RGB 是品红 (255,0,255)，直接对
    straight-alpha 做插值会把这层品红混进边缘，回形针周围出现紫边。
    预乘后透明像素的 RGB 归零，插值只受影响于不透明邻居，边缘才干净。
    """
    if img.size == (OUT_W, OUT_H):
        return img
    # 拆通道 → 预乘 → 分别放大 → 反预乘
    r, g, b, a = img.split()
    alpha = a.tobytes()
    # 用 PIL 的 ImageChops 做逐通道乘除，避免逐像素 Python 循环
    from PIL import ImageChops

    def premultiply(channel):
        return ImageChops.multiply(channel, a)

    pr = premultiply(r).resize((OUT_W, OUT_H), UpscaleFilter)
    pg = premultiply(g).resize((OUT_W, OUT_H), UpscaleFilter)
    pb = premultiply(b).resize((OUT_W, OUT_H), UpscaleFilter)
    pa = a.resize((OUT_W, OUT_H), UpscaleFilter)

    # 反预乘：分通道除以 alpha；alpha=0 处直接置 0（反正完全透明）
    out = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    pa_data = pa.load()
    dst = out.load()
    for chan_img, index in ((pr, 0), (pg, 1), (pb, 2)):
        src = chan_img.load()
        for y in range(OUT_H):
            for x in range(OUT_W):
                av = pa_data[x, y]
                if av == 0:
                    continue
                v = src[x, y] * 255 // av
                px = list(dst[x, y])
                px[index] = 255 if v > 255 else v
                px[3] = av
                dst[x, y] = tuple(px)
    return out


def load_atlas():
    im = Image.open(ATLAS)
    if im.mode == "P":
        im = im.convert("RGBA")
    return im


def slice_frame(atlas, x, y):
    """按图集偏移切一帧。返回 RGBA Image。"""
    return atlas.crop((x, y, x + FRAME_W, y + FRAME_H))


def blank_frame():
    return Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))


def build_timeline(anim):
    """把一帧列表收成 [(image_or_None, duration_ms)]，合并相邻同图帧。"""
    out = []
    for f in anim["frames"]:
        images = f.get("images") or []
        xy = tuple(images[0]) if images else None
        dur = f.get("duration") or 0
        if dur <= 0:
            continue
        if out and out[-1][0] == xy:
            out[-1] = (xy, out[-1][1] + dur)
        else:
            out.append((xy, dur))
    return out


def render_animation(name, anim, atlas, out_dir):
    timeline = build_timeline(anim)
    if not timeline:
        return None

    # 每段单独一个临时目录避免文件名冲突
    tmp = FRAMES_DIR / name
    tmp.mkdir(parents=True, exist_ok=True)

    lines = []
    for index, (xy, dur) in enumerate(timeline):
        img = blank_frame() if xy is None else slice_frame(atlas, xy[0], xy[1])
        big = upscale(img)
        png = tmp / f"{index:03d}.png"
        big.save(png)
        lines.append(f"file '{png.as_posix()}'")
        lines.append(f"duration {dur / 1000:.3f}")

    # concat 要求最后一帧重复一次，否则末帧时长被丢弃
    if timeline:
        last_xy = timeline[-1][0]
        last_png = tmp / f"{len(timeline) - 1:03d}.png"
        lines.append(f"file '{last_png.as_posix()}'")

    listfile = tmp / "list.txt"
    listfile.write_text("\n".join(lines) + "\n", encoding="utf-8")

    target = out_dir / f"{name}.webm"
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", str(listfile),
        "-vf", f"format=yuva420p",
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-b:v", "0", "-crf", "32",
        "-auto-alt-ref", "0",
        "-an",
        str(target),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return {"name": name, "error": result.stderr[-800:]}
    return {
        "name": name,
        "frames": len(timeline),
        "bytes": target.stat().st_size,
        "durationMs": sum(d for _, d in timeline),
    }


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else (WORK / "out")
    only = sys.argv[2] if len(sys.argv) > 2 else None
    out_dir.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    atlas = load_atlas()
    meta = json.loads(META.read_text(encoding="utf-8"))

    results = []
    for name, anim in meta["animations"].items():
        if only and name != only:
            continue
        r = render_animation(name, anim, atlas, out_dir)
        if r:
            results.append(r)
            if "error" in r:
                print(f"FAIL {r['name']}: {r['error']}")
            else:
                print(f"{r['name']:<22} {r['frames']:>3}f {r['durationMs']:>6}ms {r['bytes']/1024:>8.1f} KB")
    total = sum(r.get("bytes", 0) for r in results)
    print(f"\n{len(results)} animations, {total/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
