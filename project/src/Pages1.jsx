/* global React */
function JTRenewalPageIntro({ title, text }) {
  return <header className="rn-page-intro rn-shell"><h1>{title}</h1><p className="rn-lead">{text}</p></header>;
}
function JTAbout({ setRoute, initialTab }) {
  const [tab,setTab] = React.useState(initialTab === 'team' ? 'team' : 'company');
  React.useEffect(()=>{setTab(initialTab === 'team' ? 'team' : 'company');},[initialTab]);
  const contentMotion = useJTContentMotion(tab);
  const select = next => {setTab(next); setRoute('about', next);};
  const keyTab = e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); const next=e.key==='Home'?'company':e.key==='End'?'team':tab==='company'?'team':'company';select(next);
    document.getElementById('rn-about-tab-'+next)?.focus();
  };
  return <div className="rn-page rn-about">
    <JTRenewalPageIntro title={tab === 'company' ? <>사업과 재산의 세금,<br/>실무 경험으로 살핍니다.</> : <>대표세무사 소개</>} text={tab === 'company' ? '사무소 운영, 기업 회계, 재산 세무와 교육·자문의 경험을 모았습니다. 고객의 상황에 맞는 업무와 진행 방법을 설명합니다.' : '세 대표세무사의 주요 실무와 경력을 소개합니다. 특정 분야를 정하지 못하셨다면 상담 과정에서 필요한 업무를 함께 확인합니다.'}/>
    <div className="rn-shell rn-about-tabs" role="tablist" aria-label="제이티 소개"><button id="rn-about-tab-company" role="tab" aria-selected={tab==='company'} aria-controls="rn-about-panel" tabIndex={tab==='company'?0:-1} onKeyDown={keyTab} onClick={()=>select('company')}>제이티 소개</button><button id="rn-about-tab-team" role="tab" aria-selected={tab==='team'} aria-controls="rn-about-panel" tabIndex={tab==='team'?0:-1} onKeyDown={keyTab} onClick={()=>select('team')}>대표세무사 소개</button></div>
    <div ref={contentMotion} role="tabpanel" id="rn-about-panel" aria-labelledby={'rn-about-tab-'+tab}>{tab==='company'?<JTAboutCompany D={window.JT_DATA} setRoute={setRoute} onSeeTeam={()=>select('team')}/>:<JTAboutTeam D={window.JT_DATA.team} setRoute={setRoute}/>}</div>
  </div>;
}
window.JTAbout=JTAbout;
function JTAboutCompany({D,setRoute,onSeeTeam}) {
  return <>
    <section className="rn-shell rn-company-opening"><figure className="rn-team-figure"><img src="/project/assets/people/renewal/team-front.jpg" alt="제이티 세 대표세무사 단체 초상" width="1536" height="1024" decoding="async"/></figure><div className="rn-company-note"><h2>각자의 경험을,<br/>고객의 문제에 모읍니다.</h2><p>재산의 거래와 이전, 사업의 장부와 신고, 조사와 지난 신고의 검토까지. 제이티는 필요한 업무를 확인하는 일에서 시작합니다.</p><p>세무사별 주요 실무와 이력을 공개합니다. 함께할 사람을 확인하고, 궁금한 점을 편하게 물어보세요.</p><button className="rn-button" onClick={onSeeTeam}>세 대표의 경력 보기 →</button></div></section>
    <section className="rn-shell rn-section"><div className="rn-section-heading"><h2>세 대표, 세 가지 경험.</h2><p>모든 대표세무사가 고객의 상황과 자료를 바탕으로 업무를 검토합니다.</p></div><div className="rn-people-summary">{D.team.partners.map(p=><article key={p.name}><h3>{p.name}<span>대표세무사</span></h3><p className="rn-specialty">{p.titleKr}</p><p>{p.summary}</p><a className="rn-link" href={'/experts/'+window.JT_RENEWAL_PEOPLE[p.name]+'.html'}>{p.name} 경력과 주요 업무 →</a></article>)}</div></section>
    <section className="rn-method-band"><div className="rn-shell rn-section rn-company-method"><div><h2>설명을 듣고,<br/>다음 단계를 결정하세요.</h2><p>무엇을 검토하는지와 어떤 자료가 필요한지 알 수 있도록 안내합니다.</p></div><ol className="rn-method-list"><li><h3>궁금한 점을 먼저 확인합니다</h3><p>현재 상황과 거래·신고 일정을 확인하고 상담할 내용을 정리합니다.</p></li><li><h3>근거와 선택지를 설명합니다</h3><p>자료에서 확인한 사실과 추가로 살펴볼 쟁점을 구분해 설명합니다.</p></li><li><h3>업무 범위와 절차를 안내합니다</h3><p>필요한 업무와 준비자료를 확인한 뒤 진행 방법을 정합니다.</p></li></ol></div></section>
    <section className="rn-shell rn-section rn-history"><div><h2>제이티가 이어온 길.</h2><p>각 사무소의 경험이 제이티 세무법인으로 이어졌습니다.</p></div><ol>{D.timeline.map((e,i)=><li key={i}><time>{e.y}</time><p>{e.t}</p></li>)}</ol></section>
    <section className="rn-shell rn-section rn-final-prompt"><h2>어떤 도움이 필요한지 들려주세요.</h2><p>업무 분야를 정하기 어려우시면 현재 상황부터 말씀해 주세요.</p><a className="rn-button" href="/#/booking/general" onClick={()=>window.jtTrackCta('booking','cta_band')}>상담 신청하기 →</a></section>
  </>;
}
window.JTAboutCompany=JTAboutCompany;
function JTRenewalCareer({ label, items, books }) {
  if (!items || !items.length) return null;
  return <div className="rn-career-block"><h4>{label}</h4><ul>{items.map((v,i)=><li key={i}>{typeof v==='string'?v:<><span>{v.y}</span>{v.t}</>}</li>)}</ul></div>;
}
function JTAboutTeam({D,setRoute}) {
  return <section className="rn-shell rn-section rn-team-section"><div className="rn-team-grid">{D.partners.map(p=><article key={p.name} className="rn-profile"><img className="rn-profile-studio" src={'/project/assets/people/renewal/'+window.JT_RENEWAL_PEOPLE[p.name]+'-studio.jpg'} alt={p.name+' 대표세무사 인물 사진'} width="1200" height="1600" loading="lazy" decoding="async"/><div className="rn-profile-body"><h2>{p.name}<small>대표세무사</small></h2><p className="rn-specialty">{p.titleKr}</p><p>{p.summary}</p><img className="rn-profile-work" src={'/project/assets/people/renewal/'+window.JT_RENEWAL_PEOPLE[p.name]+'-work.jpg'} alt={p.name+' 대표세무사 업무 초상'} width="1536" height="1024" loading="lazy" decoding="async"/><JTRenewalCareer label="주요 실무" items={p.scope}/><details className="rn-profile-details"><summary>{p.name} 경력 자세히 보기</summary><JTRenewalCareer label="실무 경력" items={p.bio}/><JTRenewalCareer label="자문·대외활동" items={p.advisory}/><JTRenewalCareer label="교육 활동" items={p.teaching}/><JTRenewalCareer label="저서" items={p.books}/><JTRenewalCareer label="학력" items={p.education}/><JTRenewalCareer label="자격" items={p.certs}/></details><a className="rn-link" href={'/experts/'+window.JT_RENEWAL_PEOPLE[p.name]+'.html'}>개별 소개 페이지 →</a></div></article>)}</div><div className="rn-final-prompt"><h2>분야가 겹치는 문제도 말씀해 주세요.</h2><p>상담할 내용을 먼저 확인하고 필요한 업무를 안내합니다.</p><a className="rn-button" href="/#/booking/general">상담 신청하기 →</a></div></section>;
}
window.JTAboutTeam=JTAboutTeam;
function JTTeam({setRoute}) {return <JTAbout setRoute={setRoute} initialTab="team"/>;}
window.JTTeam=JTTeam;
const JT_RENEWAL_SERVICE_COPY = {
  'asset-transfer': { title:'양도·상속·증여', text:'재산을 팔거나 물려주기 전에 거래 구조와 신고할 사항을 함께 살펴봅니다.', booking:'asset'},
  'tax-audit': { title:'세무조사 대응', text:'통지 내용과 일정을 확인하고, 설명에 필요한 장부와 증빙을 정리합니다.', booking:'audit'},
  'bookkeeping': {title:'세무기장·세금 신고',text:'매월의 거래를 장부로 정리하고 결산과 신고에 필요한 사항을 확인합니다.',booking:'bookkeeping'},
  'consulting': {title:'세무 자문·사업 구조 검토',text:'법인 전환이나 사업 구조 변경을 앞두고 선택에 따른 세무 사항을 검토합니다.',booking:'consulting'},
  'tax-refund': {title:'지난 신고·경정청구 검토',text:'이미 신고한 내용과 증빙을 확인해 다시 검토할 쟁점과 절차를 안내합니다.',booking:'refund'},
  '취득세': {title:'취득세',text:'취득 전 확인할 세금과 준비사항, 이미 낸 취득세의 재검토를 안내합니다.',booking:'acquisition'},
  '유튜버·크리에이터 세무': {title:'유튜버·크리에이터 세무',text:'첫 정산부터 겸업·팀 운영까지, 플랫폼 수익에 맞는 장부와 신고를 준비합니다.',booking:'creators'}
};
function JTServicesPage({setRoute}) {
  const groups=window.JT_RENEWAL_GROUPS;
  const fromHash=()=>{const key=window.location.hash.split('/')[2];return groups.some(g=>g.id===key)?key:'property';};
  const [active,setActive]=React.useState(fromHash);
  React.useEffect(()=>{const sync=()=>setActive(fromHash());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
  const group=groups.find(g=>g.id===active);
  const select=id=>{setActive(id);window.location.hash='/services/'+id;};
  return <div className="rn-page rn-services"><JTRenewalPageIntro title={<>지금 상황에 맞는<br/>업무부터 찾아보세요.</>} text="거래를 앞두고 있거나, 신고가 필요하거나, 받은 통지가 걱정되시나요? 상황을 선택하면 관련 업무와 준비할 내용을 안내합니다."/>
    <section className="rn-shell rn-section rn-service-selector"><div className="rn-choice-grid" role="group" aria-label="필요한 업무의 상황">{groups.map(g=><button className="rn-choice" key={g.id} aria-pressed={active===g.id} onClick={()=>select(g.id)}><span>{g.name}</span><strong>{g.question}</strong><span aria-hidden="true">{active===g.id?'선택됨':'선택하기 →'}</span></button>)}</div>
      <div className="rn-service-results" id="rn-service-results" key={active}><div className="rn-section-heading"><h2>{group.name}</h2><p>{group.description}</p></div><div className="rn-service-grid">{group.indices.map(index=>{const s=window.JT_DATA.services[index];const c=JT_RENEWAL_SERVICE_COPY[s.slug||s.kr];return <article className="rn-service" key={s.num}><h3>{c.title}</h3><p>{c.text}</p><details><summary>어떤 내용을 검토하나요?</summary><ul>{s.points.map(point=><li key={point.b}><strong>{point.b}</strong><p>{point.s}</p></li>)}</ul></details><div className="rn-service-links"><a className="rn-link" href={s.href||'/services/'+s.slug+'.html'}>업무 자세히 보기 →</a><a className="rn-button rn-button-small" href={'/#/booking/'+c.booking} onClick={()=>window.jtTrackCta('booking','services')}>이 업무로 상담 신청</a></div></article>;})}</div></div>
      <aside className="rn-prepare"><div><h2>상담 전에 살펴보면 좋은 자료.</h2><p>지금은 자료를 보내지 않으셔도 됩니다. 어떤 자료가 있는지만 확인해 주세요.</p></div><ul>{group.prepare.map(p=><li key={p}>{p}</li>)}</ul></aside>
      <div className="rn-not-sure"><h3>어느 분야인지 모르겠다면.</h3><p>현재 상황을 말씀해 주시면 필요한 업무를 함께 확인합니다.</p><a className="rn-link" href="/#/booking/general">일반 상담 신청 →</a></div>
    </section></div>;
}
window.JTServicesPage=JTServicesPage;
function JTInsightsPage({setRoute}) {
  const items=window.JT_DATA.insights;
  const [category,setCategory]=React.useState('전체');const [query,setQuery]=React.useState('');const [limit,setLimit]=React.useState(12);
  const cats=[...new Set(items.map(window.jtInsightCategory))];
  const filtered=items.filter(a=>(category==='전체'||window.jtInsightCategory(a)===category)&&[a.title,a.excerpt,a.tag].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="rn-page rn-insights"><JTRenewalPageIntro title={<>세금 가이드</>} text="현재 상황과 관련된 글을 찾아보세요. 발행일과 수정 내용을 확인하고, 개별 판단이 필요한 부분은 상담으로 이어가실 수 있습니다."/>
    <section className="rn-shell rn-section"><div className="rn-insight-controls"><div><label htmlFor="rn-insight-query">궁금한 내용을 검색하세요</label><input id="rn-insight-query" type="search" placeholder="예: 유튜버, 상속, 취득세" value={query} onChange={e=>{setQuery(e.target.value);setLimit(12);}}/></div><div><label htmlFor="rn-insight-category">분야</label><select id="rn-insight-category" value={category} onChange={e=>{setCategory(e.target.value);setLimit(12);}}><option>전체</option>{cats.map(c=><option key={c}>{c}</option>)}</select></div></div>
      <div className="rn-result-summary"><p role="status">{filtered.length}개 글 · {Math.min(limit,filtered.length)}개 표시</p><span>발행일 최신순</span></div>
      <div className="rn-insight-grid">{filtered.slice(0,limit).map((a,i)=><window.JTInsightCard a={a} i={i} key={a.slug}/>)}</div>
      {filtered.length===0&&<div className="rn-empty"><h2>검색 결과가 없습니다.</h2><p>짧은 단어로 다시 검색하거나 분야를 전체로 바꿔 보세요.</p><button className="rn-button" onClick={()=>{setQuery('');setCategory('전체');}}>전체 글 보기</button></div>}
      {limit<filtered.length&&<div className="rn-more"><button className="rn-button" onClick={()=>setLimit(n=>n+12)}>글 더 보기 · {filtered.length-limit}개 남음</button></div>}
      <p className="rn-editorial-note">각 글의 발행일·수정일과 본문에 적힌 적용 조건을 확인해 주세요. 같은 주제도 거래 시점과 사실관계에 따라 검토 내용이 달라집니다.</p>
    </section></div>;
}
window.JTInsightsPage=JTInsightsPage;
