"""生成角色三视图设定稿占位图（assets/ref/*.png）。

画风：纸色底 + 墨线 + 中轴虚线，模拟漫画设定稿。真实项目里换成 AI 出的图即可。
用法：python scripts/make-ref-sheets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 540, 700
PAPER = (242, 236, 225)
INK = (26, 27, 31)
LINE = (196, 188, 174)
MUTED = (140, 134, 124)
ACCENT = (224, 83, 58)

FONT_DIR = "C:/Windows/Fonts"


def font(size, bold=False):
    names = ["msyhbd.ttc", "msyh.ttc"] if bold else ["msyh.ttc", "simhei.ttf"]
    for n in names:
        p = os.path.join(FONT_DIR, n)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


F_NAME = font(30, True)
F_TAG = font(15)
F_SMALL = font(13)
F_TINY = font(11)


def dashed_v(d, x, y0, y1, dash=7, gap=6):
    y = y0
    while y < y1:
        d.line([(x, y), (x, min(y + dash, y1))], fill=LINE, width=1)
        y += dash + gap


def figure(d, cx, base_y, view, width=1.0):
    """极简人形：头 + 颈 + 肩 + 躯干 + 手臂 + 腿。view 取 front/side/back。"""
    head_r = int(30 * width)
    head_cy = base_y - 300
    # 头
    if view == "side":
        d.ellipse([cx - head_r + 4, head_cy - head_r, cx + head_r + 4, head_cy + head_r], outline=INK, width=2)
        # 侧面鼻梁
        d.line([(cx + head_r + 1, head_cy - 2), (cx + head_r + 12, head_cy + 9), (cx + head_r + 1, head_cy + 15)], fill=INK, width=2)
    else:
        d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], outline=INK, width=2)
        if view == "front":
            d.line([(cx - 11, head_cy - 5), (cx - 4, head_cy - 5)], fill=INK, width=2)
            d.line([(cx + 4, head_cy - 5), (cx + 11, head_cy - 5)], fill=INK, width=2)
            d.line([(cx - 8, head_cy + 14), (cx + 8, head_cy + 14)], fill=INK, width=2)
        else:
            # 背面：一条后脑中线
            d.line([(cx, head_cy - head_r + 5), (cx, head_cy + head_r - 5)], fill=LINE, width=1)

    # 颈
    neck_y = head_cy + head_r
    d.line([(cx - 8, neck_y), (cx - 8, neck_y + 14)], fill=INK, width=2)
    d.line([(cx + 8, neck_y), (cx + 8, neck_y + 14)], fill=INK, width=2)

    # 肩 + 躯干
    sh_y = neck_y + 14
    sh_w = int(40 * width)
    hip_y = sh_y + 150
    hip_w = int(24 * width)
    d.line([(cx - sh_w, sh_y + 8), (cx, sh_y)], fill=INK, width=2)
    d.line([(cx, sh_y), (cx + sh_w, sh_y + 8)], fill=INK, width=2)
    d.line([(cx - sh_w, sh_y + 8), (cx - hip_w, hip_y)], fill=INK, width=2)
    d.line([(cx + sh_w, sh_y + 8), (cx + hip_w, hip_y)], fill=INK, width=2)
    d.line([(cx - hip_w, hip_y), (cx + hip_w, hip_y)], fill=INK, width=2)

    # 手臂
    elbow = sh_y + 78
    wrist = sh_y + 136
    if view == "front":
        for s in (-1, 1):
            d.line([(cx + s * sh_w, sh_y + 10), (cx + s * (sh_w + 11), elbow)], fill=INK, width=2)
            d.line([(cx + s * (sh_w + 11), elbow), (cx + s * (sh_w + 5), wrist)], fill=INK, width=2)
    elif view == "side":
        d.line([(cx + sh_w - 8, sh_y + 10), (cx + sh_w + 4, elbow)], fill=INK, width=2)
        d.line([(cx + sh_w + 4, elbow), (cx + sh_w - 2, wrist)], fill=INK, width=2)
        d.line([(cx - sh_w + 8, sh_y + 10), (cx - sh_w - 4, wrist + 6)], fill=INK, width=1)
    else:
        for s in (-1, 1):
            d.line([(cx + s * sh_w, sh_y + 10), (cx + s * (sh_w + 7), wrist + 4)], fill=INK, width=2)

    # 腿
    knee = hip_y + 52
    foot = base_y
    if view == "side":
        d.line([(cx - 7, hip_y), (cx - 11, knee)], fill=INK, width=2)
        d.line([(cx - 11, knee), (cx - 2, foot)], fill=INK, width=2)
        d.line([(cx + 7, hip_y), (cx + 11, knee)], fill=INK, width=2)
        d.line([(cx + 11, knee), (cx + 20, foot)], fill=INK, width=2)
    else:
        for s in (-1, 1):
            d.line([(cx + s * 11, hip_y), (cx + s * 14, knee)], fill=INK, width=2)
            d.line([(cx + s * 14, knee), (cx + s * 16, foot)], fill=INK, width=2)


def sheet(name, role, anchor, tag, out_path, width=1.0):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=LINE, width=2)

    # 顶端标题条
    d.text((24, 22), name, font=F_NAME, fill=INK)
    d.text((24 + F_NAME.getlength(name) + 12, 36), role, font=F_TAG, fill=ACCENT)
    right = "三视图 v01"
    d.text((W - 24 - F_TAG.getlength(right), 34), right, font=F_TAG, fill=MUTED)
    d.line([(24, 76), (W - 24, 76)], fill=LINE, width=1)

    views = [("正面", "front"), ("侧面", "side"), ("背面", "back")]
    col_w = (W - 48) / 3
    base_y = 500
    for i, (label, view) in enumerate(views):
        cx = int(24 + col_w * (i + 0.5))
        figure(d, cx, base_y, view, width)
        d.text((cx - F_SMALL.getlength(label) / 2, base_y + 20), label, font=F_SMALL, fill=MUTED)
        if i > 0:
            dashed_v(d, int(24 + col_w * i), 96, 560)

    # 底部锚定
    d.line([(24, 596), (W - 24, 596)], fill=LINE, width=1)
    d.text((24, 612), tag, font=F_SMALL, fill=MUTED)
    y = 638
    for line in anchor.split(", "):
        if y > 670:
            break
        d.text((24, y), "· " + line, font=F_TINY, fill=MUTED)
        y += 16

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, optimize=True)
    print("写入", out_path, os.path.getsize(out_path), "bytes")


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "assets", "ref")
    sheet(
        "沈砚", "主角 · 27岁", "lean build, sharp jaw, tired but steady eyes, short messy black hair",
        "国漫厚涂 · 深灰旧工装 + 洗白的黑 T", os.path.join(out, "shen_ref_v01.png"), width=1.0,
    )
    sheet(
        "柳素心", "对手 · 25岁", "slim figure, cold narrow eyes, long straight black hair, jade earring",
        "国漫厚涂 · 素色旗袍外搭旧西装", os.path.join(out, "liu_ref_v01.png"), width=0.92,
    )
    sheet(
        "周伯", "助攻 · 58岁", "stooped back, deep wrinkles, grey stubble, worn cotton jacket",
        "国漫厚涂 · 灰棉袄 + 旧灯笼", os.path.join(out, "zhou_ref_v01.png"), width=1.0,
    )
