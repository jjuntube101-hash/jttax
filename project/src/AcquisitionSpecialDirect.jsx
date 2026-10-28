/* Confirmed acquisition facts; the server alone calculates tax. */
const ACQ_SPECIAL_KINDS=[['corporate_heavy','법인 중과'],['floor_allocation','층별·용도별 안분'],['majority_shareholder','과점주주'],['reviewed_reduction','검토된 정률 감면']];
const ACQ_SPECIAL_CHECKS={
 corporate_heavy:[['eligibility_confirmed','선택한 중과 사유의 요건을 검토했습니다'],['exceptions_reviewed_confirmed','권역·시기·업종 등 중과 제외 요건을 검토했습니다'],['price_confirmed','포함·제외 비용을 반영한 취득가격입니다'],['no_reduction_confirmed','다른 감면을 중복 적용하지 않습니다']],
 floor_allocation:[['price_confirmed','전체 취득가격의 포함·제외 비용을 확인했습니다'],['whole_interest_confirmed','동일 취득 사건의 전체 지분입니다'],['allocation_confirmed','층별 원자료와 법정 안분기준을 검토했습니다']],
 majority_shareholder:[['history_complete_confirmed','설립 이후 과점주주 이력을 빠짐없이 검토했습니다'],['fixed_group_confirmed','전후 동일한 특수관계인 집단입니다'],['voting_rights_exercised_confirmed','주주권 행사 등 실질적 권리 요건을 확인했습니다'],['no_treasury_or_nonvoting_shares_confirmed','자기주식·의결권 없는 주식이 없습니다'],['unlisted_corporation_confirmed','비상장법인입니다'],['stock_acquisition_confirmed','실제 주식 취득 사건입니다']],
 reviewed_reduction:[['eligibility_confirmed','기준일의 해당 조문·항·호 감면 요건을 검토했습니다'],['no_heavy_or_special_rates_confirmed','중과·특례세율과 혼합하지 않습니다'],['price_confirmed','포함·제외 비용을 반영한 취득가격입니다'],['minimum_review_confirmed','최소납부·제외 조문·부칙을 검토했습니다'],['aggregation_complete_confirmed','연부취득·동일 소유자·연접 취득 등의 합산 범위를 확인했습니다']]
};
function acquisitionSpecialRequest(d){
 const text=(v,label)=>{v=String(v??'').trim();if(!v||v.length>2000)throw Error(label+'을 입력해 주세요.');return v;};
 const number=(v,label,zero=false)=>{if(!/^\d+$/.test(String(v??'')))throw Error(label+'은 원 또는 수량의 정수로 입력해 주세요.');const n=Number(v);if(!Number.isSafeInteger(n)||n<(zero?0:1))throw Error(label+'의 금액·수량을 확인해 주세요.');return n;};
 const decimal=(v,label)=>{if(!/^\d+(?:\.\d+)?$/.test(String(v??''))||!Number.isFinite(Number(v))||Number(v)<=0)throw Error(label+'을 유효한 양수로 입력해 주세요.');return Number(v);};
 const yesNo=(v,label)=>{if(v!=='yes'&&v!=='no')throw Error(label+'을 확인해 주세요.');return v==='yes';};
 const date=(v,label)=>{if(!/^2026-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v>'2026-10-28')throw Error(label+'은 검증 범위인 2026-01-01~2026-10-28의 실제 날짜로 입력해 주세요.');return v;};
 const pick=(v,values,label)=>{if(!values.includes(v))throw Error(label+'을 선택해 주세요.');return v;};
 const check=(k,label)=>{if(d.checks?.[k]!==true)throw Error(label+' 확인이 필요합니다.');return true;};
 const kind=pick(d.kind,ACQ_SPECIAL_KINDS.map(x=>x[0]),'계산 종류');
 const f={schema_version:'acquisition-special/1',kind,acquisition_date:date(d.date,'취득일'),
  scope_confirmed:check('scope_confirmed','해당 계산 범위'),evidence:text(d.evidence,'전체 검토 자료명')};
 for(const [key,label] of ACQ_SPECIAL_CHECKS[kind])f[key]=check(key,label);
 const origin=()=>pick(d.origin,['유상취득','원시취득'],'취득 원인');
 const prop=()=>pick(d.propertyType,['토지','건물'],'비주택 물건 종류');
 if(kind==='corporate_heavy')Object.assign(f,{property_value:number(d.value,'취득가격'),property_type:prop(),acquisition_type:origin(),
  capital_ground:pick(d.capitalGround,['none','head_office_new_or_extension','factory_new_or_extension'],'본점·공장 중과 사유'),metropolitan_heavy:yesNo(d.metro,'대도시 중과 여부'),
  luxury:yesNo(d.luxury,'사치성 재산 여부'),ground_evidence:text(d.groundEvidence,'중과 요건 검토 자료명')});
 if(kind==='reviewed_reduction')Object.assign(f,{property_value:number(d.value,'취득가격'),property_type:prop(),acquisition_type:origin(),
  relief_law:'지방세특례제한법',relief_article:{article:number(d.article,'감면 조 번호'),branch:number(d.branch,'가지 조 번호',true),paragraph:number(d.paragraph,'항 번호',true),item:number(d.item,'호 번호',true)},
  reduction_ratio:{numerator:number(d.reliefPercent,'감면율',true),denominator:100},eligibility_as_of:date(d.eligibilityDate,'감면 자격 확인 기준일'),
  eligibility_evidence:text(d.eligibilityEvidence,'감면 자격 근거'),minimum_review_evidence:text(d.minimumEvidence,'최소납부 검토 근거'),
  aggregation_gross_tax:number(d.aggregationTax,'법정 합산 범위의 감면 전 취득세',true),aggregation_evidence:text(d.aggregationEvidence,'합산 범위 검토 근거'),
  rural_base_exempt:yesNo(d.ruralBaseExempt,'본세분 농특세 비과세 여부'),rural_reduction_exempt:yesNo(d.ruralReductionExempt,'감면분 농특세 비과세 여부'),
  rural_base_evidence:text(d.ruralBaseEvidence,'본세분 농특세 근거'),rural_reduction_evidence:text(d.ruralReductionEvidence,'감면분 농특세 근거')});
 if(kind==='majority_shareholder'){
  Object.assign(f,{total_shares_before:number(d.totalBefore,'취득 전 발행주식총수',true),total_shares_after:number(d.totalAfter,'취득 후 발행주식총수'),
   had_prior_majority:yesNo(d.hadPrior,'과거 과점주주 이력'),acquisition_route:pick(d.route,['transfer','capital_increase','formation_issuance'],'취득 경로'),
   shareholders:(d.shareholders||[]).map((row,i)=>({id:text(row.id,'주주 이름 '+(i+1)),before_shares:number(row.before,'취득 전 주식수',true),after_shares:number(row.after,'취득 후 주식수',true),
    in_group:yesNo(row.inGroup,'동일 집단 포함 여부'),evidence:text(row.evidence,'주주명부 근거')})),
   assets:(d.assets||[]).map(row=>({id:text(row.id,'재산 이름'),property_type:pick(row.type,['토지','건물'],'재산 종류'),net_book_value:number(row.value,'재산 장부가액',true),
    jurisdiction:text(row.region,'재산 소재지'),evidence:text(row.evidence,'재산 장부 근거')}))});
  if(f.had_prior_majority){f.prior_highest_ratio={numerator:number(d.highNumerator,'과거 최고 지분 분자',true),denominator:number(d.highDenominator,'과거 최고 지분 분모')};
   f.prior_highest_date=text(d.highDate,'최고 지분 기준일');if(!/^\d{4}-\d{2}-\d{2}$/.test(f.prior_highest_date)||!Number.isFinite(Date.parse(f.prior_highest_date))||new Date(f.prior_highest_date).toISOString().slice(0,10)!==f.prior_highest_date)throw Error('최고 지분 기준일을 확인해 주세요.');
   if(String(d.previousNumerator??'')!==''||String(d.previousDenominator??'')!=='')f.previous_majority_ratio={numerator:number(d.previousNumerator,'종전 과점 당시 지분 분자',true),denominator:number(d.previousDenominator,'종전 과점 당시 지분 분모')};}
 }
 if(kind==='floor_allocation'){
  const basis=pick(d.basis,['separate_prices','standard_ratio','area_ratio'],'안분 기준');
  const field={separate_prices:'value',standard_ratio:'standard_value',area_ratio:'gross_area'}[basis];
  Object.assign(f,{total_value:number(d.value,'전체 취득가격'),is_corporate:false,acquisition_type:origin(),allocation_basis:basis,
   allocation_evidence:text(d.allocationEvidence,'안분 원자료 근거'),
   tax_groups:(d.groups||[]).map(row=>{const type=pick(row.use,['nonhousing','luxury','housing'],'과세 묶음 용도');
    const tax_facts=type==='housing'?{housing_count:number(row.houses,'취득 후 세대 주택수'),is_regulated_area:yesNo(row.regulated,'조정지역 여부'),exclusive_area:decimal(row.area,'해당 주택 전체 전용면적')}:type==='luxury'?{is_luxury:true}:{};
    return {id:text(row.id,'과세 묶음 이름'),use:type==='housing'?'housing':'nonhousing',whole_tax_unit_confirmed:check('group:'+row.id,'과세 묶음 전체 범위'),evidence:text(row.evidence,'과세 묶음 근거'),tax_facts};}),
   rows:(d.floors||[]).map(row=>({id:text(row.id,'층 이름'),tax_group_id:text(row.group,'과세 묶음 이름'),[field]:basis==='area_ratio'?text(row.weight,'층별 총면적'):number(row.weight,'층별 가격·시가표준액'),evidence:text(row.evidence,'층별 원자료')}))});
  check('floor_personal','개인·비농지·특수관계 및 조례 변동 없는 전체 취득');
 }
 if(kind==='reviewed_reduction'&&f.reduction_ratio.numerator>100)throw Error('감면율은 0~100%로 입력해 주세요.');
 return {special_facts:f};
}
function acquisitionSpecialResult(calc){
 if(!calc||calc['상태']!=='ok')throw Error(calc?.['오류']||'추가 사실이나 적용 범위를 확인해 주세요. 금액을 확정하지 않았습니다.');
 const keys=['과세표준','취득세','지방교육세','농어촌특별세','세액'];
 for(const key of keys)if(!Number.isSafeInteger(calc[key])||calc[key]<0)throw Error('계산 응답의 금액을 확인할 수 없습니다.');
 if(calc['취득세']+calc['지방교육세']+calc['농어촌특별세']!==calc['세액'])throw Error('세목별 금액 합계를 확인할 수 없습니다.');
 return calc;
}
function JTAcquisitionSpecialDirect({onBack,initialDraft}){
 const [d,setD]=React.useState(()=>({...initialDraft,kind:initialDraft?.kind||'corporate_heavy',checks:{},
  shareholders:initialDraft?.shareholders||[{},{}],assets:initialDraft?.assets||[{}],groups:initialDraft?.groups||[{}],floors:initialDraft?.floors||[{},{}]}));
 const [result,setResult]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const sequence=React.useRef(0),pending=React.useRef(null);
 React.useEffect(()=>()=>{sequence.current++;pending.current?.abort();},[]);
 const invalidate=()=>{sequence.current++;pending.current?.abort();setBusy(false);setResult(null);setError('');};
 const edit=(key,value)=>{invalidate();setD(old=>({...old,[key]:value,checks:{}}));};
 const checked=(key,value)=>{invalidate();setD(old=>({...old,checks:{...old.checks,[key]:value}}));};
 const rowEdit=(list,index,key,value)=>edit(list,d[list].map((row,i)=>i===index?{...row,[key]:value}:row));
 const field=(key,label,type='text',placeholder='')=><label className="jt-special-field" key={key}>{label}<input type={type} data-testid={'acq-special-'+key} value={d[key]??''} placeholder={placeholder} onChange={e=>edit(key,e.target.value)}/></label>;
 const select=(key,label,options)=><label className="jt-special-field" key={key}>{label}<select data-testid={'acq-special-'+key} value={d[key]??''} onChange={e=>edit(key,e.target.value)}><option value="">미확인 · 선택해 주세요</option>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>;
 const yn=[['yes','예'],['no','아니오']];
 const confirmation=(key,label)=><label className="jt-special-check" key={key}><input type="checkbox" data-testid={'acq-special-check-'+key} checked={d.checks[key]===true} onChange={e=>checked(key,e.target.checked)}/>{label}</label>;
 const rows=(list,label,columns)=><fieldset className="jt-special-rows"><legend>{label}</legend>{d[list].map((row,i)=><div className="jt-special-row" key={i}><span>{i+1}</span>{columns.filter(([key])=>list!=='groups'||row.use==='housing'||!['houses','regulated','area'].includes(key)).map(([key,title,options])=><label key={key}>{title}{Array.isArray(options)?<select value={row[key]??''} data-testid={'acq-special-'+list+'-'+i+'-'+key} onChange={e=>rowEdit(list,i,key,e.target.value)}><option value="">선택해 주세요</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:<input value={row[key]??''} inputMode={options==='number'?'decimal':undefined} data-testid={'acq-special-'+list+'-'+i+'-'+key} onChange={e=>rowEdit(list,i,key,e.target.value)}/>}</label>)}<button type="button" aria-label={label+' '+(i+1)+'행 삭제'} onClick={()=>edit(list,d[list].filter((_,j)=>j!==i))}>행 삭제</button></div>)}<button type="button" onClick={()=>edit(list,[...d[list],{}])} disabled={d[list].length>=100}>행 추가</button></fieldset>;
 async function submit(e){e.preventDefault();let body;try{body=acquisitionSpecialRequest(d);}catch(err){setError(err.message);setResult(null);return;}
  invalidate();const id=++sequence.current,controller=new AbortController();pending.current=controller;const timeout=setTimeout(()=>controller.abort(),30000);setBusy(true);
  try{if(!window.JT_ENGINE_BASE)throw Error('계산 서버 주소가 설정되지 않았습니다.');const response=await fetch(window.JT_ENGINE_BASE.replace(/\/$/,'')+'/v1/calc/acquisition',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   const data=await response.json();if(id!==sequence.current)return;if(!response.ok)throw Error('입력 형식 또는 연결 상태를 확인해 주세요.');setResult(acquisitionSpecialResult(data.calc));
  }catch(err){if(id===sequence.current)setError(err.name==='AbortError'?'계산 요청 시간이 초과되었습니다. 다시 시도해 주세요.':err.message);}
  finally{clearTimeout(timeout);if(id===sequence.current){pending.current=null;setBusy(false);}}
 }
 const origin=select('origin','취득 원인',[['유상취득','유상취득'],['원시취득','원시취득']]);
 return <div className="jt-container"><JTReportShell title="취득세 세부 사실 계산" subtitle="기준일·과세단위·검토 근거를 확인한 계산" tag="CONSULTING" onBack={()=>onBack({...d,checks:{}})}>
  <p>2026년 10월 28일까지 확인한 법령 범위입니다. 자료명은 입력자가 검토한 근거이며, 자동으로 인증한 자료가 아닙니다. 모르는 사실은 확인 후 입력해 주세요.</p>
  <form onSubmit={submit}><div className="jt-special-grid">{select('kind','계산 종류',ACQ_SPECIAL_KINDS)}{field('date','실제 취득일','date')}{field('evidence','전체 검토 자료명')}</div>
  {['corporate_heavy','reviewed_reduction','floor_allocation'].includes(d.kind)&&<div className="jt-special-grid">{field('value','전체 취득가격 (원)','text','예: 100000000')}{origin}{d.kind!=='floor_allocation'&&select('propertyType','비주택 물건 종류',[['토지','비농지 토지'],['건물','비주택 건물']])}</div>}
  {d.kind==='corporate_heavy'&&<div className="jt-special-grid">{select('capitalGround','본점·공장 중과 사유',[['none','해당 없음'],['head_office_new_or_extension','본점·주사무소 신증축'],['factory_new_or_extension','공장 신증설']])}{select('metro','대도시 법인 중과 대상인가요?',yn)}{select('luxury','사치성 재산인가요?',yn)}{field('groundEvidence','권역·시기·시설·업종 예외 검토 근거')}</div>}
  {d.kind==='reviewed_reduction'&&<><p>지방세특례제한법의 정률 감면입니다. 없는 가지 조·항·호는 0을 입력하고, 최소납부 합산 범위와 농특세 두 부분을 각각 확인하세요.</p><div className="jt-special-grid">{[['article','감면 조 번호'],['branch','가지 조 번호'],['paragraph','항 번호'],['item','호 번호'],['reliefPercent','법정 감면율 (%)'],['eligibilityDate','감면 자격 기준일','date'],['eligibilityEvidence','감면 자격 검토 근거'],['minimumEvidence','최소납부·부칙 검토 근거'],['aggregationTax','합산 범위 감면 전 취득세 (원)'],['aggregationEvidence','법정 합산 범위 근거'],['ruralBaseEvidence','본세분 농특세 근거'],['ruralReductionEvidence','감면분 농특세 근거']].map(([k,l,t])=>field(k,l,t||'text'))}{select('ruralBaseExempt','본세분 농특세가 비과세인가요?',yn)}{select('ruralReductionExempt','감면분 농특세가 비과세인가요?',yn)}</div></>}
  {d.kind==='majority_shareholder'&&<><div className="jt-special-grid">{field('totalBefore','취득 전 발행주식총수')}{field('totalAfter','취득 후 발행주식총수')}{select('hadPrior','과거 과점주주였던 이력이 있나요?',yn)}{select('route','주식 취득 경로',[['transfer','주식 양수'],['capital_increase','증자'],['formation_issuance','설립 시 발행']])}</div>
   {d.hadPrior==='yes'&&<div className="jt-special-grid">{[['highNumerator','과거 최고 지분 분자'],['highDenominator','과거 최고 지분 분모'],['highDate','과거 최고 지분 기준일','date'],['previousNumerator','재진입 전 종전 과점 지분 분자 (해당 시)'],['previousDenominator','재진입 전 종전 과점 지분 분모 (해당 시)']].map(([k,l,t])=>field(k,l,t||'text'))}</div>}
   {rows('shareholders','전체 주주명부',[['id','주주 이름'],['before','전 주식수','number'],['after','후 주식수','number'],['inGroup','동일 집단 포함',yn],['evidence','주주명부 근거']])}
   {rows('assets','법인 취득세 대상 재산',[['id','재산 이름'],['type','재산 종류',[['토지','비농지 토지'],['건물','비주택 건물']]],['value','순장부가액 (원)','number'],['region','소재지'],['evidence','장부 근거']])}</>}
  {d.kind==='floor_allocation'&&<><p>개인의 비농지·전체 취득 중 일반 비주택·주택·사치성 재산을 구분합니다. 같은 주택 한 호의 여러 층은 같은 과세 묶음에 넣으세요. 주택 감면·법인 중과와 혼합한 묶음은 담당자 검토가 필요합니다.</p><div className="jt-special-grid">{select('basis','층별 안분 기준',[['separate_prices','층별로 구분된 실제가격'],['standard_ratio','시가표준액 비율'],['area_ratio','신축 면적 비율']])}{field('allocationEvidence','안분 원자료·법정 기준 검토 근거')}</div>
   {rows('groups','과세 묶음',[['id','묶음 이름'],['use','용도',[['nonhousing','일반 비주택'],['luxury','사치성 비주택'],['housing','주택']]],['houses','주택이면 세대 주택수','number'],['regulated','주택이면 조정지역',yn],['area','주택 전체 전용면적 (㎡)','number'],['evidence','묶음 전체 범위 근거']])}
   {rows('floors','층별 원자료',[['id','층 이름'],['group','과세 묶음 이름'],['weight',d.basis==='area_ratio'?'총면적 (㎡)':d.basis==='standard_ratio'?'시가표준액 (원)':'실제가격 (원)','number'],['evidence','층별 근거']])}
   {confirmation('floor_personal','개인·비농지·특수관계 및 조례 세율 변동 없는 전체 취득입니다')}{d.groups.map((row,i)=>confirmation('group:'+row.id,'과세 묶음 ‘'+(row.id||i+1)+'’의 전체 범위를 확인했습니다(동일 주택·부속토지 포함)'))}</>}
  <fieldset><legend>적용 범위 확인</legend>{confirmation('scope_confirmed','현재 선택한 계산 범위와 사실이 일치합니다')}{ACQ_SPECIAL_CHECKS[d.kind].map(([k,l])=>confirmation(k,l))}</fieldset>
  <p>금액·날짜·용도·원자료를 바꾸면 기존 결과와 확인 표시가 해제됩니다.</p><button type="submit" className="jt-btn jt-btn--primary" disabled={busy}>{busy?'계산 중…':'확인한 사실로 계산'}</button></form>
  {error&&<p role="alert" data-testid="acq-special-error">{error}</p>}{result&&<section aria-live="polite" data-testid="acq-special-result"><h3>확인한 사실의 계산 결과</h3><p>과세표준 {result['과세표준'].toLocaleString('ko-KR')}원</p><dl>{['취득세','지방교육세','농어촌특별세','세액'].map(k=><React.Fragment key={k}><dt>{k==='세액'?'합계':k}</dt><dd>{result[k].toLocaleString('ko-KR')}원</dd></React.Fragment>)}</dl>{result['경고사항']?.map((w,i)=><p key={i}>{w}</p>)}</section>}
 </JTReportShell></div>;
}
window.JTAcquisitionSpecialDirect=JTAcquisitionSpecialDirect;
