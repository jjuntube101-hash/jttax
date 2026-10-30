/* Reviewed generated credits and actual tax ledgers; tax arithmetic stays on the server. */
const CREDIT_REVIEW_CHECKS=[['income_and_deductions_complete','소득·결손금·인적공제의 해당 범위를 확인했습니다'],['residence_and_ordinary_tax_status','일반 납세자 지위와 거주자 요건을 검토했습니다'],['direct_foreign_taxes_only','외국세가 있다면 실제 직접 소득과세이며 간접·간주 외국세가 없습니다'],['eligibility_and_amounts_reviewed','발생공제액·감면 자격·이월과 기사용액을 원자료와 대조했습니다'],['no_other_credits','입력하지 않은 다른 공제·감면이 없습니다']];
const CREDIT_SOURCE_CHECKS=[['relief_income_excluded','국가별 한도분자에서 법정 감면·면제 대상분을 조정했습니다'],['attributable_costs_reconciled','대응비용·결손 배분 후 국가별 한도분자입니다'],['no_expense_related_noncarry_excess','대응비용 관련 한도초과 불이월 특례가 없는 정상범위입니다']];
const CREDIT_CODES=[['rd_general','일반 연구·인력개발비 공제'],['investment','통합투자 공제'],['employment','통합고용 공제'],['sme_reduction','중소기업 특별감면']];
function creditSettlementRequest(d){
 const text=(v,label)=>{if(typeof v!=='string'||!v.trim()||v.length>2000)throw Error(label+'을 입력해 주세요.');return v.trim();};
 const n=(v,label)=>{if(!/^\d+$/.test(String(v??''))||!Number.isSafeInteger(Number(v)))throw Error(label+'은 원 또는 수량의 안전한 정수로 입력해 주세요. 빈칸과0은 다릅니다.');return Number(v);};
 const yn=(v,label)=>{if(!['yes','no'].includes(v))throw Error(label+'을 선택해 주세요.');return v==='yes';};
 const chosen=(v,values,label)=>{if(!values.includes(v))throw Error(label+'을 선택해 주세요.');return v;};
 const check=(key,label)=>{if(d.checks?.[key]!==true)throw Error(label+' 확인이 필요합니다.');return true;};
 const kind=chosen(d.taxType,['corporate','income'],'세목'),review={};
 for(const [key,label] of CREDIT_REVIEW_CHECKS)review[key]=check(key,label);
 const base=kind==='corporate'?{net_income:n(d.income,'당기순이익'),corporate_type:chosen(d.corporateType,['중소기업','중견기업','일반법인'],'법인 유형'),carried_forward_loss:n(d.loss,'적격 검토된 이월결손금')}:
  {...(d.incomeMode==='salary'?{income_mode:'salary',salary_income:n(d.income,'비과세 제외 과세 총급여')}:{business_income:n(d.income,'필요경비 후 사업소득금액')}),spouse:yn(d.spouse,'배우자 공제 자격'),dependents:n(d.dependents,'적격 부양가족 수'),national_pension:n(d.pension,'국민연금 납입액')};
 if(kind==='corporate'){
  review.ordinary_minimum_status_confirmed=check('ordinary_minimum_status_confirmed','중소기업 졸업유예·특수 최저한세가 없는 지위');
  review.separate_businesses_reconciled=check('separate_businesses_reconciled','사업별 소득과 자산 구분경리');
 }
 const vintage=(row,label)=>{
  const item={id:text(row.id,label+' 이름'),origin_year:n(row.year,label+' 발생연도'),generated_amount:n(row.amount,label+' 발생공제액·실제 외국세'),used_before:n(row.used,label+' 과거 사용액'),evidence:text(row.evidence,label+' 원장 근거')};
  if(item.origin_year<2021)Object.assign(item,{original_expiry_year:n(row.oldExpiry,label+' 개정 전 소멸연도'),transition_2021_eligible:yn(row.transition,label+' 2021시행 직전 유효잔액'),transition_evidence:text(row.transitionEvidence,label+' 적용례 근거')});
  return item;
 };
 const credits=kind==='corporate'?(d.credits||[]).map((row,i)=>{
  const code=chosen(row.code,CREDIT_CODES.map(x=>x[0]),'공제 항목'),sme=code==='sme_reduction';
  const item=vintage(sme?{...row,amount:'0',used:'0'}:row,'공제'+(i+1));
  Object.assign(item,{code,business_id:text(row.business,'구분경리 사업 이름'),asset_ids:String(row.assets||'').split(',').map(x=>x.trim()).filter(Boolean)});
  if(sme)Object.assign(item,{reduction_income:n(row.reductionIncome,'감면 대상 소득'),reduction_rate:{numerator:n(chosen(row.percent,['5','10','15','20','30'],'법정 감면율'),'감면율'),denominator:100}});
  return item;
 }):[];
 const adjustment_review={};
 if((d.foreign||[]).length)for(const [key,label] of CREDIT_SOURCE_CHECKS)adjustment_review[key]=check(key,label);
 const countryMap=new Map();
 for(const row of d.foreign||[]){
  const country=text(row.country,'국가'),income=n(row.sourceIncome,'해당 국가의 당기 국외원천 순소득'),tax=vintage(row,'외국세');
  if(countryMap.has(country)&&countryMap.get(country).source_income!==income)throw Error('같은 국가의 당기 순소득은 모든 이월 행에서 같아야 합니다.');
  if(!countryMap.has(country))countryMap.set(country,{country,source_income:income,taxes:[],adjustment_review,evidence:text(d.countryEvidence,'국가별 순소득 배분 근거')});
  countryMap.get(country).taxes.push(tax);
 }
 const local=kind==='corporate'?(d.local||[]).map(row=>({id:text(row.id,'지방 원세액 이름'),origin_year:n(row.year,'지방 원세액 발생연도'),foreign_tax_amount:n(row.amount,'이월된 지방 원세액'),used_before:n(row.used,'과거 지방 과표 차감액'),evidence:text(row.evidence,'지방 원장 근거')})):[];
 if(kind==='income'&&d.incomeMode==='salary'){review.salary_worldwide_scope_and_treaty_costs_confirmed=check('salary_worldwide_scope_and_treaty_costs_confirmed','총급여·국가별 근로공제·대응비용·조약제한세율·다른소득없음');review.no_special_salary_deductions_claimed=check('no_special_salary_deductions_claimed','특별소득·특별세액·월세 공제 미신청');}
 const request={schema_version:kind==='income'&&d.incomeMode==='salary'?'credit-settlement/3':'credit-settlement/1',tax_type:kind,tax_year:2026,base,credits,foreign_countries:[...countryMap.values()],local_foreign_carryovers:local,
  credit_order:String(d.order||'').split(',').map(x=>x.trim()).filter(Boolean),review,evidence:text(d.evidence,'전체 검토 자료명')};
 if(d.choiceEvidence)request.choice_evidence=text(d.choiceEvidence,'동순위 선택 근거');
 if(credits.some(x=>x.code==='sme_reduction'))request.decreased_regular_employees=n(d.decreased,'상시근로자 감소 인원');
 if(d.generate===true){if(kind!=='corporate')throw Error('원자료 발생액은 법인세에서 계산합니다.');request.schema_version='credit-settlement/2';request.generation_facts=creditGenerationRequest(d.generation);}
 return {request};
}
function creditSettlementResult(calc){
 if(!calc||!['ok','partial'].includes(calc['상태']))throw Error(calc?.['오류']||'적용 범위와 누락된 원자료를 확인해 주세요.');
 for(const key of ['산출세액','국세결정세액','지방소득세','총세부담'])if(!Number.isSafeInteger(calc[key])||calc[key]<0)throw Error('확정 세액 응답을 확인할 수 없습니다.');
 if(calc['국세결정세액']+calc['지방소득세']!==calc['총세부담'])throw Error('국세·지방세 합계 응답을 확인할 수 없습니다.');
 return calc;
}
function JTCreditSettlementDirect({onBack,initialKind='corporate',initialDraft}){
 const [d,setD]=React.useState({taxType:initialKind,...(initialKind==='corporate'&&initialDraft?{income:initialDraft.income,corporateType:initialDraft.type,loss:initialDraft.loss}:{}),credits:[],foreign:[],local:[],checks:{}});
 const [result,setResult]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const ids=React.useRef(0),session=useJTInputSession(()=>{setResult(null);setError('');setBusy(false);});
 const edit=(key,value)=>{session.invalidate();setD(old=>key==='taxType'?{taxType:value,credits:[],foreign:[],local:[],checks:{}}:{...old,[key]:value,checks:{}});};
 const check=(key,value)=>{session.invalidate();setD(old=>({...old,checks:{...old.checks,[key]:value}}));};
 const modify=(list,i,key,value)=>edit(list,d[list].map((row,index)=>index===i?{...row,[key]:value}:row));
 const input=(key,label,money=false)=><label className="jt-special-field">{label}<JTNumericInput money={money} data-testid={'credit-'+key} value={d[key]??''} onChange={e=>edit(key,e.target.value)}/></label>;
 const plain=(key,label)=><label className="jt-special-field">{label}<input data-testid={'credit-'+key} value={d[key]??''} onChange={e=>edit(key,e.target.value)}/></label>;
 const select=(key,label,options)=><label className="jt-special-field">{label}<select data-testid={'credit-'+key} value={d[key]??''} onChange={e=>edit(key,e.target.value)}><option value="">미확인 · 선택해 주세요</option>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>;
 const yn=[['yes','예'],['no','아니오']];
 const vintageColumns=[['id','원장 이름'],['year','발생연도','number'],['amount','발생 공제액 또는 실제 외국세 (원)','money'],['used','과거 사용액 (없으면0)','money'],['evidence','납세·발생·기사용 근거 자료명'],
  ['oldExpiry','2021전 발생분의 종전 소멸연도','number',null,row=>Number(row.year)<2021&&row.year!==''],['transition','2021 시행 직전 유효잔액','select',yn,row=>Number(row.year)<2021&&row.year!==''],['transitionEvidence','2021 적용례·잔액 근거','text',null,row=>Number(row.year)<2021&&row.year!=='']];
 const rows=(list,title,columns)=><fieldset className="jt-special-rows"><legend>{title}</legend>{d[list].map((row,i)=><div className="jt-special-row" key={i}><span>{i+1}</span>{columns.filter(c=>!c[4]||c[4](row)).map(([key,label,type='text',options])=><label key={key}>{label}{type==='select'?<select data-testid={'credit-'+list+'-'+i+'-'+key} value={row[key]??''} onChange={e=>modify(list,i,key,e.target.value)}><option value="">미확인</option>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>:type==='money'||type==='number'?<JTNumericInput money={type==='money'} data-testid={'credit-'+list+'-'+i+'-'+key} value={row[key]??''} onChange={e=>modify(list,i,key,e.target.value)}/>:<input data-testid={'credit-'+list+'-'+i+'-'+key} value={row[key]??''} onChange={e=>modify(list,i,key,e.target.value)}/>}</label>)}<button type="button" className="jt-btn jt-btn--ghost" onClick={()=>edit(list,d[list].filter((_,index)=>index!==i))}>행 삭제</button></div>)}<button type="button" className="jt-btn jt-btn--ghost" onClick={()=>edit(list,[...d[list],{id:(list==='credits'?'C':list==='foreign'?'F':'L')+(++ids.current),year:list==='local'?'':'2026'}])}>행 추가</button></fieldset>;
 const submit=async event=>{
  event.preventDefault();const token=session.begin(),commit=session.sink(token,setResult),fail=session.sink(token,setError),loading=session.sink(token,setBusy);
  commit(null);fail('');loading(true);
  try{const payload=creditSettlementRequest(d),base=window.JT_ENGINE_BASE;if(!base)throw Error('계산 엔진 연결을 확인해 주세요.');
   const response=await fetch(base+'/v1/calc/credit-settlement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!response.ok)throw Error('입력 범위와 엔진 응답을 확인해 주세요.');const body=await response.json();commit(creditSettlementResult(body.calc));
  }catch(e){fail(e.message||'계산을 완료하지 못했습니다.');}finally{loading(false);}
 };
 const won=v=>v===null?'확인 필요':Number.isSafeInteger(v)?v.toLocaleString('ko-KR')+'원':'—';
 const checks=[...CREDIT_REVIEW_CHECKS,...(d.taxType==='income'&&d.incomeMode==='salary'?[['salary_worldwide_scope_and_treaty_costs_confirmed','비과세 제외 총급여·다른 소득없음·국가별 근로공제/대응비용 배분·직접세/조약제한세율·가산세제외를 확인했습니다'],['no_special_salary_deductions_claimed','특별소득·특별세액·월세 공제를 신청하지 않습니다 (표준공제 범위)']]:[]),...(d.foreign.length?CREDIT_SOURCE_CHECKS:[]),...(d.taxType==='corporate'?[['ordinary_minimum_status_confirmed','졸업 유예·특수 최저한세가 없는 일반 지위입니다'],['separate_businesses_reconciled','사업별 소득·투자자산이 구분되어 있습니다']]:[])];
 return <div className="jt-special-direct"><JTReportShell title="공제·이월 원장 계산" subtitle="발생액, 당기 사용액과 잔액을 분리하고 국세·지방세를 따로 계산합니다." tag="2026 공제 정산" onBack={onBack}>
  <p>2026 달력연도 정상범위입니다. 연구·투자·고용은 검토된 발생액을 넣거나 아래 원자료 자동산정을 선택합니다. 투자액·연구비 지출총액과 다릅니다. 중소기업 특별감면은 대상 소득과 법정 감면율로 계산합니다.</p>
  <form onSubmit={submit}><div className="jt-special-grid">{select('taxType','세목',[['corporate','법인세'],['income','개인 외국납부 공제']])}{d.taxType==='income'&&select('incomeMode','소득 유형',[['business','개인 사업소득'],['salary','단일 근로소득']])}{input('income',d.taxType==='corporate'?'당기순이익 (원)':d.incomeMode==='salary'?'비과세를 제외한 과세 총급여 (원)':'필요경비 후 사업소득금액 (원)',true)}
   {d.taxType==='corporate'?<>{select('corporateType','법인 유형',[['중소기업','중소기업'],['중견기업','중견기업'],['일반법인','일반법인']])}{input('loss','적격 검토된 이월결손금 (없으면0)',true)}</>:<>{select('spouse','배우자 공제 자격',yn)}{input('dependents','적격 부양가족 수 (배우자 제외, 없으면0)')}{input('pension','실제 국민연금 납입액 (없으면0)',true)}</>}{plain('evidence','전체 검토 자료명')}</div>
   {d.taxType==='corporate'&&<><label><input type="checkbox" data-testid="credit-generate" checked={d.generate===true} onChange={e=>edit('generate',e.target.checked)}/>원자료에서 당기 발생액 계산</label>{d.generate&&<JTCreditGenerationInputs value={d.generation||{}} onChange={v=>edit('generation',v)}/>}</>}
   {d.taxType==='corporate'&&<>{rows('credits','국내 공제·감면 발생/이월 원장',[
    ['code','공제 항목','select',CREDIT_CODES],...vintageColumns.filter(c=>!['amount','used'].includes(c[0])),
    ['amount','검토된 발생공제액 (원)','money',null,row=>row.code!=='sme_reduction'],['used','과거 실제 공제액 (없으면0)','money',null,row=>row.code!=='sme_reduction'],
    ['business','구분경리 사업 이름'],['assets','투자자산 이름 (여럿이면 쉼표)'],['reductionIncome','감면 대상 소득 (원)','money',null,row=>row.code==='sme_reduction'],['percent','확인된 법정감면율','select',[['5','5%'],['10','10%'],['15','15%'],['20','20%'],['30','30%']],row=>row.code==='sme_reduction']])}
    {d.credits.some(x=>x.code==='sme_reduction')&&input('decreased','상시근로자 감소 인원 (없으면0)')}</>}
   {rows('foreign','국가별 직접 외국세 원장',[['country','국가 이름'],['sourceIncome','그 국가의 한도용 조정 후 국외소득 (원)','money'],...vintageColumns])}
   {!!d.foreign.length&&plain('countryEvidence','국가별 순소득 배분 자료명')}
   {d.taxType==='corporate'&&<><p>지방 과표의 과거 차감액은 국세 외국납부세액공제 사용액과 다릅니다. 당기 실제 외국세는 위 원장에서 가져오므로 이 표에는 당기 이전 이월분만 넣습니다.</p>
    {rows('local','법인 지방소득세 외국세 과표 이월 원장',[['id','원세액 이름'],['year','원세액 발생연도','number'],['amount','실제 외국세 원금 (원)','money'],['used','과거 지방 과표 차감액 (없으면0)','money'],['evidence','지방 과표 이월·기사용 근거']])}</>}
   <div className="jt-special-grid">{plain('order','같은 법정순위에서 선택할 공제 이름 순서 (필요할 때, 쉼표)')}{plain('choiceEvidence','동일순위 선택 근거')}</div>
   <fieldset><legend>적용 사실 확인</legend>{checks.map(([key,label])=><label className="jt-special-check" key={key}><input type="checkbox" data-testid={'credit-check-'+key} checked={d.checks[key]===true} onChange={e=>check(key,e.target.checked)}/>{label}</label>)}</fieldset>
   <button type="submit" className="jt-btn jt-btn--primary" disabled={busy}>{busy?'정산 중…':'확인한 원장으로 계산'}</button>
  </form>
  {error&&<p role="alert" data-testid="credit-error">{error}</p>}
  {result&&<section aria-live="polite" data-testid="credit-result"><h3>확인한 현재 세액</h3><dl>{['산출세액','국세결정세액','지방소득세','총세부담'].map(k=><React.Fragment key={k}><dt>{k}</dt><dd>{won(result[k])}</dd></React.Fragment>)}</dl>
   {result['발생공제자동산정']?.map(row=><p key={row.id}>{row.id} 발생액: {won(row.generated_amount)} · 원자료에서 계산한 당기 발생액이며 아래 사용액·잔액과 구분합니다.{row.qualification_mode==='reviewed_months'?' 직원 적격월 판정은 입력된 검토 근거를 사용했습니다.':''}</p>)}
   {result['상태']==='partial'&&<p role="status">현재 세액은 확인했으며, 일부 외국세의 후속 처리·이월 배분은 추가 확인이 필요합니다.</p>}
   <div className="jt-credit-table"><table><caption>공제별 당기 사용과 잔액</caption><thead><tr><th>이름</th><th>당기 사용</th><th>이월 잔액</th><th>기한종료·소멸</th><th>다음연도 손금·필요경비 후보</th></tr></thead><tbody>{result['공제원장']?.map(row=><tr key={row.id}><td>{row.id}</td><td>{won(row.used)}</td><td>{won(row.carryforward)}</td><td>{won(row.period_end_unused??row.expired_amount)}</td><td>{won(row.following_year_expense_candidate)}</td></tr>)}</tbody></table></div>
   {result['지방외국세과표원장']?.length>0&&<div className="jt-credit-table"><table><caption>법인 지방소득세 외국세 과표 차감·이월</caption><thead><tr><th>이름</th><th>당기 과표 차감</th><th>차기 이월</th><th>기간종료</th></tr></thead><tbody>{result['지방외국세과표원장'].map(row=><tr key={row.id}><td>{row.id==='current_foreign_tax'?'당기 실제 외국세':row.id}</td><td>{won(row.used)}</td><td>{won(row.carryforward)}</td><td>{won(row.period_end_unused??row.expired_amount)}</td></tr>)}</tbody></table></div>}
   {result['경고사항']?.map((w,i)=><p key={i}>{w}</p>)}
  </section>}
 </JTReportShell></div>;
}
window.JTCreditSettlementDirect=JTCreditSettlementDirect;
window.creditSettlementRequest=creditSettlementRequest;
window.creditSettlementResult=creditSettlementResult;
