# -*- coding: utf-8 -*-
"""시·도 감면 조례 «원문 안내» 카드 스냅샷 생성 (260921 파일럿 1장)

  python project/scripts/build-ordinance-cards.py

무엇을 하나
  법제처 자치법규 API(jt-law-mcp 의 tools.ordinance)로 「경기도 도세 감면 조례」 제6조를
  받아, 식별자(조례명·자치법규일련번호·시행일자·공포번호)와 조문 «원문», 조회한 날짜,
  법제처 원문 링크를 project/data/ordinance-cards.json 에 기록한다.

⛔ 이 파일의 내용은 «세액 계산에 절대 반영하지 않는다».
   조례의 경감률은 원문 안내용 텍스트일 뿐이며, 화면은 「이 계산에는 넣지 않았습니다」를
   함께 표시한다(project/src/ReportAcquisition.jsx 의 JTAcqOrdinanceCard).
   회귀 시험 project/tests_acq_flow.js ④ 가 매퍼 출력 불변을 고정한다.

⛔ 산출물에 법제처 API 사용자 ID(OC) 를 넣지 않는다.
   도구가 돌려주는 source_url 에는 OC 가 없지만(tools/ordinance.py), 여기서도 한 번 더
   검사해 값이 섞여 들어오면 파일을 쓰지 않고 실패한다.

불완전하면 «쓰지 않는다»
   status != "OK" 이거나 completeness.complete 가 거짓이면 파일을 건드리지 않고 종료코드 1.
   낡은 스냅샷을 남기는 편이, 반쪽짜리 원문을 「현행 원문」이라고 내보내는 것보다 낫다.
   (조회일로부터 30일이 지나면 번들 빌드가 경고한다 — project/scripts/build_bundle.mjs)
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

# 파일럿 1장 — 「1개 지역 × 검증된 쟁점 1개」(Astra R1-F11). 늘리기 전에 오너 결재.
TARGETS = [
    {
        "region": "경기도",
        "name": "경기도 도세 감면 조례",
        "article_num": "6",
        # 조문이 가리키는 상위 법령 — 화면의 「확인이 필요합니다」 안내가 이 조를 가리킨다.
        "upstream": "지방세특례제한법 제78조",
    },
]

# 사람이 열어 볼 법제처 원문 페이지 (260921 실측: 200 · title 「자치법규 > 경기도 도세 감면 조례」)
VIEWER_URL = "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq={serial}"


def fail(msg):
    sys.stderr.write("[build-ordinance-cards] 실패: %s\n" % msg)
    sys.exit(1)


def main():
    if not os.path.isdir(JT_LAW_MCP):
        fail("jt-law-mcp 경로를 찾지 못했습니다: %s" % JT_LAW_MCP)
    sys.path.insert(0, JT_LAW_MCP)
    try:
        from tools.ordinance import get_ordinance_detail, get_oc
    except Exception as e:  # noqa: BLE001
        fail("tools.ordinance 를 불러오지 못했습니다: %s" % e)

    oc = ""
    try:
        oc = str(get_oc() or "")
    except Exception:  # noqa: BLE001
        oc = ""

    today = datetime.date.today().isoformat()
    cards = {}

    for t in TARGETS:
        res = get_ordinance_detail(region=t["region"], name=t["name"], article_num=t["article_num"])
        status = res.get("status")
        if status != "OK":
            fail("%s / %s 제%s조 — status=%s (%s)"
                 % (t["region"], t["name"], t["article_num"], status, res.get("hint") or res.get("error") or ""))
        comp = res.get("completeness") or {}
        if not comp.get("complete"):
            fail("%s / %s 제%s조 — 조회가 불완전합니다(issues=%s). 반쪽 원문을 «현행»이라고 내보내지 않습니다."
                 % (t["region"], t["name"], t["article_num"], comp.get("issues")))

        arts = res.get("articles") or []
        if len(arts) != 1:
            fail("%s 제%s조 — 조문이 %d건입니다(1건이어야 합니다)." % (t["name"], t["article_num"], len(arts)))
        art = arts[0]
        ident = res.get("identifiers") or {}
        serial = str(ident.get("자치법규일련번호") or "")
        if not serial:
            fail("%s — 자치법규일련번호를 읽지 못했습니다." % t["name"])

        body = (art.get("조내용") or "").strip()
        if not body:
            fail("%s 제%s조 — 조문 본문이 비었습니다." % (t["name"], t["article_num"]))

        cards[t["region"]] = {
            "region": t["region"],
            "ordinanceName": ident.get("자치법규명") or t["name"],
            "ordinanceSerial": serial,
            "ordinanceId": str(ident.get("자치법규ID") or ""),
            "effectiveDate": str(ident.get("시행일자") or ""),
            "promulgationDate": str(ident.get("공포일자") or ""),
            "promulgationNo": str(ident.get("공포번호") or ""),
            "revisionInfo": str(ident.get("제개정정보") or ""),
            "articleLabel": art.get("조표시") or ("제%s조" % t["article_num"]),
            "articleTitle": art.get("조제목") or "",
            "articleText": body,
            "upstream": t["upstream"],
            "fetchedAt": today,
            "sourceUrl": VIEWER_URL.format(serial=serial),
            "apiUrl": res.get("source_url") or "",
            # 화면이 이 값을 계산에 쓰지 않는다는 사실을 데이터에도 박아 둔다.
            "appliedToCalculation": False,
        }

    payload = {
        "_note": "법제처 자치법규 API 스냅샷. 세액 계산에 반영하지 않는다(원문 안내 전용). "
                 "재생성: python project/scripts/build-ordinance-cards.py",
        "generatedAt": today,
        "cards": cards,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"

    # OC 유출 방지 — 값이 짧아 오탐이 날 수 있으므로 «URL 질의 인자 형태»와 원문 모두 본다.
    if oc:
        if re.search(r"[?&]OC=", text, re.I) or oc in text:
            fail("산출물에 법제처 API 사용자 ID(OC) 로 보이는 값이 섞였습니다 — 파일을 쓰지 않았습니다.")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("OK  조례 카드 %d장 -> %s (조회일 %s)" % (len(cards), os.path.relpath(OUT_PATH, REPO_ROOT), today))
    for r, c in cards.items():
        print("    %s / %s %s / 시행일 %s / 공포 제%s호 / 일련번호 %s"
              % (r, c["ordinanceName"], c["articleLabel"], c["effectiveDate"], c["promulgationNo"], c["ordinanceSerial"]))


if __name__ == "__main__":
    main()
