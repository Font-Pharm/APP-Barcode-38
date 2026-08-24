#!/usr/bin/env python3
"""
สร้างไอคอนแอปทุกขนาดจากไฟล์โลโก้ไฟล์เดียว

วิธีใช้:
    pip install pillow
    python make-icons.py Logo.png

จะเขียนทับไฟล์ในโฟลเดอร์ icons/ ให้ทั้งหมด
หลังรันเสร็จอย่าลืมเปลี่ยนเลข CACHE ใน sw.js ด้วย
ไม่งั้นเครื่องที่ติดตั้งไว้แล้วจะยังเห็นโลโก้เก่า

โลโก้ที่เหมาะ: รูปสี่เหลี่ยมจัตุรัส ด้านละอย่างน้อย 512 พิกเซล
พื้นหลังโปร่งใสได้ (สคริปต์จะวางบนพื้นขาวให้ เพราะ iOS ไม่รองรับพื้นโปร่งใส)
"""

import sys
import os
from PIL import Image

BG = (255, 255, 255)

# (ชื่อไฟล์, ขนาด, สัดส่วนที่โลโก้กินพื้นที่)
TARGETS = [
    ("icon-192.png",          192, 0.94),
    ("icon-512.png",          512, 0.94),
    # maskable: Android ครอบเป็นวงกลม/สี่เหลี่ยมมน ต้องเหลือขอบว่าง ~15% รอบด้าน
    ("icon-512-maskable.png", 512, 0.70),
    # apple-touch-icon: iOS ครอบมุมเอง
    ("icon-180.png",          180, 0.94),
    ("favicon-32.png",         32, 1.00),
]


def content_box(img):
    """หาขอบเขตของเนื้อภาพจริง ตัดขอบว่างรอบ ๆ ทิ้ง"""
    if img.mode == "RGBA":
        alpha = img.getchannel("A")
        box = alpha.getbbox()
        if box:
            return box
    grey = img.convert("L")
    # ถือว่าพิกเซลที่สว่างเกือบสุดคือพื้นหลัง
    mask = grey.point(lambda v: 0 if v > 245 else 255)
    return mask.getbbox() or (0, 0, img.width, img.height)


def square(box, w, h):
    """ขยายกรอบให้เป็นสี่เหลี่ยมจัตุรัส โลโก้จะได้ไม่ถูกบีบ"""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0 = int(max(0, cx - side / 2)); y0 = int(max(0, cy - side / 2))
    return (x0, y0, min(w, x0 + side), min(h, y0 + side))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src_path = sys.argv[1]
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
    os.makedirs(out_dir, exist_ok=True)

    src = Image.open(src_path)
    src = src.convert("RGBA") if src.mode in ("RGBA", "LA", "P") else src.convert("RGB")

    box = square(content_box(src), src.width, src.height)
    core = src.crop(box)
    print(f"อ่าน {src_path} ขนาด {src.size} · ใช้พื้นที่ {box}")

    if max(core.size) < 512:
        print(f"  ⚠ โลโก้มีขนาดเพียง {max(core.size)}px — ควรใช้ไฟล์ที่ใหญ่กว่า 512px "
              f"ไม่งั้นไอคอนจะเบลอ")

    for name, size, ratio in TARGETS:
        canvas = Image.new("RGB", (size, size), BG)
        d = max(1, round(size * ratio))
        resized = core.resize((d, d), Image.LANCZOS)
        pos = ((size - d) // 2, (size - d) // 2)
        if resized.mode == "RGBA":
            canvas.paste(resized, pos, resized)      # ใช้ alpha เป็น mask
        else:
            canvas.paste(resized, pos)
        canvas.save(os.path.join(out_dir, name))
        print(f"  ✓ icons/{name}  ({size}x{size})")

    print("\nเสร็จแล้ว — ขั้นตอนต่อไป:")
    print("  1. เปลี่ยนเลข CACHE ใน sw.js เช่น 'chart-intake-v2' → 'chart-intake-v3'")
    print("  2. อัปโหลด icons/ ทั้งโฟลเดอร์ และ sw.js ขึ้น GitHub")
    print("  3. ถ้าติดตั้งแอปไว้แล้ว ให้ลบออกจากหน้าจอโฮมแล้วติดตั้งใหม่")


if __name__ == "__main__":
    main()
