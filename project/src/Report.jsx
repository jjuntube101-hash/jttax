/* @jsx React.createElement */
/* JT 리포트 — 허브 + 공통 레이아웃 + 라우팅 + 면책 고지 */

const { useState: useReportState, useEffect: useReportEffect, useMemo: useReportMemo } = React;

/* ══════════════════════════════════════════════════════════════════════════
   숫자 입력 정규화 — «전 계산기 공용». 이 파일이 Report*.jsx 중 가장 먼저 로드된다.

   ⚠️ 「숫자가 아닌 문자를 전부 지운다」(`replace(/[^0-9]/g,'')`)는 방식은 **자릿수를 바꾼다**:
        "50,000,000.00" → 소수점만 사라져 5000000000  (100배)
        "18e8"          → 188                        (자릿수 붕괴)
        "１２３"(전각)   → ''                         (붙여넣기가 통째로 사라짐)
        "-100"          → 100                        (부호만 조용히 삭제)
      엑셀·거래소 명세·부동산 사이트에서 복사해 붙이면 실제로 일어나는 입력들이다.
      260805 개편안·가상자산 계산기에서 처음 잡았고, 260806 전수 점검 결과 **나머지
      계산기 7종도 같은 코드**였다 — 그래서 규칙을 여기 한 곳에 두고 전부가 재사용한다.

   반환: 정규화된 문자열 / '' (빈 입력) / **null = 「받지 않는다」**
         (호출부는 null 이면 값을 갱신하지 않는다 — 자릿수가 바뀐 값을 저장하느니 무시한다)
   ══════════════════════════════════════════════════════════════════════════ */
/* ⚠️ 구분자를 «위치 검증 없이» 지우면 여전히 자릿수가 바뀐다 (260806 Codex E P1):
     "1,2" → 12 · "1원2" → 12 · "12\n34" → 1234 · "1 2" → 12
   그래서 ①먼저 «전체 형태»를 확인하고 ②통과한 것만 구분자를 걷어낸다.
   허용 형태: 구분자 없는 숫자 / 정확한 천단위 표기(1,234,567) / 끝에 「원」·「₩」 한 번.
   앞뒤 공백은 붙여넣기에서 흔하므로 허용하되, 숫자 «사이»의 공백은 거부한다. */
window.jtMoneyDigits = function (raw) {
  var s = String(raw == null ? '' : raw).normalize('NFKC').trim();
  if (s === '') return '';
  s = s.replace(/^₩\s*/, '').replace(/\s*원$/, '').trim();       // 통화기호는 «양 끝»에서만
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(s)) return null;
  return s.replace(/,/g, '').split('.')[0].replace(/^0+(?=\d)/, '');  // 원 단위이므로 소수부는 절사
};
/* 기간·비율·면적처럼 «소수»를 허용하는 칸 — 소수점 하나까지 살린다 */
window.jtDecimalInput = function (raw) {
  var s = String(raw == null ? '' : raw).normalize('NFKC').trim();
  if (s === '') return '';
  if (!/^\d*(?:\.\d*)?$/.test(s)) return null;   // 구분자·공백을 «지우지 않고» 거부한다
  return s;
};
/* 문항 입력 공용 핸들러 — `money` 여부로 갈라 정규화하고, 거부되면 값을 그대로 둔다 */
window.jtSetNumericAns = function (setAns, id, raw, isMoney) {
  var v = isMoney ? window.jtMoneyDigits(raw) : window.jtDecimalInput(raw);
  if (v !== null) setAns(id, v);
};

// ============ 진단 메타 ============
window.JT_REPORTS = [
  {
    id: 'appeal',
    tag: 'APPEAL',
    kr: '경정청구 가능성 진단',
    en: 'Refund Eligibility Check',
    minutes: 5,
    questions: 5,
    hook: '이미 낸 세금, 돌려받을 수 있는지 5분 안에.',
    sub: '최근 5년 내 신고 건에 대해 경정청구 가능성과 사유를 살핍니다.',
    who: '최근 5년 이내 신고·납부한 분',
    output: '가능성 등급 · 해당 가능 사유 · 필요 자료',
  },
  {
    id: 'cgt',
    tag: 'LIVE',
    kr: '양도소득세 간이 계산',
    en: 'Capital Gains Estimate',
    minutes: 5,
    questions: 6,
    hook: '이 집 팔면 세금 얼마 나옵니까?',
    sub: '1세대1주택·장기보유특별공제·중과세 여부를 반영한 추정 세액.',
    who: '부동산 양도를 앞둔 분',
    output: '추정 양도소득세 · 주의 포인트 · 절세 여지',
  },
  {
    id: 'income',
    tag: 'BOOKKEEPING',
    kr: '종합소득세 절세 점검',
    en: 'Comprehensive Income Tax Review',
    minutes: 5,
    questions: 5,
    hook: '5월이 두려운 분을 위한 절세 체크리스트.',
    sub: '업종·수입·지출 구조에서 놓치고 있을 공제·특례 TOP 3.',
    who: '프리랜서·개인사업자·크리에이터·전문직',
    output: '예상 누락 항목 · 공제·특례 제안 · 다음 준비',
  },
];

// ============ 면책 고지 (강함 버전) ============
function JTReportDisclaimer({ variant }) {
  const full = (
    <>
      <strong>면책 고지</strong>
      <p>본 리포트는 공개 정보와 이용자가 입력한 사실관계를 바탕으로 제공되는 <strong>간이 참고 자료</strong>이며, 특정 거래·납세자에 대한 <strong>확정적 세무 판단이 아닙니다</strong>. 정식 검토는 반드시 유상 상담을 통해 담당 세무사가 자료 일체를 확인한 후 진행됩니다.</p>
      <p>본 리포트는 <strong>법적 효력이 없으며</strong>, 제이티 세무법인과 이용자 사이에 <strong>어떠한 위임·자문 관계나 권리·의무도 발생시키지 않습니다</strong>. 본 리포트만을 근거로 한 신고·결정·소송으로 발생한 손실에 대해 당사는 책임을 지지 않습니다.</p>
      <p>법령·예규·판례는 수시로 변경됩니다. 열람 시점 기준 최신 자료를 담당 세무사가 재확인합니다.</p>
      {/* ⚠️ 「입력값 미저장」만 말하면 «전송»은 없는 것처럼 읽힌다. 실제로는 계산을 위해
          외부 엔진을 호출하고, 일부 진단은 AI 를 거치며, 이용자가 동의한 경우에만 사무소로
          전달된다. 하는 일을 그대로 적는다 (260806 Codex R4 P1). */}
      <p><strong>입력값 처리</strong> — 입력하신 값은 <strong>계정에 저장하지 않습니다</strong>. 다만 계산을 위해
        세액 계산 엔진(<code>jt-tax-engine</code>)으로 전송되며, 일부 진단(경정청구 가능성 등)은 AI 응답을 이용합니다.
        담당 세무사에게 전달되는 것은 <strong>이용자가 별도로 동의한 경우</strong>뿐입니다.</p>
    </>
  );
  if (variant === 'inline') {
    return (
      <div className="jt-report-disc jt-report-disc--inline">
        {full}
      </div>
    );
  }
  return (
    <section className="jt-report-disc jt-report-disc--block">
      <div className="jt-container">
        {full}
      </div>
    </section>
  );
}
window.JTReportDisclaimer = JTReportDisclaimer;

// ============ 공통 CTA 바 (진단 결과 하단) ============
function JTReportCta({ setRoute }) {
  return (
    <div className="jt-report-cta">
      <div className="jt-report-cta__txt">
        <h4>이 진단은 참고용입니다.</h4>
        <p>정확한 검토는 JT 세무사와 20분 상담에서.</p>
      </div>
      <div className="jt-report-cta__btns">
        <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'report_result'); setRoute && setRoute('booking'); }}>
          상담 예약 <span className="jt-arrow">→</span>
        </button>
        <a className="jt-btn jt-btn--ghost" href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'report_result')}>
          카톡 상담
        </a>
      </div>
    </div>
  );
}
window.JTReportCta = JTReportCta;

// ============ 공통 응답 무결성 검증기 (P1-4 코덱스) ============
// 정상 0원(예: 사업소득 100만 종소세 0원)을 실패로 오판하지 않도록 '>0'이 아니라
// ①객체 존재 ②오류필드 없음 ③필수 숫자키가 유한한 실수(≥0)인지로 판정한다.
if (typeof window !== 'undefined' && !window.jtValidCalc) {
  window.jtValidCalc = function (c, requiredKeys) {
    if (!c || typeof c !== 'object') return false;
    if (c.error || c.errors || c.detail) return false;               // 엔진 오류·부분 응답 거부
    const keys = (requiredKeys && requiredKeys.length) ? requiredKeys : ['총세부담'];
    return keys.every(function (k) {
      const v = c[k];
      return typeof v === 'number' && isFinite(v) && v >= 0;         // NaN·무한대·문자·누락 거부, 0은 정상
    });
  };
}

// ============ 공통 스텝 셸 (진단별 공용) ============
function JTReportShell({ title, subtitle, stepIdx, stepTotal, children, onBack, tag }) {
  // P2-2: 로딩·결과 화면은 stepIdx=stepTotal을 넘겨 진행률 100% 초과·"Step N+1/N"이 되던 것 클램프(0~100%)
  const _tot = Math.max(1, stepTotal || 0);
  const _stepNo = Math.max(0, Math.min(stepIdx + 1, _tot));
  const pct = Math.max(0, Math.min(100, Math.round((_stepNo / _tot) * 100)));
  return (
    <div className="jt-report-shell">
      <div className="jt-report-shell__head">
        <button className="jt-report-shell__back" onClick={onBack}>← 세금 계산기</button>
        <div className="jt-report-shell__meta">
          <span className="jt-tag">{tag}</span>
          <span>Step {_stepNo} / {_tot}</span>
        </div>
      </div>
      <div className="jt-report-shell__bar"><div style={{width: `${pct}%`}} /></div>
      <div className="jt-report-shell__title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="jt-report-shell__body">
        {children}
      </div>
    </div>
  );
}
window.JTReportShell = JTReportShell;

// ============ 세목 약자 배지 (Pretendard 타이포 · 모노톤 — 손그림 아이콘 대체) ============
const JT_ABBR = {
  cgt: '양도', gift: '증여', inheritance: '상속', acquisition: '취득', property: '재산',
  comprehensive: '종부', income: '종소', vat: '부가', insurance: '급여', corporate: '법인',
  youthstartup: '창업', compare: '비교', burden: '부담', appeal: '경정',
  'reform-cgt': '개편', 'reform-cre': '개편', crypto: '코인',
};
window.JT_ABBR = JT_ABBR;

// ============ 허브 랜딩 ============
function JTReportHub({ setRoute, setSubRoute }) {
  // ★ JT 절세 전략 도구 (프리미엄·핵심 차별화) — 여러 세금을 엮어 「가장 유리한 길」 탐색 + 세무사 상담 연계
  const premium = [
    { kr: '청년창업 세액감면 진단', tagline: '5년간 최대 100% 감면', d: '만 34세 이하(병역 시 최대 40세)가 정해진 업종·지역에서 창업하면 5년간 소득·법인세를 최대 100% 감면받습니다(조특법 §6). 업종코드·주소만 넣으면 감면 가능여부·감면율·창업배제·근거 판례까지 자동 판정 — 창업 전이면 「어떻게 하면 감면받는지」까지 설계합니다.', sub: 'youthstartup' },
    { kr: '처분방법 비교', tagline: '증여 vs 매매 vs 상속', d: '집·자산을 자녀에게 「팔까(매매)·증여할까·상속할까」 — 세 방법의 세금(증여·양도·상속·취득세)을 같은 부동산 기준으로 한 번에 비교하고, 가장 유리한 길을 찾습니다.', sub: 'compare' },
    { kr: '부담부증여 최적화', tagline: '채무비율 시뮬레이션', d: '자녀·배우자에게 부동산을 증여할 때 「빚(전세·대출)을 얼마나 끼우면」 세금이 최소인지 — 채무비율별 총세금을 시뮬레이션해 절세 여력을 보여줍니다.', sub: 'burden' },
  ];
  // 무료 부동산 세금 계산기 (단일 세목) — 동등 그리드
  const live = [
    { kr: '양도소득세', cat: '양도', minutes: 5, questions: 6, d: '집·부동산을 팔 때 — 1세대1주택 비과세·일시적2주택·입주권·장기보유특별공제·다주택 중과까지 검증 엔진으로 계산합니다.', sub: 'cgt' },
    { kr: '증여세', cat: '증여', minutes: 4, questions: 6, d: '관계·금액·부담부증여(빚도 함께 넘기는 증여)까지. 부동산은 주소로 공시가격을 조회합니다.', sub: 'gift' },
    { kr: '상속세', cat: '상속', minutes: 5, questions: 7, d: '배우자·자녀 공제, 채무·장례비·금융재산공제와 10년 내 사전증여 합산까지 계산합니다.', sub: 'inheritance' },
    { kr: '취득세', cat: '취득', minutes: 3, questions: 5, d: '살 때(매매·증여·상속·신축) — 다주택 중과·조정지역·생애최초 감면·농특세·지방교육세까지.', sub: 'acquisition' },
    { kr: '재산세', cat: '보유', minutes: 3, questions: 4, d: '집·건물·토지 보유 시 매년 — 공시가격·1세대1주택 특례·도시지역분·세부담 상한까지.', sub: 'property' },
    { kr: '종합부동산세', cat: '보유', minutes: 4, questions: 5, d: '6월 1일 기준 주택 공시 합계 — 1세대1주택 12억·연령·보유 세액공제·다주택 중과·재산세 공제까지.', sub: 'comprehensive' },
  ];
  // 사업자·법인 도구 (라이브) — 부동산 6종과 별도 분리
  const bizTools = [
    { kr: '종합소득세 계산기', cat: '종소세', minutes: 5, questions: 5, d: '사업·프리랜서·근로 소득을 합산해 내 종합소득세를 검증 엔진으로 계산합니다. 인적공제·자녀·연금저축 세액공제까지 반영해요.', sub: 'income', cta: '계산하기' },
    { kr: '부가가치세 계산기', cat: '부가세', minutes: 3, questions: 4, d: '일반·간이과세자 매출·매입만 넣으면 낼 부가세(또는 환급액)를 바로 계산합니다. 신용카드·매입세액 공제와 신고기한까지 안내해요.', sub: 'vat', cta: '계산하기' },
    { kr: '4대보험·실수령 계산기', cat: '급여', minutes: 2, questions: 3, d: '세전 월 급여만 넣으면 국민연금·건강보험·장기요양·고용보험과 세금을 떼고 실수령액을 즉시 계산합니다(2026 요율).', sub: 'insurance', cta: '계산하기' },
    { kr: '법인 전환 시뮬레이터', cat: '법인', minutes: 4, questions: 4, d: '개인사업자 이익과 대표 연봉만 넣으면, 개인(종합소득세)과 법인(법인세+대표 급여 근로소득세) 세부담을 검증 엔진으로 바로 비교합니다.', sub: 'corporate', cta: '비교하기' },
  ];
  // 곧 열릴 도구
  const soon = [
    { tag: 'AI ASSISTANT', kr: 'AI 세무 길잡이', d: '상황을 평범한 말로 입력하면, 맞는 분야와 다음 절차로 안내합니다.', star: true },
    { tag: 'AUDIT', kr: '세무조사 위험도 진단', d: '쟁점 노출도를 점수로 보고, 대비 포인트를 정리합니다.' },
  ];
  return (
    <>
      {/* 히어로 */}
      <section className="jt-section jt-report-hero">
        <div className="jt-container">
          <div className="jt-eyebrow reveal">JT TAX CORP. · 세금 계산기</div>
          <h1 className="jt-report-hero__title reveal">
            <span>내</span> <span>세금,</span>
            <br/>
            <span className="is-accent">직접 계산해 보세요.</span>
          </h1>
          <p className="jt-report-hero__sub reveal">
            양도·상속·증여·취득·재산·종부의 부동산 세금부터 <strong>종합소득세·실수령·법인 전환·청년창업 감면 진단까지</strong> — 검증된 계산 엔진으로 바로 계산합니다.<br/>
            세법을 가르치는 세무사가 직접 설계했습니다.
          </p>
          <div className="jt-report-hero__meta reveal">
            <span>● 로그인 불필요</span>
            <span>● 입력값을 계정에 저장하지 않습니다</span>
            <span>● 결과로 바로 상담 연결</span>
          </div>
        </div>
      </section>

      {/* 🔥 핫이슈 — 2026 세제개편안(2026.8.3 발표) 연도별 비교. 히어로 바로 아래 최상단 배치 */}
      <section className="jt-section jt-report-grid" style={{ background: 'linear-gradient(180deg,#fff4e8 0%,#fffaf4 100%)', borderTop: '3px solid #d0680a' }}>
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 999, background: 'rgba(208,104,10,.12)', border: '1px solid rgba(208,104,10,.45)', color: '#a8500a', fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', marginBottom: 14 }}>NEW · 2026.8.3 발표</div>
            <h2>2026 세제개편안, 내 세금은 얼마나 달라지나</h2>
            <p>양도세 장기보유특별공제가 <strong style={{ color: '#a8500a' }}>「보유」에서 「거주」로</strong>, 종부세는 <strong style={{ color: '#a8500a' }}>「주택 수」에서 「가액과 실거주」로</strong> 바뀝니다. 같은 집도 파는 해에 따라 세금이 달라집니다 — 연도별로 한 번에 비교해 보세요. <span style={{ color: '#8a6224' }}>(국회 통과 전 정부안 기준)</span></p>
          </div>
          <div className="jt-report-live-grid">
            {[
              { sub: 'reform-cgt', kr: '2026 세제개편안 양도세 계산기', tagline: '2026 · 2027 · 2028 · 2029년 비교', d: '장특공제가 거주 기준으로 바뀌면 내 양도세는 얼마가 될까. 다주택 중과 한시 완화(2027~2028년)와 새로 생기는 공제 한도(20억→10억)까지 반영해 네 개 연도를 한 화면에서 비교합니다.' },
              { sub: 'reform-cre', kr: '2026 종부세 개편안 계산기', tagline: '거주 14억 vs 비거주 9억', d: '1주택 기본공제가 실거주 여부로 갈립니다. 공정시장가액비율 인상(60→70→80%)과 가액 기준 세율 일원화까지 반영해 2026·2027·2028년 종부세를 비교합니다.' },
              { sub: 'crypto', kr: '가상자산(코인) 세금 계산기', tagline: '2027.1.1 시행 예정 · 22%', d: '코인 세금은 2027년 1월 1일부터입니다. 2026년 말까지 오른 부분은 「의제취득가액」으로 과세 대상에서 빠집니다 — 2026년에 팔 때와 2027년에 팔 때가 얼마나 다른지 계산합니다.' },
            ].map((x) => (
              <button key={x.sub} className="jt-report-live-card" onClick={() => setSubRoute(x.sub)} style={{ textAlign: 'left', border: '1px solid rgba(208,104,10,.35)', background: '#fff', borderRadius: 12, padding: '20px 22px', cursor: 'pointer', font: 'inherit' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#a8500a', letterSpacing: '.03em', marginBottom: 7 }}>{x.tagline}</div>
                <h3 style={{ fontSize: 18.5, margin: '0 0 8px' }}>{x.kr}</h3>
                <p style={{ fontSize: 13.5, color: '#6b6459', lineHeight: 1.65, margin: '0 0 12px' }}>{x.d}</p>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>연도별 비교하기 →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ★ 프리미엄 전략 도구 — 밝은 골드 톤(검정 히어로·흰 무료섹션 사이에서 돋보이게) */}
      <section className="jt-section jt-report-grid" style={{ background: 'linear-gradient(180deg,#f6efe0 0%,#fcf9f3 100%)', borderTop: '3px solid #c9a25e' }}>
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 999, background: 'rgba(176,123,58,.14)', border: '1px solid rgba(176,123,58,.5)', color: '#8a6224', fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', marginBottom: 14 }}>★ JT 절세 전략 도구 · 프리미엄</div>
            <h2>단일 계산을 넘어, 「가장 유리한 길」을 찾습니다</h2>
            <p>증여·양도·상속·취득세를 <strong style={{ color: '#8a6224' }}>한 번에 비교·최적화</strong> — 여러 세목을 함께 설계하는 멀티세목 전략입니다. 숫자는 무료로 보여드리고, 「안전하게 절세하는 실제 전략」은 세무사가 직접 설계합니다.</p>
          </div>
          <div className="jt-report-live-grid">
            {premium.map((r, i) => (
              <article
                key={r.sub}
                className="jt-report-live reveal"
                style={{ background: '#fff', border: '1.5px solid rgba(176,123,58,.55)', borderTop: '4px solid #c9a25e', boxShadow: '0 12px 30px rgba(140,100,40,.16)', transitionDelay: `${i * 60}ms`, cursor: 'pointer' }}
                onClick={() => setSubRoute(r.sub)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSubRoute(r.sub); } }}
              >
                <div className="jt-report-live__top">
                  <span className="jt-report-live__icon" style={{ background: '#c9a25e', color: '#fff' }}>{JT_ABBR[r.sub]}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#8a6224', fontSize: 11.5, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: '#c9a25e' }} />세무사 상담 연계</span>
                </div>
                <div style={{ color: '#8a6224', fontWeight: 800, fontSize: 11.5, letterSpacing: '.05em', marginBottom: 6 }}>절세 전략</div>
                <h3>{r.kr}</h3>
                <div style={{ color: '#a07a32', fontSize: 12.5, fontWeight: 700, marginTop: -4, marginBottom: 8 }}>{r.tagline}</div>
                <p className="jt-report-live__d">{r.d}</p>
                <div className="jt-report-live__foot">
                  <span className="jt-report-live__cta" style={{ background: '#b8863a', color: '#fff' }}>전략 보기 <span className="jt-arrow">→</span></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 무료 부동산 세금 계산기 (단일 세목) */}
      <section className="jt-section jt-report-grid">
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <h2>무료 부동산 세금 계산기</h2>
            <p>검증 엔진 · 로그인 없이 약 5분 · 결과로 바로 담당 세무사 상담</p>
          </div>
          <div className="jt-report-live-grid">
            {live.map((r, i) => (
              <article
                key={r.sub}
                className="jt-report-live reveal"
                style={{transitionDelay: `${i * 55}ms`}}
                onClick={() => setSubRoute(r.sub)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSubRoute(r.sub); } }}
              >
                <div className="jt-report-live__top">
                  <span className="jt-report-live__icon">{JT_ABBR[r.sub]}</span>
                  <span className="jt-report-live__badge"><span className="jt-report-live__dot" aria-hidden="true"></span>LIVE</span>
                </div>
                <h3>{r.kr} 계산기</h3>
                <p className="jt-report-live__d">{r.d}</p>
                <div className="jt-report-live__meta">
                  <span className="jt-report-live__chip">약 {r.minutes}분</span>
                  <span className="jt-report-live__chip">{r.questions}문항</span>
                </div>
                <div className="jt-report-live__foot">
                  <span className="jt-report-live__cta">계산하기 <span className="jt-arrow">→</span></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 사업자·법인 도구 (라이브) */}
      <section className="jt-section jt-report-grid">
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <h2>무료 소득세·급여 계산기</h2>
            <p>직장인·프리랜서·개인사업자라면 — 종합소득세·실수령액부터, 법인 전환이 유리한지까지 직접 계산해 보세요.</p>
          </div>
          <div className="jt-report-live-grid">
            {bizTools.map((r, i) => (
              <article
                key={r.sub}
                className="jt-report-live reveal"
                style={{transitionDelay: `${i * 55}ms`}}
                onClick={() => setSubRoute(r.sub)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSubRoute(r.sub); } }}
              >
                <div className="jt-report-live__top">
                  <span className="jt-report-live__icon">{JT_ABBR[r.sub]}</span>
                  <span className="jt-report-live__badge"><span className="jt-report-live__dot" aria-hidden="true"></span>LIVE</span>
                </div>
                <h3>{r.kr}</h3>
                <p className="jt-report-live__d">{r.d}</p>
                <div className="jt-report-live__meta">
                  <span className="jt-report-live__chip">약 {r.minutes}분</span>
                  <span className="jt-report-live__chip">{r.questions}문항</span>
                </div>
                <div className="jt-report-live__foot">
                  <span className="jt-report-live__cta">{r.cta || '계산하기'} <span className="jt-arrow">→</span></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 곧 열릴 도구 */}
      <section className="jt-section jt-report-grid jt-report-grid--soon">
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <h2>곧 열릴 도구</h2>
            <p>★ 표시는 가장 먼저 공개될 도구입니다. 준비되는 동안에도 담당 세무사가 직접 분석해 드립니다.</p>
          </div>
          <div className="jt-report-grid__cards">
            {soon.map((r, i) => (
              <article key={r.kr} className="jt-report-soon reveal" style={{transitionDelay: `${i * 70}ms`}}>
                <div className="jt-report-soon__top">
                  <span className="jt-tag">{r.tag}</span>
                  <span className="jt-report-soon__badge">{r.star ? '우선 공개' : '준비 중'}</span>
                </div>
                <h3>{r.kr}{r.star && <span className="jt-report-soon__star" aria-hidden="true"> ★</span>}</h3>
                <p className="jt-report-soon__d">{r.d}</p>
                <div className="jt-report-soon__foot">COMING SOON</div>
              </article>
            ))}
          </div>
          <p className="jt-report-soon__note reveal">
            도구가 준비되는 동안에도, 같은 분석을 담당 세무사가 직접 해 드립니다.
          </p>
        </div>
      </section>

      {/* 면책 고지 */}
      <JTReportDisclaimer />

      {/* CTA */}
      <section className="jt-section jt-report-cta-band">
        <div className="jt-container">
          <h2 className="reveal jt-display-h2">리포트 공개 전, 먼저 상담받으시겠어요?</h2>
          <p className="reveal">담당 세무사가 직접 사안을 살핍니다.</p>
          <div className="jt-report-cta-band__btns reveal">
            <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'report_hub'); setRoute('booking'); }}>상담 예약 <span className="jt-arrow">→</span></button>
            <button className="jt-btn jt-btn--ghost" onClick={() => setRoute('services')}>업무분야 보기</button>
          </div>
        </div>
      </section>
    </>
  );
}
window.JTReportHub = JTReportHub;

// ============ 라우터 (허브 ↔ 각 진단) ============
/* ★ 새 계산기를 추가하면 «반드시» 이 배열에도 키를 넣을 것.
   빠뜨리면 딥링크가 조용히 허브로 리다이렉트되고 에러도 안 난다(260804 실측). */
const JT_KNOWN_SUBS = ['hub', 'appeal', 'cgt', 'income', 'vat', 'gift', 'inheritance', 'acquisition', 'property', 'comprehensive', 'corporate', 'insurance', 'compare', 'burden', 'youthstartup', 'reform-cgt', 'reform-cre', 'crypto'];
const jtNormSub = (s) => (JT_KNOWN_SUBS.indexOf(s) >= 0 ? s : 'hub'); // 모르는 계산기 키 → 허브 (깨진 공유링크 방어)

function JTReportPage({ setRoute }) {
  const [subRoute, setSubRouteRaw] = useReportState(() => {
    try {
      const r = window.JTRouter && window.JTRouter.parse();
      if (r && r.router && r.route === 'report' && r.sub) return jtNormSub(r.sub);
      return jtNormSub(localStorage.getItem('jt_report_sub') || 'hub');
    } catch (e) { return 'hub'; }
  });

  // setSubRoute = 상태 + URL 해시(#/report/cgt) 동기화 → 계산기 딥링크·공유·북마크·뒤로가기
  const setSubRoute = (s) => {
    setSubRouteRaw(s);
    try { if (window.JTRouter) window.JTRouter.set('report', s); } catch (e) {}
  };

  useReportEffect(() => {
    try { localStorage.setItem('jt_report_sub', subRoute); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [subRoute]);

  // 브라우저 뒤로/앞으로 → 해시 재해석해 subRoute 동기화 (idempotent)
  useReportEffect(() => {
    const onHash = () => {
      try {
        const r = window.JTRouter.parse();
        if (r.router && r.route === 'report') setSubRouteRaw(jtNormSub(r.sub || 'hub'));
      } catch (e) {}
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 최초 진입: localStorage 복원으로 들어온 계산기를 URL에도 반영 (URL=상태 일치)
  useReportEffect(() => {
    try {
      const r = window.JTRouter && window.JTRouter.parse();
      const hashSub = (r && r.router && r.route === 'report') ? (r.sub || 'hub') : null;
      if (subRoute && subRoute !== 'hub' && hashSub !== subRoute) window.JTRouter.set('report', subRoute);
    } catch (e) {}
  }, []);

  // Reveal: 리포트 페이지 내부는 단순화 — 진입 즉시 모두 visible (검게 고정되는 이슈 회피)
  useReportEffect(() => {
    const apply = () => {
      document.querySelectorAll('.jt-report .reveal:not(.is-visible)').forEach(e => e.classList.add('is-visible'));
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
    const t = setTimeout(apply, 80);
    return () => clearTimeout(t);
  }, [subRoute]);

  const back = () => setSubRoute('hub');

  return (
    <div className="jt-report">
      {subRoute === 'hub' && <JTReportHub setRoute={setRoute} setSubRoute={setSubRoute} />}
      {subRoute === 'reform-cgt' && <JTReportReformCGT setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'reform-cre' && <JTReportReformCRE setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'crypto' && <JTReportCrypto setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'appeal' && <JTReportAppeal setRoute={setRoute} onBack={back} />}
      {subRoute === 'cgt' && <JTReportCGT setRoute={setRoute} onBack={back} />}
      {subRoute === 'income' && <JTReportIncome setRoute={setRoute} onBack={back} />}
      {subRoute === 'gift' && <JTReportGift setRoute={setRoute} onBack={back} />}
      {subRoute === 'inheritance' && <JTReportInheritance setRoute={setRoute} onBack={back} />}
      {subRoute === 'acquisition' && <JTReportAcquisition setRoute={setRoute} onBack={back} />}
      {subRoute === 'property' && <JTReportProperty setRoute={setRoute} onBack={back} />}
      {subRoute === 'comprehensive' && <JTReportComprehensive setRoute={setRoute} onBack={back} />}
      {subRoute === 'corporate' && <JTReportCorporate setRoute={setRoute} onBack={back} />}
      {subRoute === 'insurance' && <JTReportInsurance setRoute={setRoute} onBack={back} />}
      {subRoute === 'vat' && <JTReportVat setRoute={setRoute} onBack={back} />}
      {subRoute === 'compare' && <JTReportCompare setRoute={setRoute} onBack={back} />}
      {subRoute === 'burden' && <JTReportBurden setRoute={setRoute} onBack={back} />}
      {subRoute === 'youthstartup' && <JTReportYouthStartup setRoute={setRoute} onBack={back} />}
    </div>
  );
}
window.JTReportPage = JTReportPage;
