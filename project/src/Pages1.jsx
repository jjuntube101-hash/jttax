/* global React */

// ============ About page (with tabs: 회사소개 / 전문가) ============
function JTAbout({ setRoute, initialTab }) {
  const D = window.JT_DATA;
  const [tab, setTab] = React.useState(initialTab === 'team' ? 'team' : 'company');
  React.useEffect(() => {
    if (initialTab === 'team' || initialTab === 'company') setTab(initialTab);
  }, [initialTab]);
  window.useReveal();

  const onTab = (next) => {
    setTab(next);
    // URL 해시 동기화 (공유/새로고침 시 탭 유지)
    try {
      const url = new URL(window.location.href);
      url.hash = next === 'team' ? 'team' : '';
      window.history.replaceState(null, '', url.toString());
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  };

  return (
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>ABOUT</span><span>·</span><span>회사소개</span></div>
          {tab === 'company' ?
          <>
              <h1>사업과 재산의 세금 문제를<br />함께 살핍니다.</h1>
              <p className="jt-page-hero__sub">
                제이티 세무법인은 김민석·이현준·김가환 세 대표세무사가 기장·신고, 재산 관련 세무, 기업 자문과 세무조사 대응 등 폭넓은 실무를 다룹니다. 사안의 사실관계와 근거를 확인하고 기록합니다.
              </p>
            </> :

          <>
              <h1>세 명의 대표세무사,<br />각자의 실무 경력.</h1>
              <p className="jt-page-hero__sub">
                세 대표 모두 다양한 세무 문제를 다룹니다. 각자의 사무소 운영, 기업 자문, 재산세제, 기장·결산 경험과 교육·저술 활동을 소개합니다.
              </p>
            </>
          }
        </div>
      </section>

      {/* 탭 바 */}
      <div className="jt-about-tabs" role="tablist" aria-label="회사소개 섹션">
        <div className="jt-about-tabs__inner">
          <button
            role="tab"
            aria-selected={tab === 'company'}
            className={`jt-about-tabs__btn ${tab === 'company' ? 'is-active' : ''}`}
            onClick={() => onTab('company')}>

            <span className="jt-about-tabs__num">01</span>
            <span className="jt-about-tabs__label">회사소개</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'team'}
            className={`jt-about-tabs__btn ${tab === 'team' ? 'is-active' : ''}`}
            onClick={() => onTab('team')}>

            <span className="jt-about-tabs__num">02</span>
            <span className="jt-about-tabs__label">전문가</span>
          </button>
        </div>
      </div>

      {tab === 'company' ? <JTAboutCompany D={D} setRoute={setRoute} onSeeTeam={() => onTab('team')} /> : <JTAboutTeam D={D.team} setRoute={setRoute} />}

      <window.JTCta setRoute={setRoute} />
    </>);

}
window.JTAbout = JTAbout;

// 회사소개 탭 본문
function JTAboutCompany({ D, setRoute, onSeeTeam }) {
  return (
    <>
      <section className="jt-section">
        <div className="jt-section__head reveal">
          <div className="jt-kicker">CREDENTIALS · 근거의 벽</div>
          <h2 className="jt-h2 jt-display-h2">이력이 곧,<br />우리의 자기소개입니다.</h2>
        </div>
        <div className="jt-matrix reveal">
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Practice</div>
            <div className="jt-matrix__n">3<em>인</em></div>
            <div className="jt-matrix__l">대표세무사<br />사업·재산 세무 실무</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Since</div>
            <div className="jt-matrix__n">2020</div>
            <div className="jt-matrix__l">이현준 세무사<br />제이티세무회계 개업</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Firm</div>
            <div className="jt-matrix__n">2026</div>
            <div className="jt-matrix__l">제이티 세무법인 설립<br />세 대표세무사가 함께</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Response</div>
            <div className="jt-matrix__n">24<em>h</em></div>
            <div className="jt-matrix__l">초기 응답 기준<br />영업일 24시간 이내</div>
          </div>
        </div>
      </section>

      <section className="jt-section">
        <div className="jt-section__head reveal">
          <div className="jt-kicker">PHILOSOPHY · 업무 원칙</div>
          <h2 className="jt-h2 jt-display-h2">세 가지 원칙으로 일합니다.</h2>
        </div>
        <div className="jt-philosophy">
          {D.philosophy.map((p, i) =>
          <div key={p.n} className="jt-philosophy__item reveal" data-delay={i}>
              <div className="jt-philosophy__num">{p.n}</div>
              <div className="jt-philosophy__title">{p.t}</div>
              <p className="jt-philosophy__desc">{p.d}</p>
            </div>
          )}
        </div>
      </section>

      <section className="jt-section">
        <div className="jt-section__head reveal">
          <div className="jt-kicker">HISTORY · 연혁</div>
          <h2 className="jt-h2 jt-display-h2">짧지만 밀도 있는 시간.</h2>
        </div>
        <ul className="jt-timeline">
          {D.timeline.map((e, i) =>
          <li key={i} className="reveal" data-delay={Math.min(i, 4)}>
              <time>{e.y}</time>
              <p>{e.t}</p>
            </li>
          )}
        </ul>
      </section>

      <section className="jt-pullquote">
        <div className="jt-pullquote__inner reveal" style={{ textAlign: 'center' }}>
          <div className="jt-kicker jt-kicker--plain" style={{ justifyContent: 'center' }}>ONE LINE</div>
          <p style={{ fontFamily: 'var(--font-display-kr)', fontSize: 'clamp(34px, 4.6vw, 60px)', lineHeight: 1.08, letterSpacing: '-0.03em', color: 'var(--fg-1)', margin: '20px 0 32px' }}>
            “감이 아닌 근거.<br />말이 아닌 문서.”
          </p>
          <button className="jt-btn jt-btn--primary jt-btn--lg" onClick={onSeeTeam}>
            전문가 소개 보기 <span className="jt-arrow">→</span>
          </button>
        </div>
      </section>
    </>);

}
window.JTAboutCompany = JTAboutCompany;

// 전문가 탭 본문
function JTAboutTeam({ D, setRoute }) {
  return (
    <section className="jt-section">
      {/* ===== 세무사 ===== */}
      <div className="jt-team-row">
        {D.partners.map((p) =>
        <article key={p.name} className="jt-team-card reveal">
            <div className="jt-team-card__head">
              <div className="jt-team-card__avatar">
                <span className="jt-team-card__initials" aria-hidden="true">{p.initials}</span>
                {p.photo && <img className="jt-team-card__photo" src={p.photo} alt={`${p.name} 대표세무사`} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              </div>
              <div className="jt-team-card__role">{p.role}</div>
            </div>
            <h3 className="jt-team-card__name">
              {p.name} <small>세무사</small>
            </h3>
            <div className="jt-team-card__title-kr">{p.titleKr}</div>
            {p.summary && <p className="jt-team-card__summary">{p.summary}</p>}

            {p.scope && p.scope.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">주요 실무</div>
                <ul className="jt-team-card__books">
                  {p.scope.map((s, i) =>
              <li key={i}>{s}</li>
              )}
                </ul>
              </div>
          }

            <div className="jt-team-card__block">
              <div className="jt-team-card__block-head">실무 경력</div>
              <ul className="jt-team-card__bio">
                {p.bio.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
              </ul>
            </div>

            {p.advisory && p.advisory.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">자문 · 대외활동</div>
                <ul className="jt-team-card__bio">
                  {p.advisory.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
                </ul>
              </div>
          }

            {p.teaching && p.teaching.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">교육 활동</div>
                <ul className="jt-team-card__bio">
                  {p.teaching.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
                </ul>
              </div>
          }

            {p.books && p.books.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">저서</div>
                <ul className="jt-team-card__books">
                  {p.books.map((b, i) =>
              <li key={i}>『{b}』</li>
              )}
                </ul>
              </div>
          }

            {p.education && p.education.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">학력</div>
                <ul className="jt-team-card__bio">
                  {p.education.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
                </ul>
              </div>
          }

            {p.certs && p.certs.length > 0 &&
          <div className="jt-team-card__block">
                <div className="jt-team-card__block-head">자격</div>
                <ul className="jt-team-card__books">
                  {p.certs.map((b, i) =>
              <li key={i}>{b}</li>
              )}
                </ul>
              </div>
          }
          </article>
        )}
      </div>

    </section>);

}
window.JTAboutTeam = JTAboutTeam;

// ============ Team page (deprecated — redirects to About#team) ============
// '전문가'는 회사소개 페이지의 탭으로 통합되었습니다.
// 기존 setRoute('team') 호출 호환을 위해 thin wrapper로 유지합니다.
function JTTeam({ setRoute }) {
  return <window.JTAbout setRoute={setRoute} initialTab="team" />;
}
window.JTTeam = JTTeam;

// ============ Services detail page ============
function JTServicesPage({ setRoute }) {
  const services = window.JT_DATA.services;
  window.useReveal();
  return (
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>SERVICES</span><span>·</span><span>업무분야</span></div>
          <h1>다섯 개의 전문 영역.<br />하나의 호흡.</h1>
          <p className="jt-page-hero__sub">
            양도·상속·증여부터 세무조사 대응, 법인 기장, 경정청구까지 — 의사결정 이전부터 사후 관리까지 하나의 팀이 일관된 기준으로 진행합니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <div style={{ borderTop: '2px solid var(--fg-1)' }}>
          {services.map((s, i) =>
          <div key={s.num} className="jt-service-detail reveal" data-delay={Math.min(i, 4)} style={{ display: 'block', padding: '40px 0' }}>
              <div className="jt-service-detail__num" style={{ marginBottom: 14 }}>
                {s.num}
                <small>{s.en}</small>
              </div>
              <div className="jt-service-detail__body" style={{ maxWidth: '100%' }}>
                <h3>{s.kr}</h3>
                <p style={{ fontSize: 17, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 16 }}>{s.short}</p>
                <p style={{ maxWidth: '100%' }}>{s.desc}</p>
                <button className="jt-btn jt-btn--outline" style={{ marginTop: 24 }} onClick={() => {
                try {sessionStorage.setItem('jt_preferred_topic', s.kr);} catch (_) {}
                window.jtTrackCta('booking', 'services');
                setRoute('booking');
              }}>
                  이 분야 상담 예약 <span className="jt-arrow">→</span>
                </button>
              </div>
              <div className="jt-service-detail__side" style={{ marginTop: 24 }}>
                <ul>
                  {s.points.map((p) =>
                <li key={p.b}>
                      <span className="jt-tick">—</span>
                      <div>
                        <b>{p.b}</b>
                        <span>{p.s}</span>
                      </div>
                    </li>
                )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      <window.JTCta setRoute={setRoute} />
    </>);

}
window.JTServicesPage = JTServicesPage;

// ============ Insights page ============
function JTInsightsPage({ setRoute }) {
  const items = window.JT_DATA.insights;
  window.useReveal();
  return (
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>INSIGHTS</span><span>·</span><span>인사이트</span></div>
          <h1>실무의 근거를<br />공개합니다.</h1>
          <p className="jt-page-hero__sub">
            최근 개정안, 세무조사 실무, 상속·증여 사례 — 세무사가 읽어낸 법령과 예규를 실무자의 언어로 정리합니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <div className="jt-icards jt-icards--3">
          {items.map((a, i) => { const Card = window.JTInsightCard; return <Card key={a.slug || a.title} a={a} i={i} />; })}
        </div>
      </section>
    </>);

}
window.JTInsightsPage = JTInsightsPage;
