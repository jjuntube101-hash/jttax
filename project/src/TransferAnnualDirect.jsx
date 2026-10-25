/* Direct calculation only: no case storage, publishing, or assessment submission. */
function annualDirectRequest(d) {
  const ref=(v,label,max=200)=>{const s=String(v??'').trim();if(!s||s.length>max)throw new Error(label+'을 입력해 주세요.');return s;};
  const money=(v,label)=>{if(!/^\d+$/.test(String(v??''))||!Number.isSafeInteger(Number(v)))throw new Error(label+'을 0 이상의 원 단위 정수로 입력해 주세요.');return Number(v);};
  const date=(v,label)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error(label+'을 실제 날짜로 입력해 주세요.');return v;};
  const confirm=(v,label)=>{if(v!==true)throw new Error(label+' 확인이 필요합니다.');};
  const year=money(d.year,'귀속연도');if(year!==2026)throw new Error('현재 직접 연간 정산은 2026년만 지원합니다.');
  const taxpayer=ref(d.taxpayer,'납세자 식별명',100),source=ref(d.source,'연간 검토 자료명');
  confirm(d.residentConfirmed,'국내 거주자');confirm(d.scopeConfirmed,'전체 거래의 누락·중복 없음');confirm(d.localConfirmed,'지방 표준세율');
  if(!Array.isArray(d.assets)||d.assets.length<2||d.assets.length>20)throw new Error('서로 다른 재산의 양도 2~20건을 입력해 주세요.');
  const housing=d.assets.every(r=>r.type==='주택');
  const mixed=!housing&&d.assets.some(r=>r.type==='주택');
  const transfers=[];
  const facts={schema_version:1,source_id:source,parties:[{party_ref:taxpayer,source_id:source,role:'taxpayer',person_type:'individual',resident:true}],assets:[],events:[],amounts:[],expenses:[],valuations:[],liabilities:[]},reviews=[],seen=new Set();
  for(const [i,r] of d.assets.entries()) {
    const name=(i+1)+'번 재산',id=ref(r.ref,name+' 식별명',100),proof=ref(r.source,name+' 증빙 자료명');
    if(seen.has(id))throw new Error('같은 재산 식별명을 중복 입력할 수 없습니다.');seen.add(id);
    if(!['토지','상가','주택'].includes(r.type))throw new Error('직접 정산은 일반 토지·상가만 지원합니다.');
    const acquired=date(r.acquired,name+' 취득일'),sold=date(r.sold,name+' 양도일');
    if(Number(sold.slice(0,4))!==year||acquired>sold)throw new Error('양도일은 귀속연도 내이며 취득일 이후여야 합니다.');
    const sale=money(r.sale,name+' 양도가액'),cost=money(r.cost,name+' 세무조정 후 취득가액'),expense=money(r.expense,name+' 필요경비');
    confirm(r.ordinaryConfirmed,name+' 등기 재산·일반 매매');
    if(r.ownership&&!['whole','share'].includes(r.ownership))throw new Error('지분 입력 방식 확인 필요');
    if(r.ownership==='share'&&(!mixed||r.type==='주택'))throw new Error('지분은 주택이 함께 있는 혼합 합산의 토지·상가만 지원합니다.');confirm(r.adjustedConfirmed,name+' 취득가 조정·공제 비용');confirm(r.noSpecialConfirmed,name+' 특례·중과 없음');
    if(r.type==='토지')confirm(r.businessConfirmed,name+' 사업용 토지');
    if(r.type==='주택') {
      const count=money(r.housingCount,name+' 양도 당시 세대 주택 수');
      if(count<2||count>1000)throw new Error('각 양도 당시 세대 주택 수 2~1000채만 지원합니다. 1주택·특례는 별도 검토가 필요합니다.');
      if(r.regulated!=='no'||!['yes','no'].includes(r.acqRegulated))throw new Error('양도 당시 비조정지역 여부와 취득 당시 조정지역 여부를 확인해 주세요.');
      const ad=new Date(acquired),sd=new Date(sold),years=sd.getUTCFullYear()-ad.getUTCFullYear()-((sold.slice(5)<acquired.slice(5))?1:0);
      if(years<2)throw new Error('주택은 2년 이상 보유한 일반 매매만 지원합니다.');
      confirm(r.housingOrdinaryConfirmed,name+' 주택 비과세·상속증여·이월과세·용도변경·조정 없음');
      transfers.push({property_id:id,taxpayer_id:taxpayer,property_type:'주택',acquisition_date:acquired,transfer_date:sold,transfer_price:sale,acquisition_price:cost,expenses_total:expense,housing_count:count,is_regulated_area:false,regulated_at_acquisition:r.acqRegulated==='yes',ordinary_sale_confirmed:true});
    }
    if(mixed&&r.type!=='주택')transfers.push({property_id:id,taxpayer_id:taxpayer,property_type:r.type,acquisition_date:acquired,transfer_date:sold,transfer_price:sale,acquisition_price:cost,expenses_total:expense,housing_count:null,is_regulated_area:false,regulated_at_acquisition:null,ordinary_sale_confirmed:true});
    if(mixed)Object.assign(transfers[transfers.length-1],{business_land:r.type==='토지'?true:null,tax_adjusted_cost_confirmed:true});
    if(mixed&&r.ownership==='share') {
      confirm(r.shareBasisConfirmed,name+' 전체금액·단일취득·비례귀속·지분별 경비 없음·소유지분 내 1회 양도');
      const numerator=money(r.shareNumerator,name+' 지분 분자'),denominator=money(r.shareDenominator,name+' 지분 분모');
      if(numerator<1||denominator<1||numerator>denominator||denominator>1e9)throw new Error('지분은 1~10억 정수이고 분자는 분모 이하여야 합니다.');
      for(const amount of [sale,cost,expense])if(BigInt(amount)*BigInt(numerator)%BigInt(denominator)!==0n)throw new Error('지분 귀속액에 원 미만 금액이 생기는 사례는 지원하지 않습니다.');
      transfers[transfers.length-1].share_context={numerator,denominator,...Object.fromEntries(['common_whole_property_basis_confirmed', 'single_acquisition_basis_confirmed', 'no_share_specific_expenses_confirmed', 'actual_attribution_matches_share_confirmed', 'within_owned_share_confirmed', 'single_disposal_per_property_confirmed'].map(k=>[k,true]))};
    }
    facts.assets.push({asset_ref:id,source_id:proof,property_type:r.type,whole_property_confirmed:true});
    facts.events.push({kind:'seller_acquisition',asset_ref:id,party_ref:taxpayer,occurred_on:acquired,source_id:proof},{kind:'seller_sale',asset_ref:id,party_ref:taxpayer,occurred_on:sold,source_id:proof});
    facts.amounts.push({asset_ref:id,purpose:'tax_adjusted_acquisition_cost',scope:'whole_property',amount_krw:cost,as_of:acquired,source_id:proof},{asset_ref:id,purpose:'sale_consideration',scope:'whole_property',amount_krw:sale,as_of:sold,source_id:proof});
    facts.expenses.push({asset_ref:id,payer_ref:taxpayer,kind:'deductible_sale_expenses',scope:'whole_property',amount_krw:expense,event_kind:'seller_sale',source_id:proof});
    reviews.push({asset_ref:id,source_id:proof,facts:{domestic_registered_full_ownership:true,ordinary_purchase_sale:true,nonresidential_only:true,business_land:r.type==='토지'?true:null,tax_adjusted_acquisition_cost:true,no_other_adjustments:true,no_special_exemption_relief_deferral:true,no_nonbusiness_or_designated_surcharge:true}});
  }
  confirm(d.assessmentsConfirmed,'예정신고 산출세액 전부 포함');confirm(d.noCorrectionConfirmed,'결정·경정·수시부과 없음');confirm(d.noOtherCreditsConfirmed,'다른 세액공제·조정 없음');confirm(d.paymentsConfirmed,'해당 예정신고에 대한 실제 납부액');confirm(d.noOffsetsConfirmed,'환급·충당·기타 납부 없음');
  const national=money(d.nationalAssessed,'국세 기신고 산출세액'),local=money(d.localAssessed,'지방세 기신고 산출세액'),np=money(d.nationalPaid,'국세 실제 납부액'),lp=money(d.localPaid,'지방세 실제 납부액');
  if(np>national||lp>local)throw new Error('실제 납부액이 입력한 기신고 산출세액을 넘습니다. 초과납부·충당 등은 별도 검토가 필요합니다.');
  return {annual_request:(housing||mixed)?{schema_version:mixed?'transfer-annual-public/5':'transfer-annual-public/1',source_id:source,asset_source_ids:Object.fromEntries(d.assets.map(r=>[r.ref.trim(),r.source.trim()])),year,taxpayer_id:taxpayer,resident_confirmed:true,scope_confirmed:true,local_standard_rate_confirmed:true,transfers}:{schema_version:'transfer-annual-public/2',ai_consultation:true,common_facts:facts,consultation_context:{source_id:source,year,taxpayer_ref:taxpayer,all_annual_subject_transfers_included:true,annual_scope_source_id:source,local_standard_rate_confirmed:true,local_rate_source_id:source,asset_reviews:reviews}},settlement_context:{schema_version:'transfer-annual-prior-assessed/1',source_id:source,taxpayer_id:taxpayer,year,national_prior_assessed_tax_krw:national,local_prior_assessed_tax_krw:local,national_source_id:ref(d.nationalAssessmentSource,'국세 신고서 자료명'),local_source_id:ref(d.localAssessmentSource,'지방세 신고서 자료명'),all_preliminary_return_assessments_included_confirmed:true,no_determination_correction_or_casual_assessment_confirmed:true,no_other_tax_credits_or_adjustments_confirmed:true},payment_context:{taxpayer_id:taxpayer,year,national_paid_krw:np,local_paid_krw:lp,national_source_id:ref(d.nationalPaymentSource,'국세 납부 자료명'),local_source_id:ref(d.localPaymentSource,'지방세 납부 자료명'),payments_against_listed_preliminary_assessments_only_confirmed:true,no_refunds_offsets_or_other_payments_confirmed:true}};
}

function annualDirectValid(c) {
  const num=v=>Number.isSafeInteger(v)&&v>=0;
  if(!c||c['상태']!=='ok'||c['오류']||c['납부대사']?.status!=='ok'||c['원본연간계산']?.['상태']!=='ok')return false;
  for(const key of ['연간본세','확정신고산식상잔액'])if(!['national','local','total'].every(k=>num(c[key]?.[k])))return false;
  if(!['national','local'].every(k=>num(c['선행예정신고산출세액']?.[k])))return false;
  if(!num(c['납부대사'].total_remaining_principal))return false;
  for(const k of ['national','local']) {
    const row=c['납부대사'][k];
    if(!['prior_assessed','actual_paid','prior_unpaid','additional_return_due','remaining_principal'].every(f=>num(row?.[f])))return false;
    if(row.prior_assessed!==c['선행예정신고산출세액'][k]||row.additional_return_due!==c['확정신고산식상잔액'][k]||row.prior_assessed-row.actual_paid!==row.prior_unpaid||row.remaining_principal!==row.prior_unpaid+row.additional_return_due||c['연간본세'][k]!==row.prior_assessed+row.additional_return_due)return false;
  }
  return ['연간본세','확정신고산식상잔액'].every(key=>c[key].total===c[key].national+c[key].local)&&c['납부대사'].total_remaining_principal===c['납부대사'].national.remaining_principal+c['납부대사'].local.remaining_principal;
}

function JTTransferAnnualDirect({onBack}) {
  const blank=id=>({_id:id,type:'토지',ref:'',source:'',acquired:'',sold:'',sale:'',cost:'',expense:''});
  const [d,setD]=React.useState(()=>({year:'2026',assets:[blank(1),blank(2)]}));
  const [result,setResult]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const seq=React.useRef(0),control=React.useRef(null),nextId=React.useRef(3);
  React.useEffect(()=>()=>{seq.current++;control.current?.abort();},[]);
  const invalidate=()=>{seq.current++;control.current?.abort();setResult(null);setError('');setBusy(false);};
  const resetChecks=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k.endsWith('Confirmed')?false:v]));
  const change=(key,v)=>{invalidate();setD(old=>key.endsWith('Confirmed')?{...old,[key]:v}:{...resetChecks(old),[key]:v,assets:(key==='assets'?v:old.assets).map(resetChecks)});};
  const edit=(id,key,v)=>{invalidate();setD(old=>({...resetChecks(old),assets:old.assets.map(r=>r._id===id?{...(key.endsWith('Confirmed')?r:resetChecks(r)),[key]:v}:r)}));};
  const field=(key,label,type='text')=><label style={{display:'block',margin:'10px 0'}}>{label}<input data-testid={'annual-direct-'+key} className="jt-report-q__input" type={type} value={d[key]??''} onChange={e=>change(key,e.target.value)}/></label>;
  const check=(key,label)=><label style={{display:'block',margin:'10px 0'}}><input data-testid={'annual-direct-'+key} type="checkbox" checked={d[key]===true} onChange={e=>change(key,e.target.checked)}/> {label}</label>;
  const submit=async e=>{
    e.preventDefault();if(busy)return;setResult(null);setError('');let body;
    try{body=annualDirectRequest(d);}catch(e){setError(e.message);return;}
    const current=++seq.current;control.current?.abort();const abort=new AbortController();control.current=abort;setBusy(true);const timer=setTimeout(()=>abort.abort(),45000);
    try {
      const base=(window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'');
      const r=await fetch(base+'/v1/calc/transfer-annual-prior-assessed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
      const j=await r.json();if(current!==seq.current)return;
      if(!r.ok)throw new Error('입력 형식 또는 연결 상태를 확인해 주세요.');
      if(!annualDirectValid(j.calc))throw new Error(window.jtEngineMessageForDisplay(j.calc?.['오류']||'정산 결과를 확인할 수 없습니다. 지원 범위와 입력 자료를 확인해 주세요.'));
      setResult(j.calc);
    } catch(e){if(current===seq.current)setError(e.name==='AbortError'?'계산 응답 시간이 초과됐습니다. 다시 계산해 주세요.':e.message);}finally{clearTimeout(timer);if(current===seq.current)setBusy(false);}
  };
  const won=v=>v.toLocaleString('ko-KR')+'원';
  return <div className="jt-container"><JTReportShell title="양도세 연간 합산·정산" subtitle="여러 양도와 기신고·실제 납부 내역" onBack={onBack} tag="CONSULTING">
    <p>2026년 국내 거주자의 일반 토지·상가·비조정지역 주택을 같은 연도로 묶은 2~20건을 지원합니다. 주택은 매 양도 시 2주택 이상·2년 이상 보유한 일반 매매만 가능합니다. 토지·상가 지분은 전체 금액과 실제 귀속액의 비례 관계를 확인한 경우 지원합니다. 1주택 비과세·특례·중과·주택 지분·분할취득은 지원하지 않습니다. 혼합 거래의 원 미만 장기보유공제는 중간 절사 근거 확인 전까지 차단합니다. 다만 장기보유공제 전 순차익부터 연간 기본공제 이내이면 과세표준·본세 0원만 확인하고, 미확정 중간값은 표시하지 않습니다. 자료명은 확인한 신고서·계약서·납부영수증의 식별명이며, 자동 증빙 인증을 뜻하지 않습니다.</p>
    <form onSubmit={submit}>{field('year','귀속연도')}{field('taxpayer','납세자 식별명 (주민등록번호 입력 금지)')}{field('source','연간 거래·자격·지방세율 검토 자료명')}
    {d.assets.map((r,index)=><fieldset key={r._id}><legend>{index+1}번 양도</legend>
      <label>재산 종류<select data-testid={'annual-asset-'+r._id+'-type'} value={r.type} onChange={e=>edit(r._id,'type',e.target.value)}><option>토지</option><option>상가</option><option>주택</option></select></label>
      {[['ref','다른 재산과 구별되는 식별명','text'],['source','계약서·원가·경비·자격 증빙 자료명','text'],['acquired','취득일','date'],['sold','양도일','date'],['sale','양도가액 (원)','text'],['cost','세무조정 완료 취득가액 (원)','text'],['expense','공제 가능한 필요경비 (원, 없으면 0)','text']].map(([key,label,type])=><label key={key} style={{display:'block',margin:'8px 0'}}>{label}<input data-testid={'annual-asset-'+r._id+'-'+key} className="jt-report-q__input" type={type} value={r[key]??''} onChange={e=>edit(r._id,key,e.target.value)}/></label>)}
      {r.type!=='주택'&&<div><label>금액 입력 범위<select data-testid={'annual-asset-'+r._id+'-ownership'} value={r.ownership||'whole'} onChange={e=>edit(r._id,'ownership',e.target.value)}><option value="whole">전체 소유·전체 양도</option><option value="share">지분 양도 (주택 포함 혼합 합산)</option></select></label>
      {r.ownership==='share'&&<><p>위 양도가액·취득가액·경비는 모두 동일한 전체 재산 기준 금액을 입력하세요. 엔진에서 양도 지분을 한 번 적용합니다.</p>
      {['shareNumerator','shareDenominator'].map((key,i)=><label key={key}>{i===0?'양도 지분 분자':'양도 지분 분모'}<input data-testid={'annual-asset-'+r._id+'-'+key} value={r[key]??''} onChange={e=>edit(r._id,key,e.target.value)}/></label>)}
      <label><input type="checkbox" data-testid={'annual-asset-'+r._id+'-shareBasisConfirmed'} checked={r.shareBasisConfirmed===true} onChange={e=>edit(r._id,'shareBasisConfirmed',e.target.checked)}/>동일한 전체 재산 기준 금액·단일 취득이며, 실제 귀속액이 지분에 비례하고 별도 지분 경비가 없으며, 소유지분 내에서 해당 재산을 한 번만 양도했습니다.</label></> }</div>}
      {r.type==='주택'&&<div>
        <label>이 양도 당시 세대 주택 수<input data-testid={'annual-asset-'+r._id+'-housingCount'} value={r.housingCount??''} onChange={e=>edit(r._id,'housingCount',e.target.value)}/></label>
        {[['regulated','양도 당시 조정대상지역'],['acqRegulated','취득 당시 조정대상지역']].map(([key,label])=><label key={key}>{label}<select data-testid={'annual-asset-'+r._id+'-'+key} value={r[key]??''} onChange={e=>edit(r._id,key,e.target.value)}><option value="">확인 필요</option><option value="no">아니오</option><option value="yes">예</option></select></label>)}
        <label><input type="checkbox" data-testid={'annual-asset-'+r._id+'-housingOrdinaryConfirmed'} checked={r.housingOrdinaryConfirmed===true} onChange={e=>edit(r._id,'housingOrdinaryConfirmed',e.target.checked)}/>비과세·감면·상속·증여·이월과세·용도변경·환산취득·감가상각 조정이 없는 주택 일반 매매입니다.</label>
      </div>}
      {[['ordinaryConfirmed',r.ownership==='share'?'국내 등기 재산의 지분 일반 매매입니다.':'국내 등기 재산 전체지분의 일반 매매입니다.'],['adjustedConfirmed','취득가 세무조정과 공제 가능 경비를 확인했고 추가 조정이 없습니다.'],['noSpecialConfirmed','비과세·감면·이월과세·특례·비사업용 및 지정지역 중과가 없습니다.'],...(r.type==='토지'?[['businessConfirmed','사업용 토지임을 확인했습니다.']]:[])].map(([key,label])=><label key={key} style={{display:'block'}}><input data-testid={'annual-asset-'+r._id+'-'+key} type="checkbox" checked={r[key]===true} onChange={e=>edit(r._id,key,e.target.checked)}/> {label}</label>)}
      <button type="button" disabled={d.assets.length<=2} onClick={()=>change('assets',d.assets.filter(x=>x._id!==r._id))}>이 양도 삭제</button>
    </fieldset>)}
    <button type="button" disabled={d.assets.length>=20} onClick={()=>change('assets',[...d.assets,blank(nextId.current++)])}>양도 추가</button>
    {check('residentConfirmed','동일한 국내 거주 개인의 거래입니다.')}{check('scopeConfirmed','해당 연도 합산 대상 거래를 누락·중복 없이 모두 넣었습니다.')}{check('localConfirmed','지방소득세는 조례 가감 없는 표준세율 대상입니다.')}
    <h3>기신고 산출세액과 실제 납부액</h3><p>국세·지방세를 각각 입력하세요. 실제 납부액을 산출세액 칸에 넣지 마세요. 해당 내역이 없으면 금액에 0을 입력하고 자료명에 ‘신고 없음’ 또는 ‘납부 없음’을 명시하세요.</p>
    {field('nationalAssessed','예정신고 국세 산출세액 합계 (원)')}{field('nationalAssessmentSource','국세 신고서 자료명')}{field('localAssessed','예정신고 지방세 산출세액 합계 (원)')}{field('localAssessmentSource','지방세 신고서 자료명')}
    {field('nationalPaid','위 국세 중 실제 납부액 (원)')}{field('nationalPaymentSource','국세 납부영수증 자료명')}{field('localPaid','위 지방세 중 실제 납부액 (원)')}{field('localPaymentSource','지방세 납부영수증 자료명')}
    {check('assessmentsConfirmed','예정신고 산출세액 내역을 빠짐없이 포함했습니다.')}{check('noCorrectionConfirmed','결정·경정·수시부과 내역이 없습니다.')}{check('noOtherCreditsConfirmed','다른 세액공제·조정 내역이 없습니다.')}{check('paymentsConfirmed','입력한 실제 납부액은 위 예정신고분에만 대응합니다.')}{check('noOffsetsConfirmed','환급·충당·기타 납부 내역이 없습니다.')}
    <p>입력을 바꾸면 기존 결과와 관련 확인을 해제합니다. 자료를 다시 확인한 뒤 재계산하세요.</p><button type="submit" className="jt-btn jt-btn--primary" disabled={busy}>{busy?'계산 중…':'연간 합산·정산 계산'}</button></form>
    {error&&<p role="alert">{error}</p>}
    {result&&<section data-testid="annual-direct-result"><h3>연간 본세와 남은 납부액</h3><table className="jt-report-calc"><thead><tr><th>구분</th><th>국세</th><th>지방세</th></tr></thead><tbody>
      <tr><th>연간 본세</th>{['national','local'].map(k=><td key={k}>{won(result['연간본세'][k])}</td>)}</tr>
      {[['prior_assessed','기신고 산출세액'],['actual_paid','실제 납부액'],['prior_unpaid','기존 신고분 미납 본세'],['additional_return_due','확정신고 추가 납부 본세'],['remaining_principal','미납분 포함 남은 본세']].map(([key,label])=><tr key={key}><th>{label}</th>{['national','local'].map(k=><td key={k}>{won(result['납부대사'][k][key])}</td>)}</tr>)}
    </tbody></table><p>남은 본세 합계: <strong>{won(result['납부대사'].total_remaining_principal)}</strong></p><p>{result['납부대사'].notice}</p>
    {(result['원본연간계산']['경고사항']||[]).map((s,i)=><p key={i}>{s}</p>)}
    {(result['원본연간계산']['원본결과']?.share_normalizations||[]).map(r=><p key={r.property_id}>재산 {r.property_id} 양도 지분 {r.numerator}/{r.denominator}: 귀속 양도가액 {won(r.attributed.transfer_price)}, 취득가액 {won(r.attributed.acquisition_price)}, 필요경비 {won(r.attributed.expenses_total)}</p>)}
    <h3>연간 계산 과정</h3><table className="jt-report-calc"><tbody>{(result['원본연간계산']['단계별계산']||[]).map((s,i)=><tr key={i}><th>{s['항목']||s['단계']}</th><td>{typeof s['금액']==='number'?won(s['금액']):String(s['금액']??'')}</td></tr>)}</tbody></table></section>}
  </JTReportShell></div>;
}
window.JTTransferAnnualDirect=JTTransferAnnualDirect;
