/* @jsx React.createElement */
/* ──────────────────────────────────────────────────────────────────────────
   JT 리포트 계산기 — 법령 의존 값 SSOT (Single Source of Truth) + 입력 가드 규약
   ──────────────────────────────────────────────────────────────────────────
   목적: 화면 라벨·계산 분기에 흩어진 「법이 바뀌면 같이 바뀌어야 하는 값」을
        한 곳에 모아, 법 개정 시 여기만 갱신하면 되게 한다.
   2026 자녀세액공제는 본문 연령과 부칙의 단계 적용·2017년생 제외를 함께 확인한다.

   ★ 갱신 규칙 (법령 개정 시):
     ① 아래 값 수정  ② 출처 조문·시행일 갱신  ③ 「사용 위치」 라벨/분기가 이
        상수를 읽는지 확인  ④ 1차소스(jt-law-mcp)로 검증 후 반영.

   ★ 입력 가드 규약 (각 계산기 canNext 공통 — 새 문항 추가 시 준수):
     1) 조건부 필수: 「선택지 yes」가 선행하면 연계 금액칸을 빈칸 방치 금지.
        질문에  requiredIf: (a) => a.X === 'yes'
        canNext에  const mustFill = cur.requiredIf && cur.requiredIf(answers);
                   if (cur.optional && !mustFill) return true;
        (사례: 사전증여 '있음' 후 금액 빈칸 → 세액 과소. compare·상속·증여 적용)
     2) optional 빈칸 방향성: optional 숫자 빈칸은 0으로 처리된다.
        그 0이 세금을 '낮추면' 위험(requiredIf 또는 관계기반 추정 필요),
        '높이면' 보수적(안전). 새 optional 필드는 방향을 반드시 확인할 것.
     3) 빈문자열 가드(allowZero): allowZero 숫자칸은 canNext에서 빈칸을 막아
        '미상태(빈칸)'와 '0'을 구분 (Number('')=0 누출 방지).
   ────────────────────────────────────────────────────────────────────────── */

window.JT_LAW_VALUES = {
  // 소득세법 59의2 + 법률21548 부칙2: 2026 귀속 한정. 미래 연도에 재사용 금지.
  childTaxCredit: {
    attributionYear: 2026, transitionalMinAge: 9, excludedBirthYear: 2017,
    qualifiedBirthDateThrough: '2016-12-31',
    question2026: '2026년 귀속 자녀세액공제 대상 자녀·손자녀는 몇 명인가요?',
    guidance2026: '2026년 기본공제대상인 자녀(입양자·위탁아동 포함)와 손자녀 중 2016년 12월 31일 이전 출생자로 공제요건을 확인한 인원만 입력하세요. 부칙상 2026년은 9세 이상이지만 2017년 출생자는 연령단계 특례에서 제외됩니다. 기본공제의 소득·나이·장애인 예외 등 요건도 확인하세요. 출산·입양 추가공제 인원과 구별합니다. 없으면 0.',
    article: '소득세법 §59의2①·법률21548 부칙 §2', effective: '2026-04-21',
  },
  // 민법상 성년 — 민법 §4 (증여 미성년 공제 2천만·생애최초 감면 제외 등의 기준)
  adultAge: 19,  // article: '민법 §4'

  // ── 인벤토리(현재 각 계산기 라벨/엔진에 분산. 법 개정 시 함께 점검) ─────────
  // 증여재산공제: 배우자 6억·직계 5천만(미성년 2천만)·기타친족 1천만 (상증법 §53) — ReportGift·ReportCompare·엔진
  // 간이 부가가치율: 15/20/25/30/40% (부가세 시행령 §111②, 시행 2026.2.27) — ReportVat·엔진
  // 단기 양도세율: 1년미만 70%·2년미만 60% (소득세법 §104①) — ReportCGT·엔진
  // 생애최초 취득세 감면: 200만(미성년 제외), 일몰 2028.12.31 (지특법 §36의3) — ReportAcquisition·엔진
  // 다주택 양도 중과 복원: 2026.5.10 (소득세법 §104⑦ 부칙) — ReportCGT·엔진(자동 분기)
  // 4대보험 요율: 정본은 ReportInsurance.jsx INS_RATES_2026 (이중관리 stale 방지 — 종전 주석은 2025 기준이었음, 수정 260628 INSURANCE-R2-01). 국민연금 본인부담률 단계인상(2025 연금개혁) 시행시기는 ReportInsurance에서 일원 관리
};

// 안전 접근자 — 로드 순서/누락에 견고(없으면 기본값). 라벨 등에서 사용.
window.jtLaw = function (path, dflt) {
  try {
    var v = window.JT_LAW_VALUES;
    String(path).split('.').forEach(function (k) { v = v[k]; });
    return (v === undefined || v === null) ? dflt : v;
  } catch (e) { return dflt; }
};
