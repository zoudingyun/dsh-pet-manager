"""把已转好的 clippy webm 装成一个 dsh-pet 宠物包。

只做「动画名 → 槽位」的映射与文件落位，不改 dsh-pet 的加载逻辑：
产物必须是 pet/<前缀>-config.json + pet/<前缀>-animation/ 这一对。
必须始终成立：animations 段写全（idle/turn/drag/clicks/moves/categories/events/balance），
缺字段会被宿主判为配置错误而整只跳过。
"""
import json
import shutil
from pathlib import Path

WORK = Path(r"D:\pro\_clippy_work")
OUT = WORK / "out2"
PREFIX = "clippy"

# 目标：dsh-pet 的用户数据根下的 pet/ 目录
DEST_ROOT = Path(r"C:\Users\Tom-G\.dsh\dsh-pet-manager\pet")
ANIM_DIR = DEST_ROOT / f"{PREFIX}-animation"
CONFIG = DEST_ROOT / f"{PREFIX}-config.json"

# ── 槽位映射：dsh-pet 要的动画名 → clippy 原始动画名 ──
IDLE = ["Idle1_1", "IdleSideToSide", "IdleHeadScratch", "IdleFingerTap", "IdleEyeBrowRaise", "LookRight", "LookLeft"]
TURN = ["LookRight", "LookLeft", "LookUpRight", "LookUpLeft", "LookDownRight", "LookDownLeft"]
DRAG = ["GetAttention", "Alert"]
CLICKS = ["Congratulate", "Greeting", "Hearing_1", "GestureUp", "Wave"]

# 随机动作分类：用 clippy 的表演类动画
CATEGORIES = [
    {"id": "工作", "weight": 22, "actions": ["Writing", "Print", "Processing", "SendMail", "Save", "GetTechy", "Searching", "CheckingSomething"]},
    {"id": "动作", "weight": 20, "actions": ["Wave", "GestureUp", "GestureDown", "GestureLeft", "GestureRight", "GetWizardy", "GetArtsy"]},
    {"id": "表情", "weight": 18, "actions": ["Congratulate", "Greeting", "Hearing_1", "Alert", "Explain", "Thinking"]},
    {"id": "发呆", "weight": 20, "actions": ["IdleAtom", "IdleRopePile", "IdleSnooze", "RestPose", "EmptyTrash", "GoodBye"]},
]

# 事件档位（顺序即档位，index 固定不可打乱）
EVENTS = {
    # 余额：p 从 0 到 100 分 6 档
    "balance": ["Congratulate", "Greeting", "Hearing_1", "Alert", "Explain", "EmptyTrash"],
    # 碎碎念：到点随机抽一段
    "whisper": ["Hearing_1", "Thinking", "Explain"],
    # 工作状态：thinking / working / result / waiting / success / error
    "workStatus": ["Thinking", "Processing", "Searching", "Hearing_1", "Congratulate", "Alert"],
}

# 睡觉三连：clippy 原文有 Hide / IdleSnooze / Show，正好是「消失→打盹→出现」，
# 语义上等价于入睡→循环→醒来，直接借用，不必另造素材。
SLEEP = [{"start": ["Hide"], "loop": ["IdleSnooze"], "end": ["Show"]}]

# 宠物包顶层还要的权重（idle+turn+move+分类合计 = 100）
ANIMATION_WEIGHTS = {"idle": 20, "turn": 0, "move": 0}

# 画框固定 16:9，而 clippy 素材是 4:3（124×93 等比例放大）：contain 会按高度贴合、
# 宽度只剩 size×0.75，所以要给比原宠物更大的 size 才能有相近的观感体量。
PET_SIZE = 520


def main():
    # 1) 只拷贝被引用到的动画（43 段里没用到的就不进包，省体积）
    used = set()
    used.update(IDLE, TURN, DRAG, CLICKS)
    for c in CATEGORIES:
        used.update(c["actions"])
    for pool in EVENTS.values():
        used.update(pool)
    for s in SLEEP:
        for key in ("start", "loop", "end"):
            used.update(s[key])

    ANIM_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    missing = []
    total = 0
    for name in sorted(used):
        src = OUT / f"{name}.webm"
        if not src.exists():
            missing.append(name)
            continue
        dst = ANIM_DIR / f"{name}.webm"
        shutil.copy2(src, dst)
        copied += 1
        total += dst.stat().st_size

    config = {
        "pets": [
            {
                "id": "clippy",
                "name": "Clippy",
                "size": PET_SIZE,
                "balanceEnabled": True,
                "whisperEnabled": True,
                "workStatusEnabled": True,
                "fixedEnabled": False,
                "display": "both",
                "position": {"corner": "bottom-right", "marginX": 32, "marginY": 120},
            }
        ],
        "animations": {
            "idle": IDLE,
            "turn": TURN,
            "drag": DRAG,
            "clicks": CLICKS,
            "moves": {
                "default": {"minDist": 60, "maxDist": 240, "margin": 20, "leadSec": 2, "tailSec": 2},
                "actions": [],
            },
            "categories": CATEGORIES,
            "events": EVENTS,
            "sleep": SLEEP,
        },
        "animationWeights": ANIMATION_WEIGHTS,
        "eventsRefreshSec": {"balance": 1800, "whisper": 300, "sleepTalk": 60},
        "whisperPrompt": "你是微软 Office 里的回形针助手 Clippy，会时不时碎碎念一句。说话要俏皮、简短（20字以内），带点老派助手的殷勤劲儿，不要解释你自己，不要提你是AI。",
        "chatPersona": "你是 Clippy，微软 Office 的经典回形针助手。你热心、有点啰嗦、偶尔自作聪明，总想帮忙但常常帮倒忙。说话简短俏皮。",
    }

    CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"copied {copied} animations, {total/1024/1024:.1f} MB")
    if missing:
        print("MISSING:", ", ".join(missing))
    print(f"config: {CONFIG}")
    print(f"anim dir: {ANIM_DIR}")

    # 2) 权重自检
    cat_sum = sum(c["weight"] for c in CATEGORIES)
    total_w = ANIMATION_WEIGHTS["idle"] + ANIMATION_WEIGHTS["turn"] + ANIMATION_WEIGHTS["move"] + cat_sum
    print(f"weight check: idle+turn+move={sum(ANIMATION_WEIGHTS.values())} + categories={cat_sum} = {total_w}")


if __name__ == "__main__":
    main()
