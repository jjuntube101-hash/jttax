# INSIGHTS · 인사이트 자동화 파이프라인

JT 세무법인의 칼럼·사례 글을 **마크다운 파일 하나만 추가하면** 사이트에 자동 게시되도록 구축된 폴더입니다.

## 🧭 작동 방식

```
insights/
  ├─ 2026-04-12-audit-first-72h.md      ← 새 글은 여기에 추가
  ├─ 2026-04-03-gift-vs-transfer.md
  ├─ 2026-03-21-creator-income-2026.md
  └─ build-insights.mjs                  ← 빌드 스크립트 (Node.js)
```

빌드 스크립트가 위 파일들을 스캔해서:
1. 프론트매터(제목·태그·요약 등)를 읽어 **`src/Data.jsx`의 `insights` 배열을 자동 재생성**
2. 각 글의 본문을 **`insights/<slug>.html`로 렌더링** (공유용 단독 페이지)
3. `sitemap.xml`에 신규 URL을 자동 추가

배포 파이프라인(Vercel / GitHub Actions / Netlify)에 이 스크립트를 연결하면 **"insights/ 폴더에 .md 파일 푸시 → 자동 배포"** 가 됩니다.

## ✍️ 새 글 작성법

`insights/2026-05-01-my-article-slug.md` 같은 이름으로 파일 생성:

```markdown
---
title: 세무조사 통지 직후 72시간
slug: audit-first-72h
date: 2026-04-12
tag: INSIGHT · AUDIT
excerpt: 조사 통지는 시점 싸움입니다. 첫 72시간 안에 정리해야 할 자료와 접촉 금기를 정리합니다.
author: 수석 대표 세무사
---

# 본문 제목

본문은 마크다운으로 자유롭게 작성합니다.

## 소제목

- 리스트
- **강조**
- [링크](https://jttax.co.kr)

> 인용문
```

## 🤖 Claude Code 연동

**Claude Code CLI**를 이용해 "주제를 던지면 초안을 써 주는" 자동 작성 흐름도 가능합니다.

### 방법 A — 수동 호출
```bash
# 터미널에서
claude "아래 주제로 JT 세무법인 인사이트 글을 작성해줘. 길이 1200자, 제이티 톤(감이 아닌 근거, 말이 아닌 문서), 마크다운 프론트매터 포함: 주제=가업승계 공제 사후관리 체크리스트" > insights/2026-05-10-succession-checklist.md
```

### 방법 B — GitHub Actions (완전 자동화)
`.github/workflows/insights.yml`을 만들어 월 1회 자동으로 주제를 뽑아 글을 생성하도록 할 수 있습니다. 템플릿은 이 폴더 안 `SCHEDULED_EXAMPLE.yml` 참고 (배포 후 복사하세요).

### 방법 C — 가장 쉬운 방법 (권장)
1. Claude.ai에서 초안 작성 요청
2. 응답을 그대로 `.md` 파일로 저장해 `insights/` 폴더에 업로드
3. 자동 배포됨

## 🔧 빌드 스크립트 실행

```bash
cd insights
node build-insights.mjs
```

그러면:
- ✅ `src/Data.jsx`의 `insights` 배열이 재생성됨
- ✅ `insights/<slug>.html` 단독 페이지 생성
- ✅ `sitemap.xml`에 새 URL 추가

## 📋 프론트매터 필드

| 필드 | 필수 | 설명 |
|---|---|---|
| `title` | ✅ | 글 제목 (60자 이내) |
| `slug` | ✅ | URL 경로 (영문·하이픈). 파일명과 일치 권장 |
| `date` | ✅ | YYYY-MM-DD |
| `tag` | ✅ | `INSIGHT · LEGACY` 같이 대분류 태그 |
| `excerpt` | ✅ | 카드에 노출되는 1~2줄 요약 (160자 이내) |
| `author` | ⚪ | 작성자 (기본: "JT 세무법인") |
| `og` | ⚪ | 공유용 이미지 경로 (기본: 사이트 공용 OG) |

## 🎯 톤 가이드

JT 세무법인 톤으로 글을 쓸 때 참고:
- **감이 아닌 근거** — 법령·예규·판례 인용
- **말이 아닌 문서** — 명확·간결·담담
- 1인칭보다 3인칭. 혹은 "우리는"
- 영어 남용 금지. 한자 남용 금지.
- 마지막 문단은 반드시 "정확한 검토는 담당 세무사 상담을 통해" 정도의 면책 한 줄
