# -*- coding: utf-8 -*-
"""生成资产库示意素材（三视图 / 表情 / 配饰 / 场景空镜）。
纸色底 + 墨线，和项目画风一致；真实项目直接用自己的图覆盖同名文件。
"""
from PIL import Image, ImageDraw, ImageFont
import os

PAPER = (239, 232, 219)
INK = (42, 47, 58)
INK_L = (143, 138, 128)
VERM = (224, 83, 58)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'ref')
os.makedirs(OUT, exist_ok=True)


def font(sz, bold=False):
    for p in (r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc',
              r'C:\Windows\Fonts\simhei.ttf', r'C:\Windows\Fonts\simsun.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def new(w, h, grain=True):
    im = Image.new('RGB', (w, h), PAPER)
    d = ImageDraw.Draw(im)
    # 细网格，模拟画纸
    if grain:
        for x in range(0, w, 24):
            d.line([(x, 0), (x, h)], fill=(228, 220, 206))
        for y in range(0, h, 24):
            d.line([(0, y), (w, y)], fill=(228, 220, 206))
    return im, d


def silhouette(d, cx, top, h, w, facing='front'):
    """极简人形：头 + 颈 + 躯干 + 手臂 + 腿，全部落在 top..top+h 之间。"""
    hr = h * 0.072
    d.ellipse([cx - hr, top, cx + hr, top + hr * 2], outline=INK, width=3)
    neck_y = top + hr * 2
    sh_y = neck_y + h * 0.035
    d.line([(cx - hr * 0.34, neck_y), (cx - hr * 0.34, sh_y)], fill=INK, width=3)
    d.line([(cx + hr * 0.34, neck_y), (cx + hr * 0.34, sh_y)], fill=INK, width=3)

    wide = facing != 'side'
    sh = w * (0.30 if wide else 0.16)
    waist_y = sh_y + h * 0.30
    hip_y = waist_y + h * 0.09
    ws = w * (0.20 if wide else 0.12)

    # 躯干两段
    d.polygon([(cx - sh, sh_y), (cx + sh, sh_y), (cx + ws, waist_y), (cx - ws, waist_y)], outline=INK, width=3)
    d.polygon([(cx - ws, waist_y), (cx + ws, waist_y), (cx + ws * 0.96, hip_y), (cx - ws * 0.96, hip_y)], outline=INK, width=3)

    # 手臂：肩 → 肘 → 腕
    for sg in (-1, 1):
        ex = cx + sg * sh * 1.16
        d.line([(cx + sg * sh * 0.9, sh_y + h * 0.02), (ex, waist_y + h * 0.02)], fill=INK, width=3)
        d.line([(ex, waist_y + h * 0.02), (cx + sg * ws * 1.55, hip_y + h * 0.10)], fill=INK, width=3)

    # 腿：髋 → 膝 → 踝
    for sg in (-1, 1):
        kx = cx + sg * ws * 0.62
        ax = cx + sg * ws * 0.80
        d.line([(kx, hip_y), (kx + sg * ws * 0.16, hip_y + h * 0.24)], fill=INK, width=3)
        d.line([(kx + sg * ws * 0.16, hip_y + h * 0.24), (ax, hip_y + h * 0.47)], fill=INK, width=3)

    # 服装细节
    if facing == 'front':
        d.line([(cx, sh_y + h * 0.01), (cx, waist_y)], fill=INK_L, width=2)
        d.line([(cx - hr * 0.8, sh_y), (cx, sh_y + h * 0.055)], fill=INK, width=2)
        d.line([(cx + hr * 0.8, sh_y), (cx, sh_y + h * 0.055)], fill=INK, width=2)
        d.line([(cx - ws, waist_y - h * 0.012), (cx + ws, waist_y - h * 0.012)], fill=INK_L, width=3)
    elif facing == 'side':
        d.line([(cx + ws * 0.9, sh_y + h * 0.02), (cx + ws * 0.9, waist_y)], fill=INK_L, width=2)
    else:
        d.line([(cx, sh_y + h * 0.01), (cx, hip_y)], fill=INK_L, width=2)
        for i in range(4):
            x = cx - ws * 0.6 + i * ws * 0.4
            d.line([(x, sh_y + h * 0.04), (x, waist_y - h * 0.02)], fill=(206, 198, 184), width=2)


# ---------- 三视图 ----------
im, d = new(660, 820)
labels = [('正面', 'front'), ('侧面', 'side'), ('背面', 'back')]
for i, (lab, fc) in enumerate(labels):
    x0 = 30 + i * 210
    if i:
        d.line([(x0 - 15, 90), (x0 - 15, 700)], fill=(214, 206, 192), width=1)
    silhouette(d, x0 + 95, 130, 520, 200, fc)
    d.text((x0 + 95 - 22, 690), lab, font=font(22), fill=INK_L)
d.text((30, 30), '沈砚 · 三视图（工厂夜 · 深灰旧工装）', font=font(24, True), fill=INK)
im.save(os.path.join(OUT, 'shen-3view.png'))

# ---------- 表情四格 ----------
im, d = new(680, 700)
exprs = [('冷笑', 'smirk'), ('咬牙', 'grit'), ('怔住', 'blank'), ('垂眼', 'low')]
for i, (lab, kind) in enumerate(exprs):
    x0 = 40 + (i % 2) * 310
    y0 = 90 + (i // 2) * 300
    d.rectangle([x0, y0, x0 + 270, y0 + 240], outline=(214, 206, 192), width=2)
    cx, cy, r = x0 + 135, y0 + 118, 62
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=3)
    # 眉
    if kind == 'smirk':
        d.line([(cx - 40, cy - 30), (cx - 12, cy - 24)], fill=INK, width=3)
        d.line([(cx + 12, cy - 24), (cx + 40, cy - 32)], fill=INK, width=3)
    elif kind == 'grit':
        d.line([(cx - 40, cy - 34), (cx - 10, cy - 22)], fill=INK, width=3)
        d.line([(cx + 10, cy - 22), (cx + 40, cy - 34)], fill=INK, width=3)
    else:
        d.line([(cx - 38, cy - 26), (cx - 12, cy - 30)], fill=INK, width=2)
        d.line([(cx + 12, cy - 30), (cx + 38, cy - 26)], fill=INK, width=2)
    # 眼
    d.line([(cx - 32, cy - 4), (cx - 14, cy - 4)], fill=INK, width=3)
    d.line([(cx + 14, cy - 4), (cx + 32, cy - 4)], fill=INK, width=3)
    # 嘴
    if kind == 'smirk':
        d.arc([cx - 26, cy + 12, cx + 6, cy + 40], start=20, end=150, fill=INK, width=3)
    elif kind == 'grit':
        d.rectangle([cx - 22, cy + 18, cx + 22, cy + 34], outline=INK, width=2)
        d.line([(cx - 22, cy + 26), (cx + 22, cy + 26)], fill=INK, width=2)
    elif kind == 'blank':
        d.ellipse([cx - 12, cy + 18, cx + 12, cy + 40], outline=INK, width=2)
    else:
        d.line([(cx - 18, cy + 28), (cx + 18, cy + 28)], fill=INK, width=2)
    d.text((x0 + 12, y0 + 200), lab, font=font(20), fill=VERM if kind == 'grit' else INK_L)
d.text((40, 40), '沈砚 · 表情表（局部重绘时按格换）', font=font(23, True), fill=INK)
im.save(os.path.join(OUT, 'shen-exprs.png'))

# ---------- 配饰 ----------
im, d = new(680, 480)
items = [('铜怀表', 'watch'), ('玉扳指', 'ring'), ('左腕旧疤', 'scar')]
for i, (lab, kind) in enumerate(items):
    x0 = 40 + i * 210
    d.rectangle([x0, 100, x0 + 180, 330], outline=(214, 206, 192), width=2)
    cx, cy = x0 + 90, 215
    if kind == 'watch':
        d.ellipse([cx - 52, cy - 52, cx + 52, cy + 52], outline=INK, width=4)
        d.ellipse([cx - 42, cy - 42, cx + 42, cy + 42], outline=INK_L, width=1)
        d.line([(cx, cy), (cx, cy - 30)], fill=INK, width=3)
        d.line([(cx, cy), (cx + 21, cy + 12)], fill=INK, width=3)
        d.arc([cx - 18, cy - 92, cx + 18, cy - 46], start=200, end=340, fill=INK, width=3)
    elif kind == 'ring':
        d.ellipse([cx - 46, cy - 30, cx + 46, cy + 62], outline=INK, width=5)
        d.ellipse([cx - 26, cy - 44, cx + 26, cy + 8], outline=INK, width=4)
        d.line([(cx - 14, cy - 40), (cx + 14, cy - 40)], fill=INK_L, width=2)
    else:
        for k in range(3):
            d.arc([cx - 60 + k * 26, cy - 20, cx + 34 + k * 20, cy + 40], start=200, end=340, fill=INK, width=3)
        d.line([(cx - 50, cy + 6), (cx + 40, cy - 6)], fill=VERM, width=2)
    d.text((x0 + 8, 340), lab, font=font(20), fill=INK_L)
d.text((40, 36), '沈砚 · 配饰（单独抠出来，重绘只换这里）', font=font(23, True), fill=INK)
im.save(os.path.join(OUT, 'shen-accessories.png'))

# ---------- 场景空镜 ×2 ----------
def scene_workshop():
    im, d = new(660, 820)
    d.text((30, 28), '老街工坊 · 空镜（无人）', font=font(23, True), fill=INK)
    # 门框
    d.rectangle([90, 150, 570, 720], outline=INK, width=4)
    d.line([(330, 150), (330, 470)], fill=INK_L, width=2)
    d.line([(90, 470), (570, 470)], fill=INK_L, width=2)
    # 横梁与灯
    d.line([(120, 210), (540, 210)], fill=INK, width=3)
    d.line([(330, 210), (330, 250)], fill=INK_L, width=2)
    d.polygon([(300, 250), (360, 250), (345, 300), (315, 300)], outline=INK, width=3)
    d.line([(315, 300), (345, 300)], fill=VERM, width=2)
    # 工作台
    d.rectangle([150, 520, 510, 560], outline=INK, width=4)
    d.line([(180, 560), (180, 700)], fill=INK, width=3)
    d.line([(480, 560), (480, 700)], fill=INK, width=3)
    for k in range(4):
        d.line([(200 + k * 80, 470), (200 + k * 80, 520)], fill=INK_L, width=2)
    d.text((150, 736), 'assets/ref/scene-workshop.png · 复用率高，别带人', font=font(15), fill=INK_L)
    return im

def scene_hall():
    im, d = new(660, 820)
    d.text((30, 28), '柳家堂屋 · 空镜（无人）', font=font(23, True), fill=INK)
    d.rectangle([80, 140, 580, 700], outline=INK, width=4)
    d.line([(80, 140), (330, 200)], fill=INK_L, width=2)
    d.line([(580, 140), (330, 200)], fill=INK_L, width=2)
    d.line([(330, 200), (330, 140)], fill=INK_L, width=2)
    # 八仙桌
    d.rectangle([190, 430, 470, 470], outline=INK, width=5)
    d.line([(215, 470), (215, 640)], fill=INK, width=4)
    d.line([(445, 470), (445, 640)], fill=INK, width=4)
    # 椅子
    for x in (140, 490):
        d.rectangle([x, 400, x + 50, 420], outline=INK, width=3)
        d.line([(x + 8, 420), (x + 8, 560)], fill=INK, width=3)
        d.line([(x + 42, 420), (x + 42, 560)], fill=INK, width=3)
    # 灯笼
    d.ellipse([300, 250, 360, 320], outline=VERM, width=3)
    d.line([(330, 230), (330, 250)], fill=INK, width=2)
    d.text((150, 716), 'assets/ref/scene-hall.png · 退婚现场的定场空镜', font=font(15), fill=INK_L)
    return im

scene_workshop().save(os.path.join(OUT, 'scene-workshop.png'))
scene_hall().save(os.path.join(OUT, 'scene-hall.png'))
print('已生成：', ', '.join(sorted(os.listdir(OUT))))
