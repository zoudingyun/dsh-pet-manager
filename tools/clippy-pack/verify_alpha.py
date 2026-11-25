"""验证 webm 的 alpha 是否真的存在。

必须用 libvpx-vp9 解码器：VP9 的 alpha 存在独立的隐藏流里，ffmpeg 默认的
native vp9 解码器不合成它，会读出「全不透明 + 品红背景」的假象。
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

FFMPEG = r"D:\pro\Electron\aigc-manager\resources\bin\ffmpeg.exe"


def probe(path: Path, frame: int = 5) -> dict:
    out = path.with_suffix(".probe.png")
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
         "-c:v", "libvpx-vp9", "-i", str(path),
         "-vf", f"select=eq(n\\,{frame})", "-vframes", "1",
         "-pix_fmt", "rgba", str(out)],
        check=True,
    )
    im = Image.open(out).convert("RGBA")
    w, h = im.size
    alpha = im.getchannel("A")
    hist = alpha.histogram()
    total = w * h
    out.unlink(missing_ok=True)
    return {
        "size": (w, h),
        "corner": im.getpixel((0, 0)),
        "alphaRange": alpha.getextrema(),
        "transparentPct": hist[0] / total,
        "opaquePct": hist[255] / total,
    }


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        p = Path(arg)
        try:
            r = probe(p)
            print(f"{p.name:<24} {r['size'][0]}x{r['size'][1]} "
                  f"corner_alpha={r['corner'][3]:>3} "
                  f"range={r['alphaRange']} "
                  f"transparent={r['transparentPct']:.1%} opaque={r['opaquePct']:.1%}")
        except Exception as e:
            print(f"{p.name:<24} FAIL {e}")
