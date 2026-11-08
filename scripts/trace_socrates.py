"""Trace app/assets/socratesmascotmain.png into the rig's part paths.

Writes the `T` block of app/src/socrates/parts.tsx (between the <traced>
markers). Re-run after the PNG changes:

    python3 -I scripts/trace_socrates.py      # needs numpy, pillow, opencv-python-headless

How: every pixel is snapped to the nearest palette colour (anti-aliased edge
pixels take the label of the nearest solid pixel), parts are picked as
connected regions of one colour, masks are patched where the PNG hides
something a pose can reveal (beard behind the hand, chest behind the forearm,
forearm under the cuff), and each mask's contour is smoothed, simplified and
written as closed Catmull-Rom curves converted to cubic Beziers.
"""
import json
import os
import re

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG = os.path.join(ROOT, 'app/assets/socratesmascotmain.png')
PARTS = os.path.join(ROOT, 'app/src/socrates/parts.tsx')

img = np.array(Image.open(PNG).convert('RGBA')).astype(int)
r, g, b, a = [img[..., i] for i in range(4)]
PAL = {'cream': (0xF9, 0xF1, 0xD9), 'skin': (0xFD, 0xB1, 0x6B), 'shade': (0xF3, 0x9A, 0x52), 'line': (0xE3, 0x80, 0x2F),
       'pupil': (0x2C, 0x2B, 0x25), 'fold': (0xE4, 0xCC, 0x9C), 'mouth': (0xA0, 0x60, 0x30), 'white': (0xFE, 0xF9, 0xE9)}
N = {n: i for i, n in enumerate(PAL)}
dist2 = np.stack([(r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2 for c in PAL.values()], -1)
lab = dist2.argmin(-1)
conf = (a > 250) & (dist2.min(-1) < 30 ** 2)
# Unconfident pixels (anti-aliased edges) take the label of the nearest confident pixel.
_, near = cv2.distanceTransformWithLabels((~conf).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
lut = np.zeros(near.max() + 1, int)
lut[near[conf]] = lab[conf]
lab = lut[near]
lab[a < 128] = -1


def comps(cls):
    m = (lab == N[cls]).astype(np.uint8)
    k, cc, st, _ = cv2.connectedComponentsWithStats(m, 8)
    return cc, st


def comp_at(cls, x, y):
    cc, st = comps(cls)
    j = cc[y, x]
    assert j > 0, (cls, x, y)
    return cc == j


def comp_box(cls, x, y):
    cc, st = comps(cls)
    best = None
    for j in range(1, len(st)):
        if st[j][4] > 150 and abs(st[j][0] - x) <= 4 and abs(st[j][1] - y) <= 4:
            if best is None or st[j][4] > st[best][4]:
                best = j
    if best is not None:
        return cc == best
    raise AssertionError((cls, x, y))


def fill_holes(m):
    m = m.astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(m)
    cv2.drawContours(out, cs, -1, 1, -1)
    return out.astype(bool)


def close(m, r=2):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, k).astype(bool)


def disk(cx, cy, r):
    yy, xx = np.mgrid[0:1024, 0:1024]
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r


def poly(pts):
    m = np.zeros((1024, 1024), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


def capsule(x0, y0, x1, y1, r):
    m = np.zeros((1024, 1024), np.uint8)
    cv2.line(m, (int(x0), int(y0)), (int(x1), int(y1)), 1, int(2 * r))
    return m.astype(bool) | disk(x0, y0, r) | disk(x1, y1, r)


def median_color(mask):
    px = img[mask & (img[..., 3] > 250)][:, :3]
    c = np.median(px, 0).astype(int)
    return '#%02X%02X%02X' % tuple(c)


def smooth_path(mask, eps=1.4, min_area=30, holes=True, grow=1):
    """Contours -> closed Catmull-Rom curves as cubic Beziers."""
    m = mask.astype(np.uint8) * 255
    if grow:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    # upsample x2 so contours sit on pixel edges, not centers
    m2 = cv2.resize(m, (2048, 2048), interpolation=cv2.INTER_LINEAR)
    m2 = cv2.GaussianBlur(m2, (5, 5), 0)
    _, m2 = cv2.threshold(m2, 127, 255, cv2.THRESH_BINARY)
    mode = cv2.RETR_CCOMP if holes else cv2.RETR_EXTERNAL
    cs, _ = cv2.findContours(m2, mode, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cs:
        if cv2.contourArea(c) < min_area * 4:
            continue
        raw = c[:, 0, :].astype(float)
        if len(raw) > 12:
            k = np.exp(-0.5 * (np.arange(-6, 7) / 2.5) ** 2)
            k /= k.sum()
            pad = np.concatenate([raw[-6:], raw, raw[:6]])
            raw = np.stack([np.convolve(pad[:, i], k, 'valid') for i in range(2)], -1)
        a = cv2.approxPolyDP(raw.astype(np.float32).reshape(-1, 1, 2), eps * 2, True)[:, 0, :].astype(float) / 2.0
        n = len(a)
        if n < 3:
            continue
        # Catmull-Rom tangents, shortened next to uneven segments and dropped at
        # sharp corners, so curves never overshoot past the traced edge.
        tan = []
        for i in range(n):
            p0, p1, p2 = a[(i - 1) % n], a[i], a[(i + 1) % n]
            d0, d1 = np.linalg.norm(p1 - p0), np.linalg.norm(p2 - p1)
            u, w = (p1 - p0) / max(d0, 1e-6), (p2 - p1) / max(d1, 1e-6)
            if np.dot(u, w) < 0.5:  # turns more than 60 degrees
                tan.append(np.zeros(2))
            else:
                tan.append((p2 - p0) / 2.0 * min(1.0, 2.0 * min(d0, d1) / max(d0 + d1, 1e-6) * 1.5))
        d = 'M%.1f %.1f' % tuple(a[0])
        for i in range(n):
            p1, p2 = a[i], a[(i + 1) % n]
            c1 = p1 + tan[i] / 3.0
            c2 = p2 - tan[(i + 1) % n] / 3.0
            d += 'C%.1f %.1f %.1f %.1f %.1f %.1f' % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
        parts.append(d + 'Z')
    s = ''.join(parts)
    s = s.replace('.0 ', ' ').replace('.0C', 'C').replace('.0Z', 'Z')
    return s


white = lab == N['white']
cream = (lab == N['cream']) | white
eyeL = fill_holes(comp_at('white', 380, 260) | comp_at('pupil', 410, 280))
eyeR = fill_holes(comp_at('white', 530, 260) | comp_at('pupil', 570, 290))
cream &= ~(eyeL | eyeR)

out = {}
col = {}

# Head cream: hair + beard, holes filled, plus the beard edge hidden behind the hand.
hairBeard = close(fill_holes(close(cream & (np.mgrid[0:1024, 0:1024][0] < 606) & ~(np.mgrid[0:1024, 0:1024][1] > 800) | (cream & (np.mgrid[0:1024, 0:1024][0] < 420)), 3)))
# keep only the big head component
k, cc, st, _ = cv2.connectedComponentsWithStats(hairBeard.astype(np.uint8), 8)
big = 1 + np.argmax(st[1:, 4])
hairBeard = cc == big
hidden = disk(268, 470, 40) | disk(292, 520, 40) | disk(330, 552, 36) | disk(258, 430, 30)
hairBeard = fill_holes(hairBeard | hidden)
# The toga is a separate component; make sure we did not grab it.
toga_cream = comp_at('cream', 500, 800) | comp_box('cream', 631, 806)
toga_cream |= (white & fill_holes(close(toga_cream, 4)))
hairBeard &= ~toga_cream


face = fill_holes(close(comp_box('skin', 281, 48), 3) | comp_box('line', 412, 307))
face |= fill_holes(face | comp_box('cream', 342, 147) | comp_box('cream', 523, 152) | eyeL | eyeR)
out['face'] = smooth_path(fill_holes(face), holes=False)
hairBeard = fill_holes(close(hairBeard | face, 3))
out['hairBeard'] = smooth_path(hairBeard, holes=False)
col['skin'] = median_color(comp_box('skin', 281, 48))

ear = fill_holes(close(comp_box('skin', 728, 286) | comp_box('shade', 732, 314), 2))
out['ear'] = smooth_path(ear, holes=False)
out['earInner'] = smooth_path(comp_box('shade', 732, 314), holes=False)
col['shade'] = median_color(comp_box('shade', 732, 314))

out['browL'] = smooth_path(fill_holes(comp_box('cream', 342, 147) | (white & close(comp_box('cream', 342, 147), 3))), holes=False)
out['browR'] = smooth_path(fill_holes(comp_box('cream', 523, 152) | (white & close(comp_box('cream', 523, 152), 3))), holes=False)
col['cream'] = median_color(comp_at('cream', 500, 500))

out['eyeL'] = smooth_path(eyeL, holes=False)
out['eyeR'] = smooth_path(eyeR, holes=False)
col['eyeWhite'] = median_color(comp_at('white', 370, 250))
out['pupilL'] = smooth_path(comp_at('pupil', 410, 280), holes=False)
out['pupilR'] = smooth_path(comp_at('pupil', 570, 290), holes=False)
col['pupil'] = median_color(comp_at('pupil', 410, 280))

nose = comp_box('line', 412, 307)
out['nose'] = smooth_path(nose, eps=1.0)
col['line'] = median_color(comp_box('line', 190, 436))
col['noseLine'] = median_color(nose)
mouth = comp_box('mouth', 410, 405)
out['mouthSmile'] = smooth_path(mouth, eps=1.0, holes=False)
col['mouth'] = median_color(mouth)

# Front forearm and hand. The shade band left of the forearm's right edge belongs to the arm.
yy, xx = np.mgrid[0:1024, 0:1024]
edge_x = 337 + (yy - 590) * (300 - 337) / (705 - 590)  # forearm right edge
armSide = (xx < edge_x + 6)
skinArm = comp_box('skin', 202, 449)
lineArm = comp_box('line', 190, 436)
shade_arm = comp_box('shade', 281, 561) & armSide & (yy > 560)
arm = fill_holes(close(skinArm | lineArm | shade_arm, 3))
arm |= disk(306, 734, 24) | poly([(286, 700), (330, 690), (330, 752), (290, 756)])
# Split into forearm and hand with a 40px overlap, so the hand can be swapped
# for the open palm without a seam.
out['forearm'] = smooth_path(arm & (yy >= 600), holes=False)
out['forearmLine'] = smooth_path(lineArm & (yy >= 600), eps=1.0)
out['thumbHand'] = smooth_path(arm & (yy < 640), holes=False)
out['thumbHandLines'] = smooth_path(lineArm & (yy < 640), eps=1.0)
# Open palm (listening): drawn, not traced, sized to sit on the forearm.
palm = disk(268, 560, 62) | poly([(206, 560), (332, 560), (334, 640), (204, 640)])
for (x0, y0, x1, y1) in [(214, 540, 206, 462), (243, 520, 238, 432), (273, 520, 274, 426), (302, 530, 310, 448)]:
    palm |= capsule(x0, y0, x1, y1, 15)
palm |= capsule(318, 590, 364, 532, 17)
ring = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
palmOuter = cv2.dilate(palm.astype(np.uint8), ring).astype(bool)
palmInner = cv2.erode(palm.astype(np.uint8), ring).astype(bool)
out['palm'] = smooth_path(palmOuter, eps=1.0, holes=False, grow=0)
# Outline everywhere but the wrist, where the palm joins the forearm.
out['palmLine'] = smooth_path(palmOuter & ~palmInner & (yy < 604), eps=1.0, grow=0)
out['armEdge'] = smooth_path(shade_arm & (xx > edge_x - 14) & (yy > 600), eps=1.0, holes=False)

# Chest skin (bare right side of the chest), extended under beard and arm.
chest_vis = comp_box('skin', 309, 592) | (comp_box('shade', 281, 561) & ~armSide)
chest = fill_holes(close(chest_vis, 3)) | poly([(290, 560), (560, 520), (700, 520), (620, 640), (520, 700), (300, 720), (282, 640)])
out['chest'] = smooth_path(chest, holes=False)
out['chestShade'] = smooth_path(comp_box('shade', 281, 561) & ~armSide & (xx > edge_x + 6), holes=False)
col['chest'] = median_color(comp_box('skin', 309, 592))

# Toga: cream body (incl. the small panel between folds) + fold lines.
toga = fill_holes(close(toga_cream | comp_box('fold', 358, 487) | comp_box('fold', 541, 566) | comp_box('fold', 285, 642), 3))
out['toga'] = smooth_path(toga, holes=False)
folds = comp_box('fold', 358, 487) | comp_box('fold', 541, 566) | comp_box('fold', 285, 642)
out['togaFolds'] = smooth_path(folds, eps=1.0)
col['fold'] = median_color(folds)
# The cuff that wraps the elbow is redrawn above the forearm.
cuffBox = poly([(250, 668), (360, 668), (380, 800), (250, 800)])
cuff = toga & cuffBox
out['cuff'] = smooth_path(cuff, holes=False)
out['cuffFold'] = smooth_path(folds & poly([(250, 668), (372, 668), (392, 800), (250, 800)]), eps=1.0)

# Back arm (his left), hanging behind the toga: only the shaded hand shows.
backHand = comp_box('shade', 716, 714)
out['backHand'] = smooth_path(backHand, holes=False)
out['backArm'] = smooth_path(capsule(758, 610, 756, 672, 32) | backHand, holes=False)

# Feet.
footL = fill_holes(close(comp_box('skin', 314, 932) | comp_box('shade', 322, 916), 2))
footR = fill_holes(close(comp_box('skin', 565, 931) | comp_box('shade', 533, 914), 2))
out['footL'] = smooth_path(footL, holes=False)
out['footR'] = smooth_path(footR, holes=False)
out['footLShade'] = smooth_path(comp_box('shade', 322, 916), holes=False)
out['footRShade'] = smooth_path(comp_box('shade', 533, 914), holes=False)
col['foot'] = median_color(comp_box('skin', 314, 932))
col['footShade'] = median_color(comp_box('shade', 322, 916))
col['toga'] = median_color(comp_at('cream', 500, 800))
col['hair'] = median_color(comp_at('cream', 260, 180))
col['armShade'] = median_color(shade_arm)
col['chestShade'] = median_color(comp_box('shade', 281, 561) & ~armSide)


src = open(PARTS).read()
block = '// <traced>\n// Generated by scripts/trace_socrates.py. Do not edit by hand.\nexport const T = {\n'
block += ''.join('  %s: "%s",\n' % (k, v) for k, v in out.items())
block += '} as const;\n// </traced>'
src = re.sub(r'// <traced>.*?// </traced>', lambda m: block, src, flags=re.S)
open(PARTS, 'w').write(src)
print('sampled colours:', json.dumps(col))
