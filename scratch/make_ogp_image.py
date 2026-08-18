import os
from PIL import Image, ImageDraw, ImageFont

# 1200 x 630 OGP Canvas
width, height = 1200, 630
# Background color: #FAFAF7 (tokens.css paper)
bg_color = (250, 250, 247)
img = Image.new("RGB", (width, height), bg_color)
draw = ImageDraw.Draw(img)

# Try loading Japanese fonts from Windows system fonts
font_dir = "C:\\Windows\\Fonts"
bold_font_path = os.path.join(font_dir, "meiryob.ttc")
regular_font_path = os.path.join(font_dir, "meiryo.ttc")
yu_bold_path = os.path.join(font_dir, "yugothb.ttc")
segoe_bold_path = os.path.join(font_dir, "segoeuib.ttf")

def get_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        try:
            return ImageFont.truetype("arial.ttf", size)
        except Exception:
            return ImageFont.load_default()

font_brand = get_font(segoe_bold_path, 80)
font_title = get_font(bold_font_path, 44, index=0)
font_sub = get_font(regular_font_path, 28, index=0)
font_badge = get_font(bold_font_path, 22, index=0)

# Color tokens
INK_COLOR = (15, 23, 42)       # #0F172A
SIGNAL_COLOR = (234, 88, 12)   # #EA580C (Orange)
MUTED_COLOR = (100, 116, 139)  # #64748B
BORDER_COLOR = (226, 232, 240) # #E2E8F0
CARD_BG = (255, 255, 255)

# Outer Border / Top Accent Bar
draw.rectangle([0, 0, 1200, 12], fill=SIGNAL_COLOR)

# Main Card Container
draw.rounded_rectangle([60, 60, 1140, 570], radius=24, fill=CARD_BG, outline=BORDER_COLOR, width=2)

# Ruler Ticks Motif (Top left of card)
x_start = 100
y_ticks = 110
for i in range(12):
    x = x_start + i * 14
    h = 18 if i % 2 == 0 else 10
    draw.rectangle([x, y_ticks, x + 3, y_ticks + h], fill=INK_COLOR)

# Brand Wordmark "pergram"
# "per" in dark ink, "gram" in orange signal
y_brand = 145
draw.text((100, y_brand), "per", font=font_brand, fill=INK_COLOR)
per_width = draw.textlength("per", font=font_brand)
draw.text((100 + per_width, y_brand), "gram", font=font_brand, fill=SIGNAL_COLOR)

# Tagline Badge
tagline_text = "有効成分 1g あたりの価格で統一比較"
x_tagline = 100
y_tagline = 250
draw.rounded_rectangle([x_tagline, y_tagline, x_tagline + 460, y_tagline + 44], radius=8, fill=(254, 243, 199)) # light orange/amber badge
draw.text((x_tagline + 16, y_tagline + 8), tagline_text, font=font_badge, fill=(180, 83, 9))

# Main Title
title_text = "プロテイン・サプリの「本当のコスパ」がわかる。"
draw.text((100, 320), title_text, font=font_title, fill=INK_COLOR)

# Description text
desc_text1 = "パッケージの価格ではなく、タンパク質などの有効成分1gあたりの単価で自動比較。"
desc_text2 = "メーカーの広告や曖昧なランキングに惑わされない、客観的な最安値一覧。"
draw.text((100, 400), desc_text1, font=font_sub, fill=MUTED_COLOR)
draw.text((100, 445), desc_text2, font=font_sub, fill=MUTED_COLOR)

# Footer domain pill
x_domain = 100
y_domain = 505
draw.text((x_domain, y_domain), "https://pergram.site/", font=font_badge, fill=MUTED_COLOR)

# Output directory
out_dir = os.path.join(os.getcwd(), "src", "assets", "images")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "ogp.png")

img.save(out_path, "PNG", quality=95)
print(f"Successfully generated {out_path}")
