/* Confirmed acquisition facts; the server alone calculates tax. */
const ACQ_SPECIAL_KINDS=[['corporate_heavy','법인 중과'],['floor_allocation','층별·용도별 안분'],['majority_shareholder','과점주주'],['reviewed_reduction','검토된 정률 감면']];
const ACQ_SPECIAL_CHECKS={
 corporate_heavy:[['eligibility_confirmed','선택한 중과 사유의 요건을 검토했습니다'],['exceptions_reviewed_confirmed','권역·시기·업종 등 중과 제외 요건을 검토했습니다'],['price_confirmed','포함·제외 비용을 반영한 취득가격입니다'],['no_reduction_confirmed','다른 감면을 중복 적용하지 않습니다']],
 floor_allocation:[['price_confirmed','전체 취득가격의 포함·제외 비용을 확인했습니다'],['whole_interest_confirmed','동일 취득 사건의 전체 지분입니다'],['allocation_confirmed','층별 원자료와 법정 안분기준을 검토했습니다']],
 majority_shareholder:[['history_complete_confirmed','설립 이후 과점주주 이력을 빠짐없이 검토했습니다'],['fixed_group_confirmed','전후 동일한 특수관계인 집단입니다'],['voting_rights_exercised_confirmed','주주권 행사 등 실질적 권리 요건을 확인했습니다'],['no_treasury_or_nonvoting_shares_confirmed','자기주식·의결권 없는 주식이 없습니다'],['unlisted_corporation_confirmed','비상장법인입니다'],['stock_acquisition_confirmed','실제 주식 취득 사건입니다']],
 reviewed_reduction:[['eligibility_confirmed','기준일의 해당 조문·항·호 감면 요건을 검토했습니다'],['no_heavy_or_special_rates_confirmed','중과·특례세율과 혼합하지 않습니다'],['price_confirmed','포함·제외 비용을 반영한 취득가격입니다'],['minimum_review_confirmed','최소납부·제외 조문·부칙을 검토했습니다'],['aggregation_complete_confirmed','연부취득·동일 소유자·연접 취득 등의 합산 범위를 확인했습니다']]
};
const ACQ_MAJORITY_HISTORY_CHECKS=[['history_complete_confirmed','과세 판단에 필요한 전체 변동 이력을 원자료와 대조했습니다'],['ordinary_shares_only_confirmed','일반 보통주·자기주식만 있으며 다른 무의결권 종류주식·상호보유 제한이 없습니다'],['rights_reviewed_confirmed','실제 주주권·의결권과 해당 집단을 검토했습니다'],['unlisted_corporation_confirmed','비상장법인입니다'],['no_other_concurrent_event_confirmed','같은 날 다른 취득·소각·명의환원 등이 섞여 있지 않습니다'],['assets_complete_confirmed','전체 일반 과세재산과 장부순가액을 대조했습니다']];
const ACQ_MAJORITY_EVENTS=[['transfer','주식 양수'],['capital_increase','설립 후 증자'],['group_internal_transfer','동일 집단 내부 이전'],['formation_issuance','법인설립 시 발행주식'],['treasury_acquisition_only','집단 취득 없는 자기주식 매입'],['treasury_cancellation_only','자기주식 소각만 발생'],['relationship_change_only','주식수 변동 없는 관계변화만 발생']];
const ACQ_ORDERED_CHECKS=[...ACQ_MAJORITY_HISTORY_CHECKS.filter(([k])=>k!=='no_other_concurrent_event_confirmed'),['order_confirmed','독립된 법률행위의 실제 효력 순번·시각을 문서로 확인했습니다'],['assets_unchanged_within_day_confirmed','당일 사건 사이 과세재산 장부순가액 변동이 없습니다']];
function acquisitionSpecialChecks(d){return d.kind==='majority_shareholder'&&d.majorityMode==='ordered'?ACQ_ORDERED_CHECKS:d.kind==='majority_shareholder'&&['history','treasury_first'].includes(d.majorityMode)?[...ACQ_MAJORITY_HISTORY_CHECKS,...(d.majorityMode==='treasury_first'?[['lawful_treasury_transfer_confirmed','법인 자기주식의 단일 직접 양수와 유효한 법률효력을 확인했습니다']]:[])]:ACQ_SPECIAL_CHECKS[d.kind];}
function acquisitionMajorityHistoryFacts(d,f,helpers){
 const {text,number,yesNo,pick}=helpers;
 const iso=(value,label)=>{const v=text(value,label);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error(label+'을 실제 날짜로 입력해 주세요.');return v;};
 const event=d.majorityMode==='treasury_first'?'treasury_transfer_to_group':pick(d.historyEvent,ACQ_MAJORITY_EVENTS.map(x=>x[0]),'주식 사건 종류');
 Object.assign(f,{schema_version:'acquisition-special/2',event_type:event,formation_date:iso(d.formationDate,'법인설립일'),
  total_shares_before:number(d.totalBefore,'전 발행총수',true),total_shares_after:number(d.totalAfter,'후 발행총수'),
  same_group_confirmed:yesNo(d.sameGroup,'전후 동일 집단 여부'),stock_acquisition_confirmed:yesNo(d.actualAcquisition,'집단의 실제 주식취득 여부'),
  group_review_evidence:text(d.groupEvidence,'특수관계인 집단 검토 자료명'),
  shareholders:(d.shareholders||[]).map(row=>({id:text(row.id,'주주 이름'),before_shares:number(row.before,'전 주식수',true),after_shares:number(row.after,'후 주식수',true),
   in_group_before:yesNo(row.inGroup,'전 집단 소속'),in_group_after:event==='relationship_change_only'?yesNo(row.inGroupAfter,'후 집단 소속'):yesNo(row.inGroup,'동일 집단 소속'),
   is_treasury:yesNo(row.isTreasury,'발행법인 자기주식 여부'),evidence:text(row.evidence,'주주명세 근거')})),
  history:(d.majorityHistory||[]).map(row=>({date:iso(row.date,'이력 기준일'),issued_shares:number(row.issued,'이력 발행총수'),treasury_shares:number(row.treasury,'이력 자기주식수',true),
   group_shares:number(row.group,'이력 집단 보유량',true),evidence:text(row.evidence,'이력 근거')})),
  assets:(d.assets||[]).map(row=>({id:text(row.id,'과세재산 이름'),property_type:pick(row.type,['토지','건물'],'재산 종류'),net_book_value:number(row.value,'장부순가액',true),jurisdiction:text(row.region,'재산 소재지'),evidence:text(row.evidence,'장부 근거')}))});
}

function acquisitionMajorityOrderedFacts(d,f,{text,number,yesNo,pick}){
 const iso=(v,label)=>{v=text(v,label);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error(label+' 실제 날짜를 확인해 주세요.');return v;};
 const events=(d.orderedEvents||[]).map(row=>({sequence:number(row.sequence,'실제 효력 순번'),effective_time:text(row.time,'효력시각 HH:MM:SS'),event_type:pick(row.type,ACQ_MAJORITY_EVENTS.filter(x=>!['formation_issuance','relationship_change_only'].includes(x[0])).map(x=>x[0]),'독립 법률행위'),total_shares_before:number(row.before,'전 발행총수'),total_shares_after:number(row.after,'후 발행총수'),evidence:text(row.evidence,'법률원인·효력 근거'),shareholders:[]}));
 if(!events.length||new Set(events.map(x=>x.sequence)).size!==events.length)throw Error('사건별 실제 순번을 중복 없이 입력해 주세요.');
 for(const row of d.orderedShareholders||[]){const seq=number(row.sequence,'주주명세의 사건 순번'),event=events.find(x=>x.sequence===seq);if(!event)throw Error('주주명세에 존재하지 않는 사건 순번이 있습니다.');event.shareholders.push({id:text(row.id,'익명 주주 이름'),before_shares:number(row.before,'전 주식수',true),after_shares:number(row.after,'후 주식수',true),in_group_before:yesNo(row.inGroup,'동일 집단 포함'),in_group_after:yesNo(row.inGroup,'동일 집단 포함'),is_treasury:yesNo(row.isTreasury,'발행법인 자기주식'),evidence:text(row.evidence,'주주명세 근거')});}
 Object.assign(f,{schema_version:'acquisition-special/3',complex_mode:'ordered_ordinary_events',formation_date:iso(d.formationDate,'법인설립일'),same_group_confirmed:yesNo(d.sameGroup,'전후 동일 집단'),group_review_evidence:text(d.groupEvidence,'집단·권리 검토 근거'),ordering_evidence:text(d.orderingEvidence,'실제 효력 순서 근거'),atomic_concurrent:yesNo(d.atomicConcurrent,'분리 불가능한 동시행위'),events,
 history:(d.majorityHistory||[]).map(row=>({date:iso(row.date,'이력일'),sequence:number(row.sequence,'이력 실제순번',true),issued_shares:number(row.issued,'이력 발행총수'),treasury_shares:number(row.treasury,'이력 자기주식수',true),group_shares:number(row.group,'이력 집단보유수',true),evidence:text(row.evidence,'이력 근거')})),
 assets:(d.assets||[]).map(row=>({id:text(row.id,'재산 이름'),property_type:pick(row.type,['토지','건물'],'재산 종류'),net_book_value:number(row.value,'장부순가액',true),jurisdiction:text(row.region,'소재지'),evidence:text(row.evidence,'장부 근거')}))});
}

function acquisitionTreasuryFirstFacts(d,f,helpers){
 acquisitionMajorityHistoryFacts(d,f,helpers);
 const evidence=helpers.text(d.treasuryTransferEvidence,'유효한 법인 자기주식 직접 양수 근거');
 Object.assign(f,{schema_version:'acquisition-special/3',complex_mode:'treasury_transfer_first_majority',treasury_transfer_evidence:evidence});
}

function acquisitionSpecialRequest(d){
 const text=(v,label)=>{v=String(v??'').trim();if(!v||v.length>2000)throw Error(label+'을 입력해 주세요.');return v;};
 const number=(v,label,zero=false)=>{if(!/^\d+$/.test(String(v??'')))throw Error(label+'은 원 또는 수량의 정수로 입력해 주세요.');const n=Number(v);if(!Number.isSafeInteger(n)||n<(zero?0:1))throw Error(label+'의 금액·수량을 확인해 주세요.');return n;};
 const decimal=(v,label)=>{if(!/^\d+(?:\.\d+)?$/.test(String(v??''))||!Number.isFinite(Number(v))||Number(v)<=0)throw Error(label+'을 유효한 양수로 입력해 주세요.');return Number(v);};
 const yesNo=(v,label)=>{if(v!=='yes'&&v!=='no')throw Error(label+'을 확인해 주세요.');return v==='yes';};
 const date=(v,label)=>{if(!/^2026-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v>(['ordered','treasury_first'].includes(d.majorityMode)?'2026-10-29':'2026-10-28'))throw Error(label+'은 검증 범위인 2026-01-01~2026-10-28의 실제 날짜로 입력해 주세요.');return v;};
 const pick=(v,values,label)=>{if(!values.includes(v))throw Error(label+'을 선택해 주세요.');return v;};
 const check=(k,label)=>{if(d.checks?.[k]!==true)throw Error(label+' 확인이 필요합니다.');return true;};
 const kind=pick(d.kind,ACQ_SPECIAL_KINDS.map(x=>x[0]),'계산 종류');
 const f={schema_version:'acquisition-special/1',kind,acquisition_date:date(d.date,'취득일'),
  scope_confirmed:check('scope_confirmed','해당 계산 범위'),evidence:text(d.evidence,'전체 검토 자료명')};
 for(const [key,label] of acquisitionSpecialChecks(d))f[key]=check(key,label);
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
 if(kind==='majority_shareholder'&&d.majorityMode==='treasury_first')acquisitionTreasuryFirstFacts(d,f,{text,number,yesNo,pick});
 if(kind==='majority_shareholder'&&d.majorityMode==='history')acquisitionMajorityHistoryFacts(d,f,{text,number,yesNo,pick});
 if(kind==='majority_shareholder'&&d.majorityMode==='ordered')acquisitionMajorityOrderedFacts(d,f,{text,number,yesNo,pick});
 if(kind==='majority_shareholder'&&!['history','ordered','treasury_first'].includes(d.majorityMode)){
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
  shareholders:initialDraft?.shareholders||[{},{}],assets:initialDraft?.assets||[{}],groups:initialDraft?.groups||[{}],floors:initialDraft?.floors||[{},{}],majorityHistory:initialDraft?.majorityHistory||[],orderedEvents:initialDraft?.orderedEvents||[],orderedShareholders:initialDraft?.orderedShareholders||[]}));
 const [result,setResult]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const sequence=React.useRef(0),pending=React.useRef(null);
 React.useEffect(()=>()=>{sequence.current++;pending.current?.abort();},[]);
 const invalidate=()=>{sequence.current++;pending.current?.abort();setBusy(false);setResult(null);setError('');};
 const edit=(key,value)=>{invalidate();setD(old=>({...old,[key]:value,checks:{}}));};
 const checked=(key,value)=>{invalidate();setD(old=>({...old,checks:{...old.checks,[key]:value}}));};
 const rowEdit=(list,index,key,value)=>edit(list,d[list].map((row,i)=>i===index?{...row,[key]:value}:row));
 const field=(key,label,type='text',placeholder='')=><label className="jt-special-field" key={key}>{label}<input type={type==='date'?'text':type} inputMode={type==='date'?'numeric':undefined} data-testid={'acq-special-'+key} value={d[key]??''} placeholder={type==='date'?'YYYY-MM-DD':placeholder} onChange={e=>{const v=e.target.value;edit(key,type==='date'&&/^\d{8}$/.test(v)?v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6):v);}}/></label>;
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
  <p>{d.kind==='majority_shareholder'&&['ordered','treasury_first'].includes(d.majorityMode)?'2026년 10월 29일까지 확인한 보통주 범위입니다.':'2026년 10월 28일까지 확인한 법령 범위입니다.'} 자료명은 입력자가 검토한 근거이며, 자동으로 인증한 자료가 아닙니다. 모르는 사실은 확인 후 입력해 주세요.</p>
  <form onSubmit={submit}><div className="jt-special-grid">{select('kind','계산 종류',ACQ_SPECIAL_KINDS)}{field('date','실제 취득일','date')}{field('evidence','전체 검토 자료명')}</div>
  {['corporate_heavy','reviewed_reduction','floor_allocation'].includes(d.kind)&&<div className="jt-special-grid">{field('value','전체 취득가격 (원)','text','예: 100000000')}{origin}{d.kind!=='floor_allocation'&&select('propertyType','비주택 물건 종류',[['토지','비농지 토지'],['건물','비주택 건물']])}</div>}
  {d.kind==='corporate_heavy'&&<div className="jt-special-grid">{select('capitalGround','본점·공장 중과 사유',[['none','해당 없음'],['head_office_new_or_extension','본점·주사무소 신증축'],['factory_new_or_extension','공장 신증설']])}{select('metro','대도시 법인 중과 대상인가요?',yn)}{select('luxury','사치성 재산인가요?',yn)}{field('groundEvidence','권역·시기·시설·업종 예외 검토 근거')}</div>}
  {d.kind==='reviewed_reduction'&&<><p>지방세특례제한법의 정률 감면입니다. 없는 가지 조·항·호는 0을 입력하고, 최소납부 합산 범위와 농특세 두 부분을 각각 확인하세요.</p><div className="jt-special-grid">{[['article','감면 조 번호'],['branch','가지 조 번호'],['paragraph','항 번호'],['item','호 번호'],['reliefPercent','법정 감면율 (%)'],['eligibilityDate','감면 자격 기준일','date'],['eligibilityEvidence','감면 자격 검토 근거'],['minimumEvidence','최소납부·부칙 검토 근거'],['aggregationTax','합산 범위 감면 전 취득세 (원)'],['aggregationEvidence','법정 합산 범위 근거'],['ruralBaseEvidence','본세분 농특세 근거'],['ruralReductionEvidence','감면분 농특세 근거']].map(([k,l,t])=>field(k,l,t||'text'))}{select('ruralBaseExempt','본세분 농특세가 비과세인가요?',yn)}{select('ruralReductionExempt','감면분 농특세가 비과세인가요?',yn)}</div></>}
  {d.kind==='majority_shareholder'&&<div className="jt-special-grid"><label className="jt-special-field">계산 방식<select data-testid="acq-special-majorityMode" value={d.majorityMode||'legacy'} onChange={e=>edit('majorityMode',e.target.value)}><option value="legacy">기본 전후 명세</option><option value="history">전체 변동 이력·자기주식 예외</option><option value="ordered">같은 날 독립 사건의 실제 순서</option><option value="treasury_first">법인 자기주식 직접 양수 · 최초 과점 판정</option></select></label></div>}
  {d.kind==='majority_shareholder'&&!['history','ordered','treasury_first'].includes(d.majorityMode)&&<><div className="jt-special-grid">{field('totalBefore','취득 전 발행주식총수')}{field('totalAfter','취득 후 발행주식총수')}{select('hadPrior','과거 과점주주였던 이력이 있나요?',yn)}{select('route','주식 취득 경로',[['transfer','주식 양수'],['capital_increase','증자'],['formation_issuance','설립 시 발행']])}</div>
   {d.hadPrior==='yes'&&<div className="jt-special-grid">{[['highNumerator','과거 최고 지분 분자'],['highDenominator','과거 최고 지분 분모'],['highDate','과거 최고 지분 기준일','date'],['previousNumerator','재진입 전 종전 과점 지분 분자 (해당 시)'],['previousDenominator','재진입 전 종전 과점 지분 분모 (해당 시)']].map(([k,l,t])=>field(k,l,t||'text'))}</div>}
   {rows('shareholders','전체 주주명부',[['id','주주 이름'],['before','전 주식수','number'],['after','후 주식수','number'],['inGroup','동일 집단 포함',yn],['evidence','주주명부 근거']])}
   {rows('assets','법인 취득세 대상 재산',[['id','재산 이름'],['type','재산 종류',[['토지','비농지 토지'],['건물','비주택 건물']]],['value','순장부가액 (원)','number'],['region','소재지'],['evidence','장부 근거']])}</>}
  {d.kind==='floor_allocation'&&<><p>개인의 비농지·전체 취득 중 일반 비주택·주택·사치성 재산을 구분합니다. 같은 주택 한 호의 여러 층은 같은 과세 묶음에 넣으세요. 주택 감면·법인 중과와 혼합한 묶음은 담당자 검토가 필요합니다.</p><div className="jt-special-grid">{select('basis','층별 안분 기준',[['separate_prices','층별로 구분된 실제가격'],['standard_ratio','시가표준액 비율'],['area_ratio','신축 면적 비율']])}{field('allocationEvidence','안분 원자료·법정 기준 검토 근거')}</div>
   {rows('groups','과세 묶음',[['id','묶음 이름'],['use','용도',[['nonhousing','일반 비주택'],['luxury','사치성 비주택'],['housing','주택']]],['houses','주택이면 세대 주택수','number'],['regulated','주택이면 조정지역',yn],['area','주택 전체 전용면적 (㎡)','number'],['evidence','묶음 전체 범위 근거']])}
   {rows('floors','층별 원자료',[['id','층 이름'],['group','과세 묶음 이름'],['weight',d.basis==='area_ratio'?'총면적 (㎡)':d.basis==='standard_ratio'?'시가표준액 (원)':'실제가격 (원)','number'],['evidence','층별 근거']])}
   {confirmation('floor_personal','개인·비농지·특수관계 및 조례 세율 변동 없는 전체 취득입니다')}{d.groups.map((row,i)=>confirmation('group:'+row.id,'과세 묶음 ‘'+(row.id||i+1)+'’의 전체 범위를 확인했습니다(동일 주택·부속토지 포함)'))}</>}
  {d.kind==='majority_shareholder'&&['history','treasury_first'].includes(d.majorityMode)&&<>
   {d.majorityMode==='treasury_first'&&<p>발행법인의 자기주식을 같은 집단이 직접 양수한 단일 거래입니다. 과거 전체 이력에 과점 경험이 없어야 하며 외부 주주 거래·집단 구성원의 처분이 섞이면 계산하지 않습니다. 취득 후50% 이하는0원으로 판정합니다.</p>}
   <p>집단 전체 주주지위가0이 된 경우와 개인만 이탈한 경우를 구별합니다. 설립일부터 사건 전일까지 이력을 날짜순으로 넣어 주세요. 주식취득 없는 단독 사건은 현재 전후 명세로 판단합니다.</p>
   <div className="jt-special-grid">{d.majorityMode==='treasury_first'?field('treasuryTransferEvidence','단일 자기주식 직접 양수·법률효력 근거'):select('historyEvent','현재 사건 종류',ACQ_MAJORITY_EVENTS)}{field('formationDate','법인설립일','date')}{field('totalBefore','전 발행주식총수 (자기주식 포함)','number')}{field('totalAfter','후 발행주식총수 (자기주식 포함)','number')}{select('sameGroup','전후 동일 특수관계인 집단',yn)}{select('actualAcquisition','집단의 실제 주식취득이 있습니까?',yn)}{field('groupEvidence','집단·권리 검토 자료명')}</div>
   {rows('shareholders','전체 주주명세 (발행법인 자기주식은 별도 행)',[['id','주주 이름'],['before','전 보통주 수','number'],['after','후 보통주 수','number'],['inGroup','전 집단 소속',yn],...(d.historyEvent==='relationship_change_only'?[['inGroupAfter','후 집단 소속',yn]]:[]),['isTreasury','발행법인 자기주식',yn],['evidence','주주명세 근거']])}
   {rows('majorityHistory','설립부터 사건 직전까지 전체 변동 이력',[['date','이력 기준일','date'],['issued','전체 발행총수','number'],['treasury','자기주식수 (없으면0)','number'],['group','집단 보유주식수 (없으면0)','number'],['evidence','이력 근거']])}
   {rows('assets','일반 과세재산 전체 장부',[['id','재산 이름'],['type','종류',[['토지','일반 비농지 토지'],['건물','일반 비주택 건물']]],['value','장부순가액 (원)','number'],['region','재산 소재지'],['evidence','장부 근거']])}
  </>}

  {d.kind==='majority_shareholder'&&d.majorityMode==='ordered'&&<>
   <p>2026-10-29까지 확인한 보통주 범위입니다. 같은 날 독립된 법률행위의 실제 효력 순서대로 입력합니다. 분리할 수 없는 동시행위는 세액을 확정하지 않습니다. 앞 사건의 후 명세와 다음 사건의 전 명세가 모두 이어져야 합니다.</p>
   <div className="jt-special-grid">{field('formationDate','법인설립일','date')}{select('sameGroup','전후 동일 특수관계인 집단',yn)}{field('groupEvidence','집단·권리 검토 근거')}{field('orderingEvidence','실제 효력 순번·시각 문서 근거')}{select('atomicConcurrent','분리 불가능한 동시 법률행위인가요?',yn)}</div>
   {rows('orderedEvents','당일 실제 사건 (효력 순서대로)',[['sequence','실제 순번','number'],['time','효력시각 HH:MM:SS'],['type','독립 법률원인',ACQ_MAJORITY_EVENTS.filter(x=>!['formation_issuance','relationship_change_only'].includes(x[0]))],['before','전 발행총수','number'],['after','후 발행총수','number'],['evidence','원인·효력 문서']])}
   {rows('orderedShareholders','사건별 전체 주주명세 (사건 순번으로 연결)',[['sequence','사건 순번','number'],['id','주주 이름'],['before','전 주식수','number'],['after','후 주식수','number'],['inGroup','동일 집단',yn],['isTreasury','발행법인 자기주식',yn],['evidence','주주명세 근거']])}
   {rows('majorityHistory','설립부터 첫 사건 직전까지 전체 이력',[['date','실제 이력일','date'],['sequence','그날 실제 순번 (설립은0)','number'],['issued','발행총수','number'],['treasury','자기주식수','number'],['group','집단주식수','number'],['evidence','이력 근거']])}
   {rows('assets','당일 전체 일반 과세재산',[['id','재산 이름'],['type','종류',[['토지','비농지 토지'],['건물','비주택 건물']]],['value','장부순가액 (원)','number'],['region','납세지'],['evidence','장부 근거']])}
  </>}

<fieldset><legend>적용 범위 확인</legend>{confirmation('scope_confirmed','현재 선택한 계산 범위와 사실이 일치합니다')}{acquisitionSpecialChecks(d).map(([k,l])=>confirmation(k,l))}</fieldset>
  <p>금액·날짜·용도·원자료를 바꾸면 기존 결과와 확인 표시가 해제됩니다.</p><button type="submit" className="jt-btn jt-btn--primary" disabled={busy}>{busy?'계산 중…':'확인한 사실로 계산'}</button></form>
  {error&&<p role="alert" data-testid="acq-special-error">{error}</p>}{result&&<section aria-live="polite" data-testid="acq-special-result"><h3>확인한 사실의 계산 결과</h3><p>과세표준 {result['과세표준'].toLocaleString('ko-KR')}원</p><dl>{['취득세','지방교육세','농어촌특별세','세액'].map(k=><React.Fragment key={k}><dt>{k==='세액'?'합계':k}</dt><dd>{result[k].toLocaleString('ko-KR')}원</dd></React.Fragment>)}</dl>{result['상세계산']?.['사건별계산']?.map(row=><p key={row['사건순번']}>사건 {row['사건순번']} ({row['실제효력시각']}): {row['세액'].toLocaleString('ko-KR')}원 · {row['상세계산']?.['판정']}</p>)}{result['경고사항']?.map((w,i)=><p key={i}>{w}</p>)}</section>}
 </JTReportShell></div>;
}
window.JTAcquisitionSpecialDirect=JTAcquisitionSpecialDirect;
