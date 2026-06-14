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
              <h1>가르치고, 집행하고,<br />글로 남깁니다.</h1>
              <p className="jt-page-hero__sub">
                제이티 세무법인은 前 송파세무서장 김기복 회장과 재산세제·조세불복 전문 김민석 세무사, 공무원학원 세법 강사 이현준 세무사, 법인 회계 실무에 강한 김가환 세무사가 함께합니다. 감이 아닌 근거로 일하고, 일한 내용은 모두 문서로 남깁니다.
              </p>
            </> :

          <>
              <h1>가르치고, 집행하고,<br />설계해 본 사람들.</h1>
              <p className="jt-page-hero__sub">
                국세 행정 39년의 회장과 세무공무원 세법 강의·재산세제·법인 회계의 대표세무사 3인이 귀사의 사안을 함께 봅니다.
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
          <h2 className="jt-h2">감이 아니라, 이력으로.</h2>
        </div>
        <div className="jt-matrix reveal">
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Authority</div>
            <div className="jt-matrix__n">39<em>년</em></div>
            <div className="jt-matrix__l">국세 행정 경력<br />前 송파세무서장</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Academia</div>
            <div className="jt-matrix__n">3<em>권</em></div>
            <div className="jt-matrix__l">세법 기본서·세법 구조노트<br />국세청이 온다(가상자산 세금) 저자</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Teaching</div>
            <div className="jt-matrix__n">겸임<em>교수</em></div>
            <div className="jt-matrix__l">공무원학원 세법 강사<br />대학 세무회계학과</div>
          </div>
          <div className="jt-matrix__cell">
            <div className="jt-matrix__tag">Practice</div>
            <div className="jt-matrix__n">1+3<em>인</em></div>
            <div className="jt-matrix__l">회장 1 · 대표세무사 3<br />분야별 전담 체제</div>
          </div>
        </div>
      </section>

      <section className="jt-section">
        <div className="jt-section__head reveal">
          <div className="jt-kicker">PHILOSOPHY · 업무 원칙</div>
          <h2 className="jt-h2">세 가지 원칙으로 일합니다.</h2>
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
          <h2 className="jt-h2">짧지만 밀도 있는 시간.</h2>
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
      {/* ===== 회장 (featured) ===== */}
      <article className="jt-team-feature reveal">
        <div className="jt-team-feature__head">
          <div className="jt-team-feature__avatar">{D.chairman.name.slice(-1)}</div>
          <div className="jt-team-feature__intro">
            <div className="jt-team-feature__role">{D.chairman.role}</div>
            <h3 className="jt-team-feature__name">
              {D.chairman.name} <small>세무사</small>
            </h3>
            <div className="jt-team-feature__title-kr">{D.chairman.titleKr}</div>
            <p className="jt-team-feature__summary">{D.chairman.summary}</p>
          </div>
        </div>

        <div className="jt-team-feature__grid">
          <div className="jt-team-feature__col">
            <div className="jt-team-feature__col-head">학력</div>
            <ul className="jt-team-feature__bio">
              {D.chairman.education.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
            </ul>
          </div>
          <div className="jt-team-feature__col jt-team-feature__col--wide">
            <div className="jt-team-feature__col-head">경력</div>
            <ul className="jt-team-feature__bio">
              {D.chairman.bio.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
            </ul>
          </div>
        </div>

        {D.chairman.highlights && D.chairman.highlights.length > 0 &&
        <div className="jt-team-feature__cases">
            <div className="jt-team-feature__col-head jt-team-feature__col-head--inverse">주요 업무 및 활동</div>
            <ul className="jt-team-feature__cases-list">
              {D.chairman.highlights.map((h, i) =>
            <li key={i}><span className="jt-tick">—</span>{h}</li>
            )}
            </ul>
          </div>
        }
      </article>

      {/* ===== 대표세무사 ===== */}
      <div className="jt-team-row">
        {D.partners.map((p) =>
        <article key={p.name} className="jt-team-card reveal">
            <div className="jt-team-card__head">
              <div className="jt-team-card__avatar">{p.initials}</div>
              <div className="jt-team-card__role">{p.role}</div>
            </div>
            <h3 className="jt-team-card__name">
              {p.name} <small>세무사</small>
            </h3>
            <div className="jt-team-card__title-kr">{p.titleKr}</div>
            {p.summary && <p className="jt-team-card__summary">{p.summary}</p>}

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

            <div className="jt-team-card__block">
              <div className="jt-team-card__block-head">경력 · 활동</div>
              <ul className="jt-team-card__bio">
                {p.bio.map((b, i) =>
              <li key={i}><time>{b.y}</time><span>{b.t}</span></li>
              )}
              </ul>
            </div>

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

      <p className="jt-team__note">

      </p>
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
          <div key={s.num} className="jt-service-detail reveal" data-delay={Math.min(i, 4)}>
              <div className="jt-service-detail__num">
                {s.num}
                <small>{s.en}</small>
              </div>
              <div className="jt-service-detail__body">
                <h3>{s.kr}</h3>
                <p style={{ fontSize: 17, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 16 }}>{s.short}</p>
                <p>{s.desc}</p>
                <button className="jt-btn jt-btn--outline" style={{ marginTop: 24 }} onClick={() => {
                try {sessionStorage.setItem('jt_preferred_topic', s.kr);} catch (_) {}
                setRoute('booking');
              }}>
                  이 분야 상담 예약 <span className="jt-arrow">→</span>
                </button>
              </div>
              <div className="jt-service-detail__side">
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
        <ul className="jt-insights">
          {items.map((a, i) =>
          <li key={a.title} className="jt-insights__row reveal" data-delay={Math.min(i, 4)} onClick={() => { if (a.slug) { window.location.href = '/insights/' + a.slug + '.html'; } }} style={{ cursor: 'pointer' }}>
              <span className="jt-insights__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="jt-insights__title">{a.title}</span>
              <span className="jt-insights__tag">{a.tag}</span>
              <span className="jt-insights__date">{a.date}</span>
              <span className="jt-arrow">→</span>
            </li>
          )}
        </ul>
      </section>
    </>);

}
window.JTInsightsPage = JTInsightsPage;