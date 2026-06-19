/* @jsx React.createElement */
/* JT 리포트 — 허브 + 공통 레이아웃 + 라우팅 + 면책 고지 */

const { useState: useReportState, useEffect: useReportEffect, useMemo: useReportMemo } = React;

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
    tag: 'LEGACY',
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
        <button className="jt-btn jt-btn--primary" onClick={() => setRoute && setRoute('booking')}>
          상담 예약 <span className="jt-arrow">→</span>
        </button>
        <a className="jt-btn jt-btn--ghost" href={window.jtKakaoUrl()} target="_blank" rel="noopener">
          카톡 상담
        </a>
      </div>
    </div>
  );
}
window.JTReportCta = JTReportCta;

// ============ 공통 스텝 셸 (진단별 공용) ============
function JTReportShell({ title, subtitle, stepIdx, stepTotal, children, onBack, tag }) {
  const pct = Math.round(((stepIdx + 1) / stepTotal) * 100);
  return (
    <div className="jt-report-shell">
      <div className="jt-report-shell__head">
        <button className="jt-report-shell__back" onClick={onBack}>← JT 리포트 허브</button>
        <div className="jt-report-shell__meta">
          <span className="jt-tag">{tag}</span>
          <span>Step {stepIdx + 1} / {stepTotal}</span>
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

// ============ 허브 랜딩 ============
function JTReportHub({ setRoute, setSubRoute }) {
  const planned = [
    { tag: 'AI ASSISTANT', kr: 'AI 세무 길잡이', d: '상황을 평범한 말로 입력하면, 맞는 분야와 다음 절차로 안내합니다.', star: true },
    { tag: 'LEGACY', kr: '증여세 계산기', d: '관계·금액·부담부증여(빚도 함께 넘기는 증여)까지 검증 엔진으로 계산. 부동산은 주소로 공시가격을 조회합니다.', live: true, sub: 'gift' },
    { tag: 'LEGACY', kr: '상속세 계산기', d: '총 상속재산·배우자·자녀에 채무·장례비·금융재산·동거주택 공제와 10년 내 사전증여 합산까지 검증 엔진으로 계산합니다.', live: true, sub: 'inheritance' },
    { tag: 'CONSULTING', kr: '법인 전환 시뮬레이터', d: '매출 구간별 개인 vs 법인 세부담을 비교합니다.', star: true },
    { tag: 'AUDIT', kr: '세무조사 위험도 진단', d: '쟁점 노출도를 점수로 보고, 대비 포인트를 정리합니다.' },
    { tag: 'BOOKKEEPING', kr: '4대보험·실수령 계산기', d: '급여에서 공제·실수령액을 즉시 계산합니다.' },
  ];
  return (
    <>
      {/* 히어로 */}
      <section className="jt-section jt-report-hero">
        <div className="jt-container">
          <div className="jt-eyebrow reveal">JT TAX CORP. · REPORT</div>
          <h1 className="jt-report-hero__title reveal">
            <span>세금을</span> <span>다루는</span> <span>도구,</span>
            <br/>
            <span className="is-accent">하나씩 열립니다.</span>
          </h1>
          <p className="jt-report-hero__sub reveal">
            국세 행정 39년의 회장과 세무사가 직접 설계하는 인터랙티브 세금 도구함.<br/>
            계산기·시뮬레이터부터 AI 세무 길잡이까지, 차례로 열립니다.
          </p>
          <div className="jt-report-hero__meta reveal">
            <span>● 로그인 불필요</span>
            <span>● 입력값은 브라우저에만 저장</span>
            <span>● 결과로 바로 상담 연결</span>
          </div>
        </div>
      </section>

      {/* 대표 라이브 도구 — 양도세 계산기 */}
      <section className="jt-section" style={{paddingTop: 0, paddingBottom: 0}}>
        <div className="jt-container">
          <div className="jt-report-feature reveal">
            <div>
              <span className="jt-report-feature__live">
                <span className="jt-report-feature__dot" aria-hidden="true"></span>
                NOW LIVE · 무료 계산기
              </span>
              <h2>이 집 팔면 양도세,<br/>얼마 나올까요?</h2>
              <p className="jt-report-feature__d">검증된 계산 엔진이 1세대1주택 비과세·일시적2주택·입주권·장기보유특별공제·중과세까지 반영해 추정 양도소득세를 계산합니다. 로그인 없이, 5분이면 충분합니다.</p>
              <div className="jt-report-feature__meta">
                <span>로그인 불필요</span>
                <span>입력값은 브라우저에만</span>
                <span>결과 → 바로 상담 연결</span>
              </div>
            </div>
            <div className="jt-report-feature__cta">
              <button className="jt-btn jt-btn--primary" onClick={() => setSubRoute('cgt')}>양도세 계산하기 →</button>
              <span className="jt-report-feature__sub">약 5분 · 자산유형별 맞춤 질문</span>
            </div>
          </div>
        </div>
      </section>

      {/* 준비 중 도구 미리보기 */}
      <section className="jt-section jt-report-grid">
        <div className="jt-container">
          <div className="jt-report-grid__head reveal">
            <h2>곧 열릴 도구</h2>
            <p>★ 표시는 가장 먼저 공개될 도구입니다. 준비되는 동안에도 담당 세무사가 직접 분석해 드립니다.</p>
          </div>
          <div className="jt-report-grid__cards">
            {planned.map((r, i) => (
              <article
                key={r.kr}
                className={`jt-report-soon reveal${r.live ? ' is-live' : ''}`}
                style={{transitionDelay: `${i * 70}ms`, cursor: r.live ? 'pointer' : 'default'}}
                onClick={r.live ? () => setSubRoute(r.sub) : undefined}
              >
                <div className="jt-report-soon__top">
                  <span className="jt-tag">{r.tag}</span>
                  <span className="jt-report-soon__badge">{r.live ? '지금 사용 가능' : (r.star ? '우선 공개' : '준비 중')}</span>
                </div>
                <h3>{r.kr}{r.star && <span className="jt-report-soon__star" aria-hidden="true"> ★</span>}</h3>
                <p className="jt-report-soon__d">{r.d}</p>
                <div className="jt-report-soon__foot">
                  {r.live
                    ? <button className="jt-btn jt-btn--primary" onClick={(e) => { e.stopPropagation(); setSubRoute(r.sub); }}>지금 계산하기 →</button>
                    : 'COMING SOON'}
                </div>
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
          <p className="reveal">前 송파세무서장 회장과 대표세무사가 직접 사안을 살핍니다.</p>
          <div className="jt-report-cta-band__btns reveal">
            <button className="jt-btn jt-btn--primary" onClick={() => setRoute('booking')}>상담 예약 <span className="jt-arrow">→</span></button>
            <button className="jt-btn jt-btn--ghost" onClick={() => setRoute('services')}>업무분야 보기</button>
          </div>
        </div>
      </section>
    </>
  );
}
window.JTReportHub = JTReportHub;

// ============ 라우터 (허브 ↔ 각 진단) ============
function JTReportPage({ setRoute }) {
  const [subRoute, setSubRoute] = useReportState(() => {
    try { return localStorage.getItem('jt_report_sub') || 'hub'; } catch (e) { return 'hub'; }
  });

  useReportEffect(() => {
    try { localStorage.setItem('jt_report_sub', subRoute); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [subRoute]);

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
      {subRoute === 'appeal' && <JTReportAppeal setRoute={setRoute} onBack={back} />}
      {subRoute === 'cgt' && <JTReportCGT setRoute={setRoute} onBack={back} />}
      {subRoute === 'income' && <JTReportIncome setRoute={setRoute} onBack={back} />}
      {subRoute === 'gift' && <JTReportGift setRoute={setRoute} onBack={back} />}
      {subRoute === 'inheritance' && <JTReportInheritance setRoute={setRoute} onBack={back} />}
    </div>
  );
}
window.JTReportPage = JTReportPage;
