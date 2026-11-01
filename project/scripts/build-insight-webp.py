"""글 hero 이미지를 화면 표시용 WebP 로 만든다 (261101 SEO 이미지 압축).

왜: 글 hero 는 1536×1024 PNG 로 장당 1.7~2.4MB 다. 홈 카드·글 목록·글 첫 화면이 이 원본을
그대로 받아 PSI «이미지 전송 개선» 절감 예상이 7.9MB 였다. 같은 크기 WebP(품질 80)는 장당 약 60~100KB 다.

무엇을: project/insights/*.md 의 프론트매터
  hero: /project/assets/insights/<이름>.png
를 다음처럼 바꾸고, 같은 이름의 .webp 를 만든다(이미 있으면 그대로 둔다).
  hero: /project/assets/insights/<이름>.webp
  heroShare: /project/assets/insights/<이름>.png
heroShare 는 og:image·twitter:image·JSON-LD image 에 쓴다 — SNS 미리보기가 WebP 를 못 읽는 경우와
이미 퍼진 공유 캐시를 위해 원본 PNG 를 그대로 둔다. 원본 PNG 는 지우지 않는다(외부 링크·이미지 색인·옛 캐시).

두 번 돌려도 결과가 같다. 새 글을 PNG hero 로 올렸다면 이 스크립트를 한 번 돌리면 된다.
  python project/scripts/build-insight-webp.py          # 변환 + 프론트매터 갱신
  python project/scripts/build-insight-webp.py --check  # 바꿀 것이 남았는지만 본다(남으면 종료 코드 1)
"""
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'project' / 'insights'
QUALITY = 80  # 1536×1024 기준 장당 약 60~100KB, 글 첫 화면에서 눈에 띄는 열화 없음(261101 육안 대조)
HERO_RE = re.compile(r'^hero:[ \t]*(/project/assets/insights/[a-z0-9-]+)\.png[ \t]*$', re.M)


def convert(png: Path, webp: Path) -> None:
    with Image.open(png) as im:
        im.convert('RGB').save(webp, 'WEBP', quality=QUALITY, method=6)


def main() -> int:
    check = '--check' in sys.argv
    todo = []
    for md in sorted(SRC.glob('*.md')):
        raw = md.read_bytes().decode('utf-8')
        head = re.match(r'^---\r?\n([\s\S]*?)\r?\n---', raw)
        if not head:
            continue
        block = head.group(1).replace('\r\n', '\n')
        m = HERO_RE.search(block)
        if not m:
            continue
        base = m.group(1)
        png = ROOT / (base.lstrip('/') + '.png')
        webp = ROOT / (base.lstrip('/') + '.webp')
        if not png.exists():
            raise SystemExit(f'[hero] {md.name}: 원본 {png} 이 없습니다')
        todo.append(md.name)
        if check:
            continue
        if not webp.exists():
            convert(png, webp)
        eol = '\r\n' if '\r\n' in raw else '\n'
        new_block = HERO_RE.sub(lambda _m: f'hero: {base}.webp', block, count=1)
        if not re.search(r'^heroShare:', new_block, re.M):
            new_block = new_block.replace(f'hero: {base}.webp', f'hero: {base}.webp\nheroShare: {base}.png', 1)
        new_block = new_block.replace('\n', eol)  # 줄 끝을 원래 파일과 같게
        md.write_bytes((raw[:head.start(1)] + new_block + raw[head.end(1):]).encode('utf-8'))
        print(f'{md.name}: {webp.stat().st_size // 1024}KB (원본 {png.stat().st_size // 1024}KB)')
    if check:
        if todo:
            print('WebP 로 바꿀 PNG hero 가 남았습니다:', ', '.join(todo))
            return 1
        print('PNG hero 없음')
    return 0


if __name__ == '__main__':
    sys.exit(main())
