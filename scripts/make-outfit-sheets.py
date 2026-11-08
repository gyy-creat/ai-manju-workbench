"""生成服装示意卡（assets/ref/outfit-*.png）。

画风与三视图设定稿统一：纸色底 + 墨线 + flat lay 服装平铺。
真实项目里换成该套服装的实拍/AI 图，覆盖同名文件即可。
用法：python scripts/make-outfit-sheets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 480, 640
PAPER = (242, 236, 225)
INK = (26, 27, 31)
LINE = (196, 188, 174)
MUTED = (140, 134, 124)
ACCENT = (224, 83, 58)

FONT_DIR = "C:/Windows/Fonts"


def font(size, bold=False):
    for n in (["msyhbd.ttc", "msyh.ttc"] if bold else ["msyh.ttc", "simhei.ttf"]):
        p = os.path.join(FONT_DIR, n)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


F_NAME = font(26, True)
F_SEQ = font(19, True)
F_BODY = font(15)
F_SMALL = font(12)

SHADE = lambda c, k=0.9: tuple(int(v * k) for v in c)


def flat_lay(d, cx, cy, main, inner, kind="jacket"):
    """平铺服装：外套/衣身 + 袖 + 内搭领口。kind 决定是否有开襟与腰带。"""
    hw = 128          # 半宽
    top = cy - 150
    bottom = cy + 150
    # 衣身
    d.polygon(
        [(cx - hw, top + 10), (cx + hw, top + 10), (cx + hw - 12, bottom), (cx - hw + 12, bottom)],
        fill=main, outline=INK,
    )
    # 袖
    d.polygon([(cx - hw, top + 10), (cx - hw - 46, top + 96), (cx - hw - 22, top + 118), (cx - hw + 6, top + 46)],
              fill=SHADE(main, 0.88), outline=INK)
    d.polygon([(cx + hw, top + 10), (cx + hw + 46, top + 96), (cx + hw + 22, top + 118), (cx + hw - 6, top + 46)],
              fill=SHADE(main, 0.88), outline=INK)

    if kind == "jacket":
        # 内搭（V 领 T 恤）
        d.polygon([(cx - 40, top + 8), (cx + 40, top + 8), (cx, top + 96)], fill=inner, outline=INK)
        # 开襟线 + 纽扣
        d.line([(cx, top + 96), (cx, bottom - 4)], fill=SHADE(main, 0.55), width=2)
        for y in range(top + 116, bottom - 20, 46):
            d.ellipse([cx - 3, y - 3, cx + 3, y + 3], fill=SHADE(main, 0.5))
        # 腰带
        d.rectangle([cx - hw + 8, bottom - 62, cx + hw - 8, bottom - 44], fill=SHADE(main, 0.62), outline=INK)
    else:
        # 高领 / 无开襟
        d.arc([cx - 44, top - 6, cx + 44, top + 52], 200, 340, fill=INK, width=3)
        d.ellipse([cx - 44, top - 2, cx + 44, top + 44], outline=INK, width=2)
        d.polygon([(cx - hw + 10, top + 60), (cx + hw - 10, top + 60), (cx + hw - 14, bottom - 6), (cx - hw + 14, bottom - 6)],
                  fill=None, outline=None)
        # 一颗扣子作点缀
        d.ellipse([cx - 4, top + 120, cx + 4, top + 128], fill=SHADE(main, 0.5))


def card(out_path, name, seq, title, scene, main, inner, kind="jacket"):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=LINE, width=2)

    # 顶部：名字 + 序列号
    d.text((22, 20), name, font=F_NAME, fill=INK)
    # 序列号徽章不在图上画——界面上图片下方已有可编辑的号牌，画两遍会重复
    d.line([(22, 68), (W - 22, 68)], fill=LINE, width=1)

    # 主体：服装平铺
    flat_lay(d, W // 2, 330, main, inner, kind)

    # 底部：名称 + 场景
    d.line([(22, 528), (W - 22, 528)], fill=LINE, width=1)
    d.text((22, 544), title, font=F_BODY, fill=INK)
    d.text((22, 570), scene, font=F_SMALL, fill=MUTED)
    d.text((22, 600), "服装卡 · 序列号在分镜里引用", font=F_SMALL, fill=MUTED)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, optimize=True)
    print("outfit ->", os.path.basename(out_path), os.path.getsize(out_path), "bytes")


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "assets", "ref")
    cards = [
        ("shen-O1.png", "沈砚", "O1", "工厂夜 · 深灰旧工装", "第1-3集 · 老街工坊",
         (74, 77, 82), (28, 29, 33), "jacket"),
        ("shen-O2.png", "沈砚", "O2", "相亲 · 白衬衫 + 深蓝外套", "第6集 · 茶馆雅间",
         (44, 58, 82), (232, 228, 220), "jacket"),
        ("liu-O1.png", "柳素心", "O1", "退婚现场 · 米白高领 + 驼色长外套", "第1集 · 柳家堂屋",
         (176, 141, 99), (221, 212, 196), "coat"),
    ]
    for fn, name, seq, title, scene, main, inner, kind in cards:
        card(os.path.join(out, fn), name, seq, title, scene, main, inner, kind)
