# -*- coding: utf-8 -*-
"""시·도 감면 조례 «원문 안내» 카드 생성 — 17개 시도 전체 (260921 오너 결재로 파일럿 1장→확대)

  python project/scripts/build-ordinance-cards.py

무엇을 하나
  17개 시도 전부에 대해 법제처 자치법규 API(jt-law-mcp 의 tools.acquisition_bundle
  ._find_sido_ordinance → 내부에서 tools.ordinance.search_ordinance·get_ordinance_detail·
  tools.acquisition_bundle._find_sido_ordinance_names 를 그대로 쓴다)로 그 시도의
  「○○시세/도세 감면 조례」의 «오늘 기준 현행» 본문을 받는다.
  그 조례의 조문 전체 중에서 조내용(원문)에 「제78조」와 「산업단지」가 «함께» 들어 있는
  조문을 기계적 문자열 포함 검사로 찾는다 — 법령 해석·조문 번호 매핑은 하지 않는다.

  정확히 1개일 때만 그 시도의 카드를 만든다.
    - 0개  → 「해당 조문 없음」
    - 2개+ → 「후보 여럿」(후보 조문 번호를 그대로 결과표에 적는다. 임의로 하나를 고르지 않는다)
    - 조회 자체가 SELECTED 가 아니거나 partial·completeness 가 불완전을 가리키면
      → 「조회 불완전」(「규정 없음」과 구분한다 — 예: 260921 실측 광주광역시·전라남도는
      선택 가능한 계보가 REPEALED 라 대체 조례를 기계로 특정할 수 없었다)
  스크립트는 개별 시도의 실패로 전체를 중단하지 않고, 끝에 17개 시도 결과표를 출력한다.
  (경기도 도세 감면 조례 제6조가 이 확대의 원본 파일럿 1장이었다 — 260921.)

⛔ 이 파일의 내용은 «세액 계산에 절대 반영하지 않는다».
   조례의 경감률은 원문 안내용 텍스트일 뿐이며, 화면은 「이 계산에는 넣지 않았습니다」를
   함께 표시한다(project/src/ReportAcquisition.jsx 의 JTAcqOrdinanceCard).
   회귀 시험 project/tests_acq_flow.js ④ 가 매퍼 출력 불변을 고정한다.

⛔ 산출물에 법제처 API 사용자 ID(OC) 를 넣지 않는다.
   도구가 돌려주는 source_url 에는 OC 가 없지만(tools/ordinance.py), 그 «불변식»에 기대지
   않는다. ①모든 문자열에서 `OC=` 질의 인자를 먼저 «제거»하고 ②그러고도 `OC=` 가 남아 있으면
   파일을 쓰지 않고 실패한다. ③이 검사는 get_oc() 조회 성공 여부와 «무관하게» 항상 돈다.
   (260921 Codex R2-F6: 종전에는 검사가 `if oc:` 안에 있어, get_oc() 가 예외를 던지면
    OC 가 섞인 apiUrl 이 그대로 기록될 수 있었다.)
"""
import json
import os
import re
import sys
import datetime

JT_LAW_MCP = r"D:\클로드\mcp-servers\jt-law-mcp"
HERE = os.path.dirname(os.path.abspath(__file__))              # project/scripts
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))    # 저장소 루트
OUT_PATH = os.path.join(REPO_ROOT, "project", "data", "ordinance-cards.json")

# 17개 시도 — project/src/ReportAcquisition.jsx 의 ACQ_REGIONS 와 «글자까지» 같아야 한다.
# 시험 project/tests_acq_flow.js 가 두 목록을 대조한다(강원특별자치도·전북특별자치도·
# 세종특별자치시·제주특별자치도 같은 최신 법정 명칭 포함).
SIDOS = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
    "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도",
    "경상북도", "경상남도", "제주특별자치도",
]

# 카드가 가리키는 상위 법령 — 화면의 「확인이 필요합니다」 안내가 이 조를 가리킨다.
UPSTREAM = "지방세특례제한법 제78조"
# 조문 본문(조내용)에 이 둘이 «함께» 있어야 후보로 본다. 기계적 문자열 포함 검사일 뿐이다.
TARGET_TOKENS = ("제78조", "산업단지")

# 사람이 열어 볼 법제처 원문 페이지 (260921 실측: 200 · title 「자치법규 > 경기도 도세 감면 조례」)
VIEWER_URL = "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq={serial}"


def fail(msg):
    sys.stderr.write("[build-ordinance-cards] 실패: %s\n" % msg)
    sys.exit(1)


# `?OC=xxx` / `&OC=xxx` 질의 인자 하나를 통째로 지운다. 대소문자 무시.
_OC_PARAM = re.compile(r"(?i)([?&])OC=[^&#\"'\s]*&?")


def strip_oc(value):
    """문자열에서 OC 질의 인자를 제거한다. OC 값을 몰라도(get_oc 실패) 동작한다.

    `?OC=a&target=b` → `?target=b` / `?target=b&OC=a` → `?target=b`
    URL 이 아닌 값은 그대로 돌려준다(치환 대상이 없으므로).
    """
    if not isinstance(value, str):
        return value
    prev = None
    out = value
    while prev != out:                       # `?OC=a&OC=b` 처럼 여러 번 붙은 경우까지
        prev = out
        out = _OC_PARAM.sub(lambda m: m.group(1), out)
    return out.replace("?&", "?").rstrip("?&")


def strip_oc_deep(obj):
    """dict/list/str 를 재귀로 훑어 OC 질의 인자를 제거한다."""
    if isinstance(obj, dict):
        return {k: strip_oc_deep(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [strip_oc_deep(v) for v in obj]
    return strip_oc(obj)


# 조문 제목 끝에 «본조신설 2019.9.26.» 같은 꺾쇠 연혁 표기가 붙어 오는 경우가 있다
# (260921 실측: 경상남도 카드). 제목에서만 떼어 낸다 — 조문 원문(조내용) 전문은 그대로 둔다.
_TITLE_ANNOTATION = re.compile(r"\s*<[^<>]*>")


def clean_article_title(title):
    """조문 제목에서 <본조신설 2019.9.26.> 같은 꺾쇠 연혁 표기를 떼고 앞뒤 공백을 정리한다."""
    if not isinstance(title, str):
        return title
    cleaned = _TITLE_ANNOTATION.sub("", title)
    return re.sub(r"\s+", " ", cleaned).strip()


def find_target_articles(articles):
    """조내용(원문)에 TARGET_TOKENS 가 «모두» 들어 있는 조문만 골라 돌려준다.

    법령 해석·조문 번호 매핑은 하지 않는다 — 단순 문자열 포함 검사다. 지방세특례제한법
    제78조 위임에 따른 산업단지 추가 경감 조문은 시도마다 조 번호가 다르므로(제6조·제13조·
    제8조의3 등, 260921 실측), 번호가 아니라 «본문에 무엇이 적혀 있는가»로 찾는다.
    """
    out = []
    for a in articles:
        body = a.get("조내용") or ""
        if all(tok in body for tok in TARGET_TOKENS):
            out.append(a)
    return out


def describe_incomplete(res):
    """SELECTED 가 아니거나 불완전한 조회 결과를 사람이 읽을 한 줄로 요약한다."""
    status = res.get("status") or "UNKNOWN"
    reasons = res.get("reasons")
    if reasons:
        return "%s: %s" % (status, "; ".join(reasons))
    hint = res.get("hint")
    if hint:
        return "%s: %s" % (status, hint)
    comp = res.get("completeness") or {}
    if comp.get("issues"):
        return "%s: %s" % (status, "; ".join(comp["issues"]))
    return status


def main():
    if not os.path.isdir(JT_LAW_MCP):
        fail("jt-law-mcp 경로를 찾지 못했습니다: %s" % JT_LAW_MCP)
    sys.path.insert(0, JT_LAW_MCP)
    try:
        from tools.ordinance import get_oc
        from tools.acquisition_bundle import _find_sido_ordinance
    except Exception as e:  # noqa: BLE001
        fail("tools.ordinance / tools.acquisition_bundle 를 불러오지 못했습니다: %s" % e)

    oc = ""
    try:
        oc = str(get_oc() or "")
    except Exception:  # noqa: BLE001
        oc = ""

    today = datetime.date.today().isoformat()
    today8 = today.replace("-", "")
    cards = {}
    report = []  # [(시도, 버킷, 상세문구)]

    for sido in SIDOS:
        try:
            res = _find_sido_ordinance(sido, today8)
        except Exception as e:  # noqa: BLE001
            report.append((sido, "조회 불완전", "조회 중 예외: %s" % e))
            continue

        status = res.get("status")
        comp = res.get("completeness") or {}
        if status != "SELECTED" or res.get("partial") or not comp.get("complete"):
            report.append((sido, "조회 불완전", describe_incomplete(res)))
            continue

        arts = res.get("articles") or []
        hits = find_target_articles(arts)
        if len(hits) == 0:
            report.append((sido, "해당 조문 없음",
                            "「제78조」+「산업단지」를 포함한 조문이 없다(조문 %d개 중)" % len(arts)))
            continue
        if len(hits) >= 2:
            labels = ", ".join(a.get("조표시") or "?" for a in hits)
            report.append((sido, "후보 여럿", "후보: " + labels))
            continue

        art = hits[0]
        ident = res.get("identifiers") or {}
        serial = str(ident.get("자치법규일련번호") or "")
        body = (art.get("조내용") or "").strip()
        if not serial:
            report.append((sido, "조회 불완전", "자치법규일련번호를 읽지 못했다"))
            continue
        if not body:
            report.append((sido, "조회 불완전", "조문 본문이 비었다"))
            continue

        accepted_names = res.get("accepted_names") or []
        cards[sido] = {
            "region": sido,
            "ordinanceName": ident.get("자치법규명") or (accepted_names[0] if accepted_names else ""),
            "ordinanceSerial": serial,
            "ordinanceId": str(ident.get("자치법규ID") or ""),
            "effectiveDate": str(ident.get("시행일자") or ""),
            "promulgationDate": str(ident.get("공포일자") or ""),
            "promulgationNo": str(ident.get("공포번호") or ""),
            "revisionInfo": str(ident.get("제개정정보") or ""),
            "articleLabel": art.get("조표시") or "",
            "articleTitle": clean_article_title(art.get("조제목") or ""),
            "articleText": body,
            "upstream": UPSTREAM,
            "fetchedAt": today,
            "sourceUrl": VIEWER_URL.format(serial=serial),
            "apiUrl": res.get("source_url") or "",
            # 화면이 이 값을 계산에 쓰지 않는다는 사실을 데이터에도 박아 둔다.
            "appliedToCalculation": False,
        }
        report.append((sido, "카드 생성", art.get("조표시") or ""))

    payload = {
        "_note": "법제처 자치법규 API 스냅샷. 세액 계산에 반영하지 않는다(원문 안내 전용). "
                 "재생성: python project/scripts/build-ordinance-cards.py",
        "generatedAt": today,
        "cards": cards,
    }

    # ── OC 유출 방지 (260921 Codex R2-F6) ─────────────────────────────────
    # ① 먼저 «제거»한다 — OC 값을 몰라도(get_oc 실패) 질의 인자 형태로 지울 수 있다.
    payload = strip_oc_deep(payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    # ② 제거한 뒤에도 남아 있으면 «쓰지 않는다». 이 검사는 oc 조회 성공 여부와 무관하게 돈다.
    if re.search(r"[?&]OC=", text, re.I):
        fail("산출물에서 OC 질의 인자를 제거하지 못했습니다 — 파일을 쓰지 않았습니다.")
    # ③ 값을 알고 있으면 원문에 그대로 박힌 경우까지 본다(질의 인자 형태가 아닌 유출).
    if oc and oc in text:
        fail("산출물에 법제처 API 사용자 ID(OC) 로 보이는 값이 섞였습니다 — 파일을 쓰지 않았습니다.")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

    print("OK  조례 카드 %d/%d 시도 생성 -> %s (조회일 %s)"
          % (len(cards), len(SIDOS), os.path.relpath(OUT_PATH, REPO_ROOT), today))
    print()
    print("시도별 결과:")
    bucket_order = {"카드 생성": 0, "후보 여럿": 1, "해당 조문 없음": 2, "조회 불완전": 3}
    for sido, bucket, detail in sorted(report, key=lambda r: (bucket_order.get(r[1], 9), r[0])):
        print("  [%s] %s — %s" % (bucket, sido, detail))


if __name__ == "__main__":
    main()
