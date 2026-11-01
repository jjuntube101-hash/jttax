"""Pretendard 가변 폰트 서브셋 (261101 SEO 2-6)

왜: 홈이 첫 화면에서 PretendardVariable.woff2 를 통째로(약 2.06MB) 받았다.
    완성형 한글 2,350자 + 사이트 원문에 실제 쓰인 글자 + 영문·기호만 남기면 약 0.5MB 다.

무엇을 만드나:
  project/assets/fonts/PretendardVariable-core.woff2   — 서브셋 (가변 굵기 축 유지)
  project/assets/fonts/pretendard-subset.json          — 원본·서브셋 sha256, 서브셋이 덮는 글자 구간,
                                                          원본에는 있으나 서브셋에서 뺀 글자 구간
  tests_font_subset.js 가 «사이트 원문에 쓰인 글자 중 뺀 글자가 있으면» 실패한다 → 이 스크립트를 다시 돌린다.

빠진 글자(드문 한글 등)는 글꼴 목록의 다음 순서인 시스템 한글 폰트로 보인다.

실행:  python project/scripts/build-font-subset.py
필요:  fonttools·brotli (pip install fonttools brotli)
"""
import hashlib
import json
import os
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT_DIR = os.path.join(ROOT, 'project', 'assets', 'fonts')
SRC = os.path.join(FONT_DIR, 'PretendardVariable.woff2')
OUT = os.path.join(FONT_DIR, 'PretendardVariable-core.woff2')
MANIFEST = os.path.join(FONT_DIR, 'pretendard-subset.json')

# 원문 글자를 모을 파일 — tests_font_subset.js 의 SOURCE_GLOBS 와 같아야 한다
SOURCE_GLOBS = ['*.html', '*.jsx', '*.mjs', '*.md', '*.css', '*.js', '*.json']   # js·json: 조례 카드 JSON 처럼 번들에 들어가는 문구 (Codex R1-F1)
SKIP_PREFIX = ('node_modules/', 'project/dist/', 'project/dev/')

# 기본으로 넣는 구간: 영문·라틴-1·일반 문장부호·화살표·원 숫자·도형·CJK 기호·전각 영숫자·원화 기호
BASE_RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x2190, 0x21FF), (0x2460, 0x24FF),
               (0x25A0, 0x26FF), (0x3000, 0x303F), (0xFF01, 0xFF5E), (0x20A9, 0x20A9)]


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def to_ranges(cps):
    out, start, prev = [], None, None
    for c in sorted(cps):
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            out.append([start, prev])
            start = prev = c
    if start is not None:
        out.append([start, prev])
    return out


def source_chars():
    files = subprocess.run(['git', '-C', ROOT, 'ls-files', *SOURCE_GLOBS], capture_output=True,
                           text=True, encoding='utf-8', check=True).stdout.splitlines()
    used = set()
    for rel in files:
        if not rel or rel.startswith(SKIP_PREFIX):
            continue
        with open(os.path.join(ROOT, rel), encoding='utf-8', errors='ignore') as f:
            used |= {ord(ch) for ch in f.read()}
    return used


def main():
    src_cmap = set(TTFont(SRC).getBestCmap().keys())
    ksx = {c for c in range(0xAC00, 0xD7A4) if len(chr(c).encode('euc-kr', 'ignore')) == 2}
    base = {c for a, b in BASE_RANGES for c in range(a, b + 1)}
    core = (base | ksx | source_chars()) & src_cmap

    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = TTFont(SRC)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=core)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(OUT)

    manifest = {
        'source': 'PretendardVariable.woff2',
        'source_sha256': sha256(SRC),
        'subset': 'PretendardVariable-core.woff2',
        'subset_sha256': sha256(OUT),
        'subset_bytes': os.path.getsize(OUT),
        'covered': to_ranges(core),
        'dropped': to_ranges(src_cmap - core),
    }
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, ensure_ascii=False)
        f.write('\n')
    print(f'core {len(core)}자 · {manifest["subset_bytes"]:,} bytes (원본 {os.path.getsize(SRC):,}) · 뺀 글자 {len(src_cmap - core)}자')


if __name__ == '__main__':
    sys.exit(main())
