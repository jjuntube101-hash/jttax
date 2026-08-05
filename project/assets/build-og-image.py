# -*- coding: utf-8 -*-
"""
og-image.png 생성기 (1200×630) — 카카오·페이스북·트위터 공유 미리보기 이미지

★ 왜 스크립트로 만드는가
   종전 og-image.png 에는 «제이티 세무회계»가 **픽셀로 각인**돼 있었다.
   텍스트가 아니라 이미지라 grep 에 잡히지 않아, 260804 브랜딩 전수 교체
   (텍스트 351건)에서 살아남아 그대로 배포될 뻔했다.
   → 다시는 손으로 만들지 않는다. 상호·문구가 바뀌면 이 파일만 고치고 재실행한다.

실행:  python project/assets/build-og-image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'og-image.png')

# 브랜드 자산 — 제이티 세법 브랜드(Pretendard) 준수
FONT_DIR = r'D:\클로드\강의\수험\세법\강의스크립트\작업\OT\슬라이드\assets'
def font(weight, size):
    path = os.path.join(FONT_DIR, 'Pretendard-%s.otf' % weight)
    if not os.path.exists(path):                      # 폴백: 맑은 고딕
        path = r'C:\Windows\Fonts\malgunbd.ttf' if weight in ('Bold', 'ExtraBold', 'Black') \
               else r'C:\Windows\Fonts\malgun.ttf'
    return ImageFont.truetype(path, size)

W, H = 1200, 630
BG      = (11, 11, 15)        # #0B0B0F
WHITE   = (255, 255, 255)
GOLD    = (201, 162, 39)      # #C9A227
GRAY    = (150, 148, 143)
DIVIDER = (58, 57, 62)

# ── 문구 (상호·카피 변경 시 여기만 수정) ──────────────────────────────
FIRM        = '제이티 세무법인'          # ⚠️ 세무법인 설립 완료(260804) — 「세무회계」 금지
DOMAIN      = 'jttax.co.kr'
HEADLINE_1  = '부동산 세금,'
HEADLINE_2A = '주소만 넣으면 '
HEADLINE_2B = '계산됩니다.'              # 골드 강조
SUBLINE     = '양도 · 증여 · 상속 · 취득 · 보유세 — 검증 계산 엔진'
FOOTER_L    = '담당 세무사 이현준 · 첫 상담 무료(쟁점 확인·방향 안내)'
FOOTER_R    = 'www.jttax.co.kr →'
# ⚠️ 세무사법 §12조의7: 연고 표방(「국세청 출신」 등)·최상급 표현 금지.
#    위 문구는 사실 서술만 담는다.

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

def right(text, f, x_right, y, fill):
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text((x_right - w, y), text, font=f, fill=fill)

# 헤더
f_jt = font('ExtraBold', 34)
d.text((70, 72), 'JT', font=f_jt, fill=WHITE)
jt_w = d.textbbox((0, 0), 'JT', font=f_jt)[2]
d.text((70 + jt_w + 16, 76), FIRM, font=font('SemiBold', 27), fill=WHITE)
right(DOMAIN, font('Regular', 20), W - 70, 80, GRAY)

# 헤드라인
f_head = font('Bold', 68)
d.text((70, 208), HEADLINE_1, font=f_head, fill=WHITE)
d.text((70, 300), HEADLINE_2A, font=f_head, fill=WHITE)
w2a = d.textbbox((0, 0), HEADLINE_2A, font=f_head)[2]
d.text((70 + w2a, 300), HEADLINE_2B, font=f_head, fill=GOLD)

# 서브라인
d.text((70, 420), SUBLINE, font=font('Medium', 29), fill=(224, 222, 217))

# 구분선 + 푸터
d.line([(70, 522), (W - 70, 522)], fill=DIVIDER, width=1)
d.text((70, 552), FOOTER_L, font=font('Regular', 20), fill=GRAY)
right(FOOTER_R, font('Bold', 22), W - 70, 550, GOLD)

img.save(OUT, 'PNG', optimize=True)
print('OK ->', OUT, img.size, os.path.getsize(OUT), 'bytes')

# 자기검증: 상호가 실제로 바뀌었는지는 «렌더된 픽셀»을 눈으로 봐야 한다.
# 스크립트가 성공했다는 것만으로 각인 문구가 옳다고 결론짓지 말 것.
print('⚠️ 반드시 렌더된 PNG를 육안으로 확인할 것 (grep 으로는 각인 문구를 못 본다)')
