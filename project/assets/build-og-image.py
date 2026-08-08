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

# ── 팔레트 — CI 모노크롬 (260808 정렬) ──────────────────────────────
#    종전엔 BG #0B0B0F(청기 도는 차콜) + 강조 GOLD #C9A227 이었는데, CI
#    베이직 시스템(HEAZ 2026)은 «Black #000000 / White #ffffff / Gray #4b4b4b
#    정색만, 무채색 외 금지»다. 사이트 본체(colors_and_type.css)는 이미
#    모노크롬으로 정렬돼 있는데 공유 미리보기만 구 브랜드로 남아 있었다.
#    회색 계열은 colors_and_type.css 의 ink 램프에서 그대로 가져온다.
W, H = 1200, 630
BG      = (0, 0, 0)           # #000000  CI Black — 다크 앵커 면
WHITE   = (255, 255, 255)     # #ffffff  CI White
ACCENT  = (255, 255, 255)     # 강조 = 흰색 (종전 GOLD 대체 — 무채색 외 금지)
SUBTLE  = (204, 204, 204)     # #cccccc  ink-300 — 서브라인
GRAY    = (154, 154, 154)     # #9a9a9a  ink-400 — 메타/푸터
DIVIDER = (46, 46, 46)        # #2e2e2e  ink-700 — 구분선

# ── 문구 (상호·카피 변경 시 여기만 수정) ──────────────────────────────
FIRM        = '제이티 세무법인'          # ⚠️ 세무법인 설립 완료(260804) — 「세무회계」 금지
DOMAIN      = 'jttax.co.kr'
HEADLINE_1  = '부동산 세금,'
HEADLINE_2A = '주소만 넣으면 '
HEADLINE_2B = '계산됩니다.'              # 강조(흰색 — 260808 골드 폐기)
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
# 헤드라인 — 강조는 색이 아니라 «면»으로 준다 (무채색 제약 아래서의 대비 확보)
f_head = font('Bold', 68)
d.text((70, 208), HEADLINE_1, font=f_head, fill=WHITE)
d.text((70, 300), HEADLINE_2A, font=f_head, fill=WHITE)
w2a = d.textbbox((0, 0), HEADLINE_2A, font=f_head)[2]
x2b = 70 + w2a + 18          # 강조 면 좌측 패딩만큼 앞 문구와 띄운다
bb = d.textbbox((x2b, 300), HEADLINE_2B, font=f_head)
d.rectangle([bb[0] - 16, bb[1] - 12, bb[2] + 16, bb[3] + 14], fill=ACCENT)
d.text((x2b, 300), HEADLINE_2B, font=f_head, fill=BG)

# 서브라인
d.text((70, 420), SUBLINE, font=font('Medium', 29), fill=SUBTLE)

# 구분선 + 푸터
d.line([(70, 522), (W - 70, 522)], fill=DIVIDER, width=1)
d.text((70, 552), FOOTER_L, font=font('Regular', 20), fill=GRAY)
right(FOOTER_R, font('Bold', 22), W - 70, 550, WHITE)

img.save(OUT, 'PNG', optimize=True)
print('OK ->', OUT, img.size, os.path.getsize(OUT), 'bytes')

# 자기검증: 상호가 실제로 바뀌었는지는 «렌더된 픽셀»을 눈으로 봐야 한다.
# 스크립트가 성공했다는 것만으로 각인 문구가 옳다고 결론짓지 말 것.
print('⚠️ 반드시 렌더된 PNG를 육안으로 확인할 것 (grep 으로는 각인 문구를 못 본다)')
