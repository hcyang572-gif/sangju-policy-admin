# -*- coding: utf-8 -*-
"""
로그인 브랜드 면(감빛)에 얹을 «흰 단색» 시정구호를 만든다.

왜 필요한가
  원본 `slogan-stack.png` 은 빨강·청록·검정 글자라 감빛 배경 위에 그냥 얹으면
  「이상을」·「현실로」(빨강 #E0114F 계열)가 배경에 묻혀 읽히지 않는다(대비 1.4:1).
  그래서 «흰 판»에 얹어 두었는데, 그 판이 브랜드 면 위에 떠 보였다.
  → 알파를 마스크로 삼아 **흰색 한 색으로 칠해** 감빛 배경 위에 직접 얹는다.
     흰색 vs #B84A1C = 5.21:1 로 본문 대비 기준(4.5:1)을 넘긴다.

만드는 파일
  · assets/slogan-white.png   901x183  (원본과 같은 크기, 알파 그대로)

⚠ 원본 `slogan-stack.png` · `slogan-wide.png` 는 **덮어쓰지 않는다** — 헤더에서 그대로 쓴다.

실행:  py -3 make_slogan_white.py
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "slogan-stack.png")
OUT = os.path.join(HERE, "assets", "slogan-white.png")

# 가는 붓글씨(「이상을」·「현실로」·「상주」)가 흰 단색이 되면 얇아 보인다.
# 알파에 감마(<1)를 먹여 «반투명 가장자리»를 조금 살찌워 두께를 되살린다.
# 1.0 이면 원본 그대로. 0.75 는 눈으로 보고 고른 값(과하면 뭉개진다).
ALPHA_GAMMA = 0.75


def main():
    src = Image.open(SRC).convert("RGBA")
    alpha = src.getchannel("A")
    if ALPHA_GAMMA != 1.0:
        lut = [min(255, round(255 * ((i / 255.0) ** ALPHA_GAMMA))) for i in range(256)]
        alpha = alpha.point(lut)
    out = Image.new("RGBA", src.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    out.save(OUT)
    print("만듦:", OUT, out.size)


if __name__ == "__main__":
    main()
