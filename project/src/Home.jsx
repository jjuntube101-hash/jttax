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
    case 'phone': // 전화
      return <svg {...p}><path d="M5 4h3l1.6 4-2 1.4a11 11 0 0 0 5 5l1.4-2 4 1.6V19a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 1-2z" /></svg>;
    case 'mail': // 이메일
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>;
    default:
      return null;
  }
}
window.JTSitIcon = JTSitIcon;
window.JTIcon = JTSitIcon;

// ============ 상황별 진입 카드 (히어로) ============
// 6개 = 서비스 5분야 + 일반상담. topic은 booking/services 분야 자동선택 키와 매칭.
const JT_SITUATIONS = [
{ ico: 'home', num: '01', sit: '집·재산을 팔거나, 물려주거나 받는다', t: '양도·상속·증여', hook: '시점이 곧 금액입니다.', d: '시점이 곧 금액입니다. 신고 전 절세 구간과 이전 구조를 먼저 설계합니다.', topic: '양도·상속·증여' },
{ ico: 'corp', num: '02', sit: '법인·개인사업체 운영 중', t: '법인·개인 사업 운영', hook: '매월이 12월 결산을 만듭니다.', d: '매월 결산이 12월 결산을 만듭니다. 기장·신고부터 법인 구조까지.', topic: '기장·세금 신고' },
{ ico: 'audit', num: '03', sit: '세무서에서 연락이 왔다', t: '세무조사 대응', hook: '첫 답변이 결과를 가릅니다.', d: '첫 답변이 결과를 가릅니다. 39년 국세 경력이 통지 단계부터 함께합니다.', topic: '세무조사 대응' },
{ ico: 'refund', num: '04', sit: '이미 낸 세금이 억울하다', t: '경정·환급', hook: '5년 안이면 늦지 않았습니다.', d: '5년 이내면 늦지 않았습니다. 과오납 세금을 돌려받을 권리를 검토합니다.', topic: '경정청구' },
{ ico: 'consult', num: '05', sit: '큰 결정을 앞두고 있다', t: '세금 컨설팅', hook: '결정 전에, 숫자로 비교하세요.', d: '법인 전환·지분 재구성 전, 여러 시나리오의 총 부담을 수치로 비교합니다.', topic: '세금 종합 컨설팅' },
{ ico: 'chat', num: '06', sit: '어디에 속하는지 모르겠다', t: '일반 상담', hook: '상황만 말씀해 주세요.', d: '괜찮습니다. 상황만 말씀해 주시면 담당 분야와 다음 절차를 안내합니다.', topic: '', general: true }];


// ============ Hero — 상황별 진입 ============
function JTHero({ setRoute }) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const pick = (s) => {
    if (s.topic) {try {sessionStorage.setItem('jt_preferred_topic', s.topic);} catch (e) {}}
    setRoute('booking');
  };
  return (
    <section className="jt-sithero">
      <div className="jt-sithero__inner">
        <div className="jt-kicker">WHERE TO START · 상황별 안내</div>
        <h1 className="jt-sithero__title">지금, 어떤 상황이신가요?</h1>
        <p className="jt-sithero__sub">세금은 상황마다 답이 다릅니다.</p>
      </div>
      <div className="jt-sits" style={{ gridTemplateColumns: w <= 640 ? '1fr' : (w <= 960 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)') }}>
        {JT_SITUATIONS.map((s, i) => <div
            key={s.num}
            data-delay={Math.min(i, 5)}
            className={`jt-sit reveal ${s.general ? 'jt-sit--general' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => pick(s)}
            onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();pick(s);}}}>
            <div className="jt-sit__top">
              <div className="jt-sit__ico" aria-hidden="true"><JTSitIcon name={s.ico} /></div>
              <span className="jt-sit__num">{s.num}</span>
            </div>
            <div className="jt-sit__sit">{s.sit}</div>
            {s.hook && <div className="jt-sit__hook">{s.hook}</div>}
            <div className="jt-sit__t">{s.t}</div>
            <div className="jt-sit__go">{s.general ? '편하게 문의' : '이 상황 상담'} <span className="jt-arrow">→</span></div>
          </div>
        )}
      </div>
    </section>);

}
window.JTHero = JTHero;

// ============ Brand Moment — 로고 + 슬로건 (다크 앵커) ============
function JTBrandMoment() {
  return (
    <section className="jt-brandmoment" aria-label="제이티 세무법인">
      <div className="jt-brandmoment__inner">
        <div className="jt-brandmoment__logowrap reveal" role="img" aria-label="제이티 세무법인 · JT TAX CORP.">
          <svg className="jt-bm-logosvg" viewBox="74.9 195.1 271.1 205" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g className="jt-bm-g jt-bm-g--symbol">
    <path d="M0 0V-83.221L-17.231-65.99H-42.95V-98.204L9.612-98.174 32.154-75.119 32.213 0Z" transform="matrix(1,0,0,-1,182.414,203.14209)" pathLength="1" />
    <path d="M0 0-48.285-.03-70.827-23.085-70.887-98.204H-38.673V-49.563L-56.021-32.215H0Z" transform="matrix(1,0,0,-1,291.8127,203.14209)" pathLength="1" />
  </g>
  <g className="jt-bm-g jt-bm-g--korean">
    <path d="M0 0H15.779V-5.979H11.109V-7.852C11.109-16.52 12.205-20.908 16.167-23.561V-30.741C12.488-29.185 9.729-26.779 7.891-23.101 6.05-26.779 3.326-29.185-.353-30.741V-23.561C3.608-20.908 4.705-16.52 4.705-7.852V-5.979H0ZM12.984-11.107H17.935V1.062H24.128V-31.803H17.935V-17.157H12.984ZM25.507 1.062H31.84V-31.803002H25.507Z" transform="matrix(1,0,0,-1,83.2661,325.6115)" pathLength="1" />
    <path d="M0 0C0 5.199 4.494 8.736 9.978 8.736 15.496 8.736 20.025 5.199 20.025 0V-14.329C20.025-19.529 15.496-23.067 9.978-23.067 4.494-23.067 0-19.529 0-14.329ZM7.537-14.681C7.537-15.92 8.562-17.088 10.084-17.088 11.605-17.088 12.665-15.92 12.665-14.681V.354C12.665 1.521 11.605 2.795 10.084 2.795 8.562 2.795 7.537 1.521 7.537 .354ZM23.491 9.268H31.451V-23.597002H23.491Z" transform="matrix(1,0,0,-1,118.6285,333.8175)" pathLength="1" />
    <path d="M153.991 269.664H175.219V263.651H153.991ZM176.598 240.339 153.991 238.924V261.704H175.041V255.868H161.773V245.75L176.598 246.741ZM177.483 270.727H185.44301V237.86199H177.483Z" transform="matrix(1,0,0,-1,0,595.276)" pathLength="1" />
    <path d="M0 0C4.315 3.36 5.095 7.289 4.988 17.582V23.454H11.532V17.088C11.532 7.147 12.24 3.326 16.52 0V-7.641C12.734-5.482 10.045-3.183 8.242 .46 6.439-3.183 3.784-5.482 0-7.641ZM13.443 13.019H18.288V24.162H24.481V-8.702H18.288V6.653H13.443ZM25.859 24.162H32.192V-8.703001H25.859Z" transform="matrix(1,0,0,-1,199.6091,348.7125)" pathLength="1" />
    <path d="M0 0H32.546V-6.369H20.269V-14.789H12.275V-6.369H0ZM1.236 17.899H31.306V2.6160002H1.236ZM8.842 8.56H23.7V11.886001H8.842Z" transform="matrix(1,0,0,-1,234.6182,342.9797)" pathLength="1" />
    <path d="M0 0H-4.742V-5.802H-23.668V11.426H-16.203V8.1H-12.063V11.426H-4.742V6.013H0V11.781H7.818V-6.721H0ZM-22.181-7.429H-14.399V-9.021H0V-7.429H7.818V-21.085H0V-20.165L-22.181-21.085ZM-16.203-.708H-12.063V3.007H-16.203ZM-14.399-15.849 0-15.354V-13.796H-14.399Z" transform="matrix(1,0,0,-1,294.3547,336.3301)" pathLength="1" />
    <path d="M0 0C0 5.199 4.494 8.066 10.013 8.066 15.496 8.066 19.988 5.199 19.988 0V-3.749C19.988-8.844 15.496-11.709 10.013-11.709 4.494-11.709 0-8.844 0-3.749ZM31.983-24.799H1.487V-13.55H9.376V-18.998H31.983ZM7.642-4.174C7.642-5.413 8.634-6.298 10.013-6.298 11.32-6.298 12.382-5.413 12.382-4.174V.425C12.382 1.663 11.32 2.652 10.013 2.652 8.634 2.652 7.642 1.663 7.642 .425ZM23.491 8.066H31.451V-15.848H23.491Z" transform="matrix(1,0,0,-1,306.0488,332.6156)" pathLength="1" />
  </g>
  <g className="jt-bm-g jt-bm-g--latin">
    <path d="M0 0C-.11-.658-.363-1.276-.753-1.847-1.147-2.421-1.712-2.899-2.45-3.282-3.185-3.667-4.183-3.859-5.439-3.859-6.144-3.859-6.827-3.761-7.485-3.566-8.146-3.369-8.732-3.064-9.251-2.648-9.769-2.232-10.185-1.698-10.498-1.046-10.814-.397-10.969 .393-10.969 1.319V2.778H-7.627V2.024C-7.627 1.617-7.596 1.239-7.533 .894-7.47 .548-7.36 .255-7.203 .011-7.047-.231-6.831-.423-6.557-.565-6.281-.705-5.925-.777-5.485-.777-4.998-.777-4.623-.69-4.356-.518-4.088-.345-3.896-.121-3.78 .154-3.661 .428-3.592 .726-3.568 1.047-3.544 1.368-3.532 1.679-3.532 1.977V13.322H.164V1.813C.164 1.263 .108 .659 0 0" transform="matrix(1,0,0,-1,118.7493,388.2751)" pathLength="1" />
    <path d="M0 0V-3.105H5.036V-16.805H8.733V-3.105H13.768V0Z" transform="matrix(1,0,0,-1,125.5499,374.9537)" pathLength="1" />
    <path d="M0 0V-3.105H5.036V-16.805H8.732V-3.105H13.768V0Z" transform="matrix(1,0,0,-1,155.8901,374.9537)" pathLength="1" />
    <path d="M0 0-6.353-16.805H-2.635L-1.319-13.062H4.966L6.237-16.805H10.073L3.79 0ZM1.837-4.142H1.882L4.002-10.308H-.354Z" transform="matrix(1,0,0,-1,178.721,374.9537)" pathLength="1" />
    <path d="M0 0-3.412-5.366-6.708 0H-10.99L-5.578-8.001-11.44-16.805H-7.295L-3.552-10.99 .119-16.805H4.519L-1.341-8.024 4.049 0Z" transform="matrix(1,0,0,-1,204.6581,374.9537)" pathLength="1" />
    <path d="M0 0C-.22 .352-.494 .663-.825 .93-1.153 1.196-1.526 1.403-1.943 1.554-2.357 1.703-2.793 1.776-3.248 1.776-4.079 1.776-4.785 1.617-5.366 1.296-5.946 .974-6.417 .542-6.78 0-7.14-.542-7.403-1.157-7.567-1.847-7.732-2.538-7.814-3.252-7.814-3.99-7.814-4.697-7.732-5.383-7.567-6.05-7.403-6.716-7.14-7.316-6.78-7.85-6.417-8.383-5.946-8.81-5.366-9.132-4.785-9.454-4.079-9.615-3.248-9.615-2.117-9.615-1.235-9.27-.6-8.579 .034-7.889 .423-6.98 .565-5.849H4.142C4.049-6.9 3.805-7.85 3.412-8.698 3.022-9.544 2.503-10.267 1.861-10.863 1.215-11.458 .462-11.914-.4-12.227-1.263-12.542-2.213-12.698-3.248-12.698-4.535-12.698-5.691-12.475-6.72-12.028-7.749-11.579-8.614-10.964-9.32-10.181-10.028-9.395-10.568-8.473-10.946-7.414-11.32-6.356-11.511-5.214-11.511-3.99-11.511-2.735-11.32-1.569-10.946-.494-10.568 .581-10.028 1.518-9.32 2.319-8.614 3.119-7.749 3.747-6.72 4.2-5.691 4.656-4.535 4.885-3.248 4.885-2.322 4.885-1.449 4.751-.624 4.483 .201 4.218 .937 3.829 1.588 3.32 2.24 2.808 2.778 2.178 3.201 1.425 3.623 .671 3.891-.192 4.001-1.165H.423C.36-.742 .22-.354 0 0" transform="matrix(1,0,0,-1,237.3981,379.4367)" pathLength="1" />
    <path d="M0 0C.379 1.075 .918 2.012 1.626 2.813 2.331 3.613 3.197 4.241 4.226 4.694 5.254 5.15 6.411 5.379 7.697 5.379 9.001 5.379 10.16 5.15 11.181 4.694 12.201 4.241 13.065 3.613 13.771 2.813 14.476 2.012 15.018 1.075 15.394 0 15.772-1.075 15.959-2.241 15.959-3.496 15.959-4.72 15.772-5.862 15.394-6.92 15.018-7.979 14.476-8.901 13.771-9.687 13.065-10.47 12.201-11.085 11.181-11.534 10.16-11.981 9.001-12.204 7.697-12.204 6.411-12.204 5.254-11.981 4.226-11.534 3.197-11.085 2.331-10.47 1.626-9.687 .918-8.901 .379-7.979 0-6.92-.375-5.862-.565-4.72-.565-3.496-.565-2.241-.375-1.075 0 0M3.378-5.556C3.542-6.222 3.806-6.822 4.166-7.356 4.528-7.889 4.998-8.316 5.579-8.638 6.16-8.96 6.866-9.121 7.697-9.121 8.528-9.121 9.235-8.96 9.816-8.638 10.395-8.316 10.868-7.889 11.228-7.356 11.588-6.822 11.852-6.222 12.016-5.556 12.182-4.889 12.264-4.203 12.264-3.496 12.264-2.758 12.182-2.044 12.016-1.353 11.852-.663 11.588-.048 11.228 .494 10.868 1.036 10.395 1.468 9.816 1.79 9.235 2.111 8.528 2.27 7.697 2.27 6.866 2.27 6.16 2.111 5.579 1.79 4.998 1.468 4.528 1.036 4.166 .494 3.806-.048 3.542-.663 3.378-1.353 3.214-2.044 3.132-2.758 3.132-3.496 3.132-4.203 3.214-4.889 3.378-5.556" transform="matrix(1,0,0,-1,248.6016,379.9307)" pathLength="1" />
    <path d="M0 0C.754 0 1.432-.121 2.035-.365 2.64-.607 3.158-.941 3.59-1.364 4.021-1.787 4.352-2.279 4.578-2.836 4.805-3.393 4.919-3.993 4.919-4.637 4.919-5.625 4.712-6.48 4.296-7.203 3.878-7.923 3.201-8.474 2.26-8.849V-8.897C2.716-9.022 3.091-9.214 3.389-9.473 3.687-9.732 3.931-10.039 4.118-10.391 4.309-10.744 4.444-11.133 4.53-11.556 4.617-11.979 4.676-12.404 4.708-12.827 4.723-13.095 4.74-13.407 4.755-13.768 4.77-14.13 4.798-14.497 4.837-14.875 4.876-15.251 4.939-15.609 5.025-15.946 5.111-16.283 5.241-16.569 5.414-16.805H1.719C1.514-16.272 1.388-15.636 1.343-14.899 1.296-14.161 1.225-13.455 1.129-12.78 1.004-11.901 .738-11.258 .331-10.85-.077-10.442-.745-10.238-1.67-10.238H-5.365V-16.805H-9.062V0ZM-1.318-7.601C-.471-7.601 .165-7.414 .589-7.036 1.012-6.661 1.225-6.048 1.225-5.202 1.225-4.386 1.012-3.792 .589-3.424 .165-3.057-.471-2.871-1.318-2.871H-5.365V-7.601Z" transform="matrix(1,0,0,-1,280.8495,374.9535)" pathLength="1" />
    <path d="M0 0C1.051 0 1.945-.154 2.683-.458 3.421-.764 4.021-1.168 4.482-1.671 4.947-2.173 5.283-2.746 5.494-3.389 5.706-4.032 5.814-4.698 5.814-5.39 5.814-6.065 5.706-6.728 5.494-7.377 5.283-8.029 4.947-8.605 4.482-9.108 4.021-9.612 3.421-10.015 2.683-10.321 1.945-10.626 1.051-10.779 0-10.779H-3.883V-16.805H-7.58V0ZM-1.012-7.908C-.589-7.908-.181-7.876 .211-7.813 .603-7.751 .95-7.63 1.247-7.448 1.545-7.27 1.785-7.012 1.966-6.684 2.146-6.354 2.235-5.922 2.235-5.39 2.235-4.856 2.146-4.424 1.966-4.095 1.785-3.766 1.545-3.51 1.247-3.331 .95-3.149 .603-3.028 .211-2.966-.181-2.903-.589-2.871-1.012-2.871H-3.883V-7.908Z" transform="matrix(1,0,0,-1,301.0673,374.9535)" pathLength="1" />
    <path d="M309.469 203.517H313.164V207.14099H309.469Z" transform="matrix(1,0,0,-1,0,595.276)" pathLength="1" />
  </g>
</svg>
        </div>
        <h2 className="jt-brandmoment__slogan">
          <span className="reveal" data-delay="1">근거 위에서,</span>{' '}
          <span className="reveal" data-delay="2">끝까지.</span>
        </h2>
        <p className="jt-brandmoment__sub reveal" data-delay="3">
          세금은 감이 아니라 근거로 다툽니다. 신고 한 건부터 불복 한 건까지 — 기록과 법령 위에서 끝까지 함께합니다.
        </p>
      </div>
    </section>);

}
window.JTBrandMoment = JTBrandMoment;

// ============ JT 리포트 — 차별화 도구 + 프리미엄 퍼널 (플랫폼형) ============
// 계산기(검증 엔진) = 미끼/증명 → 상담 → 종합 관리(구독·종합컨설팅). "JT"는 텍스트 대신 로고 락업.
function JTReportHome({ setRoute }) {
  return (
    <section className="jt-platform" aria-label="JT 리포트 — 세금 계산 엔진">
      <div className="jt-platform__inner">
        <div className="jt-kicker reveal">JT REPORT · 검증 계산 엔진</div>
        <h2 className="jt-platform__title reveal" data-delay="1">
          <span className="jt-platform__line">계산하고 · 상담하고 · 맡기고</span>
          <span className="jt-platform__line jt-platform__line--brand">
            <img className="jt-platform__logo" src="project/assets/logo_secondary.png" alt="제이티 세무법인" />
            <span>하나로.</span>
          </span>
        </h2>
        <p className="jt-platform__sub reveal" data-delay="2">
          국세 행정 39년의 회장과 세무사가 <strong>직접 설계한 검증 계산 엔진</strong>.
          양도·상속·증여부터 종합소득세·법인 전환까지 직접 계산해 보고 —
          판단과 관리는 전문가와 끝까지 함께하세요.
        </p>
        <ol className="jt-platform__steps reveal" data-delay="3">
          <li><span className="jt-platform__step-n">01</span><span className="jt-platform__step-t">직접 계산</span><span className="jt-platform__step-d">검증 엔진으로 무료·5분</span></li>
          <li><span className="jt-platform__step-n">02</span><span className="jt-platform__step-t">전문가 상담</span><span className="jt-platform__step-d">결과를 들고 바로 연결</span></li>
          <li><span className="jt-platform__step-n">03</span><span className="jt-platform__step-t">종합 관리</span><span className="jt-platform__step-d">신고·절세를 끝까지</span></li>
        </ol>
        <div className="jt-platform__cta reveal" data-delay="4">
          <button className="jt-btn jt-btn--primary" onClick={() => setRoute('report')}>계산기 보러가기 <span className="jt-arrow">→</span></button>
          <a className="jt-link jt-platform__link" onClick={() => setRoute('booking')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoute('booking'); } }}>먼저 상담부터 →</a>
        </div>
      </div>
    </section>);

}
window.JTReportHome = JTReportHome;

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
  const [showAll, setShowAll] = useStateHome(false);
  const INITIAL = 3;
  const shown = showAll ? items : items.slice(0, INITIAL);
  return (
    <section className="jt-section jt-proof">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">PRECEDENTS · 공개 판례·참고자료</div>
          <h2 className="jt-h2 jt-display-h2">세법은 기록되어 있고,<br />결정은 공개되어 있습니다.</h2>
        </div>
        <div className="jt-proof__note">
          아래는 <strong>당사 수임 실적이 아닌</strong>, 국세법령정보시스템·국세청 통계·국세기본법에서 발췌한 공개 자료입니다.<br />귀하 사안의 적용 가능성은 개별 검토가 필요합니다.
        </div>
      </div>
      <div className="jt-proof__grid">
        {shown.map((it, i) =>
        <article key={i} className={i < INITIAL ? "jt-proof__card reveal" : "jt-proof__card"} data-delay={Math.min(i, 3)}>
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
      {items.length > INITIAL &&
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center' }}>
          <button className="jt-btn jt-btn--outline jt-btn--sm" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
            {showAll ? '접기 ↑' : `공개 사례 더 보기 (+${items.length - INITIAL}) ↓`}
          </button>
        </div>
      }
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
        <h2 className="jt-h2 jt-display-h2">기관이 자문을 구하고,<br />공무원이 배우는 전문성.</h2>
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
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 760;
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
          <h2 className="jt-h2 jt-display-h2">근거에 기반한<br />다섯 개 전문 영역.</h2>
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

      <div className="jt-services" style={{ gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)' }}>
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
          <article className="jt-service reveal" data-delay="4" onClick={() => setRoute('services')} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gridColumn: mobile ? 'auto' : 'span 2', minHeight: 220 }}>
            <header className="jt-service__head">
              <span>{all[4].num} · {all[4].en}</span>
              <span className="jt-arrow">→</span>
            </header>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 32, alignItems: 'end' }}>
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
          <div className="jt-pullquote__avatar">JT<img src="project/assets/team-kgb.jpg" alt="김기복 회장" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></div>
          <div><b>김기복 회장</b> · 前 송파세무서장</div>
        </div>
      </div>
    </section>);

}
window.JTQuote = JTQuote;

// ============ Insights list (home preview) ============
// 인사이트 카드 (홈·목록 공용)
function JTInsightCard({ a, i }) {
  const cat = String(a.tag || '인사이트').split('·').pop().trim();
  const go = () => { if (a.slug) window.location.href = '/insights/' + a.slug + '.html'; };
  return (
    <article className="jt-icard reveal" data-delay={Math.min(i, 5)} role="button" tabIndex={0}
      onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      <div className="jt-icard__top">
        <span className="jt-icard__cat">{cat}</span>
        <span className="jt-icard__date">{a.date}</span>
      </div>
      <h3 className="jt-icard__title">{a.title}</h3>
      <span className="jt-icard__go">읽기 <span className="jt-arrow">→</span></span>
    </article>);

}
window.JTInsightCard = JTInsightCard;

function JTInsightsPreview({ setRoute, limit }) {
  const items = window.JT_DATA.insights.slice(0, limit || 4);
  return (
    <section className="jt-section">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">INSIGHTS · 최근 글</div>
          <h2 className="jt-h2 jt-display-h2">실무에 바로 쓰는 해설.</h2>
        </div>
        <a className="jt-link" onClick={() => setRoute('insights')}>전체 보기 →</a>
      </div>
      <div className="jt-icards">
        {items.map((a, i) => <JTInsightCard key={a.slug || a.title} a={a} i={i} />)}
      </div>
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
          <h2 className="jt-h2 jt-display-h2">회장 1인과 대표세무사 3인,<br />각자의 전문 영역.</h2>
        </div>
        <a className="jt-link" onClick={() => setRoute('about', 'team')}>전체 구성원 보기 →</a>
      </div>
      <div className="jt-team-preview">
        {profiles.map((p, i) =>
        <article key={p.code} className={`jt-team-preview__card reveal ${i === 0 ? 'is-lead' : ''}`} data-delay={Math.min(i, 3)}>
            <div className="jt-team-preview__avatar" style={{ position: 'relative', overflow: 'hidden', width: 120, height: 120, flexShrink: 0 }}>
              {p.photo && <img src={p.photo} alt={p.kr} onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />}
              {p.code}
            </div>
            <div className="jt-team-preview__role">{p.role}</div>
            <h3 className="jt-team-preview__name">{p.kr}</h3>
            <div className="jt-team-preview__focus">{p.focus}</div>
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
          <h2 className="jt-h2 jt-display-h2">전화가 부담스러우면,<br />카톡·이메일로도 됩니다.</h2>
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
          <a className="jt-channels__card" href={window.jtKakaoUrl()} target="_blank" rel="noopener">
            <div className="jt-channels__label">카카오톡 채널</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.kakaoSearchId}</div>
            <div className="jt-channels__sub">1:1 채팅 상담 · 자료 전송 가능 · 영업일 24h 내 회신</div>
          </a>
        </div>
      </div>
    </section>);

}
window.JTChannels = JTChannels;

// ============ FAQ (자주 묻는 질문) ============
function JTFaq({ setRoute }) {
  const items = window.JT_DATA.faq || [];
  const [open, setOpen] = useStateHome(-1);
  if (!items.length) return null;
  return (
    <section className="jt-section">
      <div className="jt-section__head reveal">
        <div className="jt-kicker">FAQ · 자주 묻는 질문</div>
        <h2 className="jt-h2 jt-display-h2">궁금한 점을<br />먼저 풀어드립니다.</h2>
      </div>
      <div style={{ borderTop: '1px solid var(--border-1)' }}>
        {items.map((it, i) =>
          <div key={i} className="reveal" style={{ borderBottom: '1px solid var(--border-1)' }} data-delay={Math.min(i, 4)}>
            <button
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', background: 'none', border: 0, textAlign: 'left', padding: '24px 4px', cursor: 'pointer', font: 'inherit', color: 'var(--fg-1)' }}>
              <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-sans-en)', fontSize: 13, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{it.q}</span>
              </span>
              <span className="jt-arrow" style={{ fontSize: 22, lineHeight: 1, color: 'var(--fg-2)', flexShrink: 0 }}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i &&
              <p style={{ margin: 0, padding: '0 4px 28px 44px', fontSize: 16, lineHeight: 1.75, color: 'var(--fg-2)' }}>{it.a}</p>
            }
          </div>
        )}
      </div>
      <div className="reveal" style={{ marginTop: 36, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--fg-2)', fontSize: 15 }}>더 궁금한 점이 있으신가요?</span>
        <button className="jt-btn jt-btn--primary" onClick={() => setRoute('booking')}>무료 상담 신청 <span className="jt-arrow">→</span></button>
      </div>
    </section>);
}
window.JTFaq = JTFaq;