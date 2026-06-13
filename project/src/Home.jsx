/* global React */
const { useState: useStateHome, useEffect: useEffectHome, useRef: useRefHome } = React;

// ============ 상황 카드 라인 아이콘 (절제된 stroke) ============
function JTSitIcon({ name }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'home': // 양도·상속·증여 — 집/재산
      return <svg {...p}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>;
    case 'corp': // 법인·사업 운영 — 건물
      return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>;
    case 'audit': // 세무조사 — 서류/조사
      return <svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 13l1.6 1.6L15 11.5" /></svg>;
    case 'refund': // 경정·환급 — 되돌림
      return <svg {...p}><path d="M4 8h11a5 5 0 0 1 0 10H8" /><path d="M7 5 4 8l3 3" /></svg>;
    case 'consult': // 세금 컨설팅 — 나침반/전략
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m15 9-3.4 1.6L10 14l3.4-1.6z" /></svg>;
    case 'chat': // 일반 상담 — 말풍선
      return <svg {...p}><path d="M5 5h14v10H9l-4 3.5z" /><path d="M9 9h6M9 11.5h4" /></svg>;
    default:
      return null;
  }
}
window.JTSitIcon = JTSitIcon;

// ============ 상황별 진입 카드 (히어로) ============
// 6개 = 서비스 5분야 + 일반상담. topic은 booking/services 분야 자동선택 키와 매칭.
const JT_SITUATIONS = [
{ ico: '🏠', num: '01', sit: '집·재산을 팔거나, 물려주거나 받는다', t: '양도·상속·증여', d: '시점이 곧 금액입니다. 신고 전 절세 구간과 이전 구조를 먼저 설계합니다.', topic: '양도·상속·증여' },
{ ico: '🏢', num: '02', sit: '법인·개인사업체 운영 중', t: '법인·개인 사업 운영', d: '매월 결산이 12월 결산을 만듭니다. 기장·신고부터 법인 구조까지.', topic: '기장·세금 신고' },
{ ico: '📋', num: '03', sit: '세무서에서 연락이 왔다', t: '세무조사 대응', d: '첫 답변이 결과를 가릅니다. 39년 국세 경력이 통지 단계부터 함께합니다.', topic: '세무조사 대응' },
{ ico: '↩️', num: '04', sit: '이미 낸 세금이 억울하다', t: '경정·환급', d: '5년 이내면 늦지 않았습니다. 과오납 세금을 돌려받을 권리를 검토합니다.', topic: '경정청구' },
{ ico: '🧭', num: '05', sit: '큰 결정을 앞두고 있다', t: '세금 컨설팅', d: '법인 전환·지분 재구성 전, 여러 시나리오의 총 부담을 수치로 비교합니다.', topic: '세금 종합 컨설팅' },
{ ico: '💬', num: '06', sit: '어디에 속하는지 모르겠다', t: '일반 상담', d: '괜찮습니다. 상황만 말씀해 주시면 담당 분야와 다음 절차를 안내합니다.', topic: '', general: true }];


// ============ Hero — 상황별 진입 ============
function JTHero({ setRoute }) {
  const pick = (s) => {
    if (s.topic) {try {sessionStorage.setItem('jt_preferred_topic', s.topic);} catch (e) {}}
    setRoute('booking');
  };
  return (
    <section className="jt-sithero">
      <div className="jt-sithero__inner">
        <div className="jt-sithero__greet">
          <span className="jt-sithero__greet-wave" aria-hidden="true">👋</span>
          <span><b>반갑습니다.</b> 세금 앞에서 혼자 고민하지 않도록, <b>제이티 세무법인</b>이 곁에 있겠습니다.</span>
        </div>
        <div className="jt-kicker">WHERE TO START · 상황별 안내</div>
        <h1 className="jt-sithero__title">지금, 어떤 상황이신가요?</h1>
        <p className="jt-sithero__sub">세금은 상황마다 답이 다릅니다. 가장 가까운 상황을 고르시면, 그에 맞는 절차와
담당 전문가로 바로 안내해 드립니다.</p>
      </div>
      <div className="jt-sits">
        {JT_SITUATIONS.map((s) => <div
            key={s.num}
            className={`jt-sit reveal ${s.general ? 'jt-sit--general' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => pick(s)}
            onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();pick(s);}}}>
            <div className="jt-sit__top">
              <div className="jt-sit__ico" aria-hidden="true">{s.ico}</div>
              <span className="jt-sit__num">{s.num}</span>
            </div>
            <div className="jt-sit__sit">{s.sit}</div>
            <div className="jt-sit__t">{s.t}</div>
            <p className="jt-sit__d">{s.d}</p>
            <div className="jt-sit__go">{s.general ? '편하게 문의' : '이 상황 상담'} <span className="jt-arrow">→</span></div>
          </div>
        )}
      </div>
    </section>);

}
window.JTHero = JTHero;

// ============ Hook Ticker (infinite marquee) ============
function JTTicker() {
  const hooks = window.JT_DATA.hooks || [];
  const row = hooks.concat(hooks).concat(hooks);
  return (
    <div className="jt-ticker" aria-hidden="true">
      <div className="jt-ticker__track">
        {row.map((h, i) =>
        <span className="jt-ticker__item" key={i}>
            <em>{h.k}</em>
            <span>{h.v}</span>
            <i className="jt-ticker__dot">◆</i>
          </span>
        )}
      </div>
    </div>);

}
window.JTTicker = JTTicker;

// ============ Proof / Scenarios (benchmark: law-firm "case results") ============
function JTProof({ setRoute }) {
  const items = window.JT_DATA.scenarios;
  return (
    <section className="jt-section jt-proof">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">PRECEDENTS · 공개 판례·참고자료</div>
          <h2 className="jt-h2">세법은 기록되어 있고,<br />결정은 공개되어 있습니다.</h2>
        </div>
        <div className="jt-proof__note">
          아래는 <strong>당사 수임 실적이 아닌</strong>, 국세법령정보시스템·국세청 통계·국세기본법에서 발췌한 공개 자료입니다.<br />귀하 사안의 적용 가능성은 개별 검토가 필요합니다.
        </div>
      </div>
      <div className="jt-proof__grid">
        {items.map((it, i) =>
        <article key={i} className="jt-proof__card reveal" data-delay={Math.min(i, 3)}>
            <div className="jt-proof__tag">{it.tag}</div>
            <div className="jt-proof__delta">{it.delta}</div>
            <div className="jt-proof__kr">{it.kr}</div>
            <dl className="jt-proof__story">
              <dt>사안</dt><dd>{it.background}</dd>
              <dt>쟁점</dt><dd>{it.action}</dd>
              {it.outcome && <><dt>시사점</dt><dd>{it.outcome}</dd></>}
              <dt>출처</dt><dd>{it.duration}</dd>
            </dl>
          </article>
        )}
      </div>
      <p className="reveal" style={{ marginTop: 32, fontSize: 12, color: 'var(--fg-3)', textAlign: 'right', lineHeight: 1.6 }}>
        ※ 본 내용은 공개된 조세심판원 결정·국세청 발표·국세기본법을 교육 목적으로 요약한 참고자료입니다. 법령 개정·사실관계에 따라 결론이 달라질 수 있으며, 특정 납세자에 대한 자문 의견이 아닙니다.
      </p>
      <div className="reveal" style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end' }}>
        <a className="jt-link" onClick={() => setRoute('booking')}>내 사안 적용 여부 상담하기 →</a>
      </div>
    </section>);

}
window.JTProof = JTProof;

// ============ 정체성 밴드 — "세 개의 동사" (집행·강의·설계) ============
function JTCreds() {
  return (
    <section className="jt-ident">
      <div className="jt-ident__inner">
        <div className="jt-ident__head reveal">
          <div className="jt-kicker">WHY JT · 우리가 누구인가</div>
          <h2 className="jt-ident__h2">감이 아니라,<br /><em>이력으로</em> 증명합니다.</h2>
          <p className="jt-ident__lead">대부분의 세무사는 신고를 대행합니다. 제이티는 그 세금을 <b>세 방향에서</b> 다뤄본 사람들입니다 — 집행하고, 가르치고, 설계합니다.</p>
        </div>
        <div className="jt-ident__grid">
          <div className="jt-ident__col reveal">
            <div className="jt-ident__en">Enforced · 집행</div>
            <div className="jt-ident__verb">집행해<br />봤습니다</div>
            <p className="jt-ident__body">국세청 <b>39년</b>, 과세관청 <b>안</b>에서. 前 송파세무서장이 자문에 참여합니다. 조사·불복의 논리를 만드는 쪽에 있었습니다.</p>
            <div className="jt-ident__foot">과세관청의 시선을 알아야, 가장 유리한 방어선이 보입니다.</div>
          </div>
          <div className="jt-ident__col reveal" data-delay="1">
            <div className="jt-ident__en">Taught · 강의</div>
            <div className="jt-ident__verb">가르칩니다</div>
            <p className="jt-ident__body">공무원학원 <b>세법 강사</b>, 대학 <b>겸임교수</b>, 세법 기본서·구조노트·가상자산 가이드의 <b>저자</b>입니다.</p>
            <div className="jt-ident__foot">법을 가르치는 사람이 당신의 신고를 직접 봅니다.</div>
          </div>
          <div className="jt-ident__col reveal" data-delay="2">
            <div className="jt-ident__en">Designed · 설계</div>
            <div className="jt-ident__verb">설계합니다</div>
            <p className="jt-ident__body">재산세제·법인·자산가 — 분야별 <b>대표세무사 3인</b>이 전담합니다. 단순 신고가 아니라 <b>구조</b>를 설계합니다.</p>
            <div className="jt-ident__foot">신고 전 설계가, 신고 후 5년의 가산세를 막습니다.</div>
          </div>
        </div>
      </div>
    </section>);

}
window.JTCreds = JTCreds;

// ============ 권위월 — 검증 가능한 이력 (라이트 프레임) ============
function JTAuthority() {
  return (
    <section className="jt-authority">
      <div className="jt-section__head reveal">
        <div className="jt-kicker">CREDENTIALS · 이력으로 증명</div>
        <h2 className="jt-h2">기관이 자문을 구하고,<br />공무원이 배우는 전문성.</h2>
      </div>
      <div className="jt-authority__grid">
        <div className="jt-authority__card reveal">
          <div className="jt-authority__label">01 · Authority</div>
          <div className="jt-authority__title">前 송파세무서장<br />국세 행정 39년</div>
          <ul className="jt-authority__list">
            <li><span className="jt-tick">—</span><span>국세청 법인세과 · 서울청 조사2국·4국</span></li>
            <li><span className="jt-tick">—</span><span>서울지방국세청 감사관</span></li>
            <li><span className="jt-tick">—</span><span>법무법인(유한) 바른 고문</span></li>
          </ul>
        </div>
        <div className="jt-authority__card reveal jt-authority__card--inv" data-delay="1">
          <div className="jt-authority__label">02 · Academia</div>
          <div className="jt-authority__title">가르치고, 쓰는 세무사들</div>
          <ul className="jt-authority__list">
            <li><span className="jt-tick">—</span><span>해커스공무원 세법 강사</span></li>
            <li><span className="jt-tick">—</span><span>동남보건대 세무회계학과 겸임교수</span></li>
          </ul>
          <div className="jt-authority__books">
            <div className="jt-authority__book">세법 기본서</div>
            <div className="jt-authority__book">세법 구조노트</div>
            <div className="jt-authority__book">가상자산 가이드</div>
          </div>
        </div>
        <div className="jt-authority__card reveal" data-delay="2">
          <div className="jt-authority__label">03 · Trust</div>
          <div className="jt-authority__title">기관이 자문을 구하는 전문성</div>
          <ul className="jt-authority__list">
            <li><span className="jt-tick">—</span><span>서울교통공사 자문위원</span></li>
            <li><span className="jt-tick">—</span><span>한국데이터산업진흥원 평가위원</span></li>
            <li><span className="jt-tick">—</span><span>前 삼성세무서 납세보호위원</span></li>
          </ul>
        </div>
      </div>
    </section>);

}
window.JTAuthority = JTAuthority;

// ============ Stats with count-up ============
function JTStatItem({ num, unit, kr, en }) {
  const target = parseInt(num, 10);
  const [val, setRef] = window.useCountUp(target, 1400);
  return (
    <div className="jt-stat" ref={setRef}>
      <div className="jt-stat__num">
        <span>{val}</span><em>{unit}</em>
      </div>
      <div className="jt-stat__kr">{kr}</div>
      <div className="jt-stat__en">{en}</div>
    </div>);

}
function JTStats() {
  const items = window.JT_DATA.stats;
  return (
    <section className="jt-section jt-section--tight">
      <div className="jt-stats">
        {items.map((s) => <JTStatItem key={s.kr} {...s} />)}
      </div>
    </section>);

}
window.JTStats = JTStats;

// ============ Services grid (home preview) ============
function JTServicesGrid({ setRoute, setDetailOpen, detailOpen, variant }) {
  const all = window.JT_DATA.services;
  const list = variant === 'list';
  return (
    <section className="jt-section">
      <div className="jt-section__head jt-section__head--split reveal">
        <div
          onClick={() => setRoute('services')}
          style={{ cursor: 'pointer' }}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();setRoute('services');}}}>
          
          <div className="jt-kicker">SERVICES · 업무분야</div>
          <h2 className="jt-h2">근거에 기반한<br />다섯 개 전문 영역.</h2>
        </div>
        <a className="jt-link" onClick={() => setRoute('services')}>전체 업무분야 →</a>
      </div>
      {list ?
      <ul className="jt-insights" style={{ borderTop: '1px solid var(--border-1)' }}>
          {all.map((s, i) =>
        <li key={s.num} className="jt-insights__row reveal" data-delay={Math.min(i, 4)} onClick={() => setRoute('services')}>
              <span className="jt-insights__num">{s.num}</span>
              <span className="jt-insights__title">{s.kr}</span>
              <span className="jt-insights__tag">{s.en}</span>
              <span className="jt-insights__date">{s.short}</span>
              <span className="jt-arrow">→</span>
            </li>
        )}
        </ul> :

      <div className="jt-services">
          {all.slice(0, 4).map((s, i) =>
        <article
          key={s.num}
          className={`jt-service reveal ${detailOpen === i ? 'is-open' : ''}`}
          data-delay={Math.min(i, 4)}
          onClick={() => setDetailOpen(detailOpen === i ? null : i)}>
          
              <header className="jt-service__head">
                <span>{s.num} · {s.en}</span>
                <span className="jt-arrow">{detailOpen === i ? '×' : '→'}</span>
              </header>
              <h3 className="jt-service__title">{s.kr}</h3>
              <p className="jt-service__desc">{s.desc}</p>
              {detailOpen === i &&
          <>
                  <ul className="jt-service__list">
                    {s.points.map((p) =>
              <li key={p.b}><span className="jt-tick">—</span><span><b>{p.b}</b> — <span style={{ color: 'var(--fg-2)' }}>{p.s}</span></span></li>
              )}
                  </ul>
                  <a
              className="jt-link"
              onClick={(e) => {e.stopPropagation();setRoute('services');}}
              style={{ marginTop: 20, display: 'inline-block' }}>
              
                    자세히 보기 →
                  </a>
                </>
          }
            </article>
        )}
          <article className="jt-service reveal" data-delay="4" onClick={() => setRoute('services')} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gridColumn: 'span 2', minHeight: 220 }}>
            <header className="jt-service__head">
              <span>{all[4].num} · {all[4].en}</span>
              <span className="jt-arrow">→</span>
            </header>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'end' }}>
              <div>
                <h3 className="jt-service__title">{all[4].kr}</h3>
                <p className="jt-service__desc">{all[4].desc}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="jt-link">전체 업무분야 보기 →</span>
              </div>
            </div>
          </article>
        </div>
      }
    </section>);

}
window.JTServicesGrid = JTServicesGrid;

// ============ 회장 인용 (따뜻한 풀쿼트, 라이트) ============
function JTQuote() {
  return (
    <section className="jt-pullquote">
      <div className="jt-pullquote__inner reveal">
        <span className="jt-pullquote__mark">“</span>
        <p className="jt-pullquote__p">공무에 종사했던 시절, 가장 자주 본 장면은<br />‘미리 물었더라면’으로 시작하는 뒤늦은 문의였습니다.</p>
        <div className="jt-pullquote__by">
          <div className="jt-pullquote__avatar">JT</div>
          <div><b>김기복 회장</b> · 前 송파세무서장</div>
        </div>
      </div>
    </section>);

}
window.JTQuote = JTQuote;

// ============ Insights list (home preview) ============
function JTInsightsPreview({ setRoute, limit }) {
  const items = window.JT_DATA.insights.slice(0, limit || 4);
  return (
    <section className="jt-section">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">INSIGHTS · 최근 글</div>
          <h2 className="jt-h2">실무에 바로 쓰는 해설.</h2>
        </div>
        <a className="jt-link" onClick={() => setRoute('insights')}>전체 보기 →</a>
      </div>
      <ul className="jt-insights">
        {items.map((a, i) =>
        <li key={a.title} className="jt-insights__row reveal" data-delay={Math.min(i, 4)} onClick={() => setRoute('insights')}>
            <span className="jt-insights__num">{String(i + 1).padStart(2, '0')}</span>
            <span className="jt-insights__title">{a.title}</span>
            <span className="jt-insights__tag">{a.tag}</span>
            <span className="jt-insights__date">{a.date}</span>
            <span className="jt-arrow">→</span>
          </li>
        )}
      </ul>
    </section>);

}
window.JTInsightsPreview = JTInsightsPreview;

// ============ CTA band ============
function JTCta({ setRoute }) {
  return (
    <section className="jt-cta">
      <div className="jt-cta__inner">
        <div className="reveal">
          <div className="jt-kicker jt-kicker--inverse jt-kicker--plain">CONSULTATION</div>
          <h2>신고·결정 이전에<br />먼저 물어보세요.</h2>
        </div>
        <div className="reveal" data-delay="1">
          <p className="jt-cta__body">
            세무조사 통지, 상속 개시, 법인 설립, 경정청구 — 시점이 곧 금액이 되는 일입니다. 첫 의사결정을 함께 세우겠습니다. 상담은 무료입니다.
          </p>
          <div className="jt-row jt-row--gap-3">
            <button className="jt-btn jt-btn--onDark jt-btn--lg" onClick={() => setRoute('booking')}>
              상담 예약 <span className="jt-arrow">→</span>
            </button>
            <a className="jt-btn jt-btn--ghostOnDark jt-btn--lg" href={`tel:${window.JT_DATA.firm.phone}`}>
              T. {window.JT_DATA.firm.phone}
            </a>
          </div>
        </div>
      </div>
    </section>);

}
window.JTCta = JTCta;

// ============ Team Preview (담당 세무사 4인) ============
function JTTeamPreview({ setRoute }) {
  const profiles = window.JT_DATA.teamProfiles;
  return (
    <section className="jt-section">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">TEAM · 담당 세무사</div>
          <h2 className="jt-h2">회장 1인과 대표세무사 3인,<br />각자의 전문 영역.</h2>
        </div>
        <a className="jt-link" onClick={() => setRoute('about', 'team')}>전체 구성원 보기 →</a>
      </div>
      <div className="jt-team-preview">
        {profiles.map((p, i) =>
        <article key={p.code} className={`jt-team-preview__card reveal ${i === 0 ? 'is-lead' : ''}`} data-delay={Math.min(i, 3)}>
            <div className="jt-team-preview__avatar">{p.code}</div>
            <div className="jt-team-preview__role">{p.role}</div>
            <h3 className="jt-team-preview__name">{p.kr}</h3>
            <div className="jt-team-preview__focus">{p.focus}</div>
            <div className="jt-team-preview__career">{p.career}</div>
          </article>
        )}
      </div>
      <p className="jt-team-preview__note reveal">
        ※ 프로필 사진과 실명은 상담 예약 후 배정되는 담당자 안내 시 공개됩니다.
      </p>
    </section>);

}
window.JTTeamPreview = JTTeamPreview;

// ============ Fees section removed per brief ============

// ============ Channels (다양한 상담 채널) ============
function JTChannels({ setRoute }) {
  return (
    <section className="jt-channels">
      <div className="jt-channels__inner">
        <div className="reveal">
          <div className="jt-kicker">CHANNELS · 편한 방식으로</div>
          <h2 className="jt-h2">전화가 부담스러우면,<br />카톡·이메일로도 됩니다.</h2>
        </div>
        <div className="jt-channels__grid reveal" data-delay="1">
          <a className="jt-channels__card" href={`tel:${window.JT_DATA.firm.phone}`}>
            <div className="jt-channels__label">전화 상담</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.phone}</div>
            <div className="jt-channels__sub">평일 09:00–18:00 · 초기 응답 24h 이내</div>
          </a>
          <a className="jt-channels__card" href={`mailto:${window.JT_DATA.firm.email}`}>
            <div className="jt-channels__label">이메일</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.email}</div>
            <div className="jt-channels__sub">자료 첨부 가능 · 영업일 기준 24h 내 회신</div>
          </a>
          <a className="jt-channels__card" href={window.JT_DATA.firm.kakaoChatUrl} target="_blank" rel="noopener">
            <div className="jt-channels__label">카카오톡 채널</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.kakaoSearchId}</div>
            <div className="jt-channels__sub">1:1 채팅 상담 · 자료 전송 가능 · 영업일 24h 내 회신</div>
          </a>
        </div>
      </div>
    </section>);

}
window.JTChannels = JTChannels;