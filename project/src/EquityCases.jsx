/* Saved raw valuations use the existing public calculation contract. */
const EQ_RAW_REVIEW_KEYS = [
  ['general_3_to_2_and_no_nav_only_exception','일반 3:2 평가이며 순자산 전용 등 다른 평가특례가 없습니다.'],
  ['all_assets_liabilities_statutorily_valued','모든 자산·부채를 법정 평가기준으로 검토했습니다. 실제 없는 항목만 빈 명세로 남겼습니다.'],
  ['three_year_tax_adjustments_complete','직전 3년 소득·차감세액·가산·차감조정을 확인했습니다.'],
  ['no_capital_or_stock_count_changes','3년 내 증감자와 발행주식수 변동이 없습니다.'],
  ['goodwill_equity_legally_reviewed','영업권을 더하기 전의 법정 순자산가액과 평가 근거를 검토했습니다.'],
  ['no_other_valuation_adjustments','입력 밖 평가 조정·청산·휴폐업·특례가 없습니다.']
];
function equityRawDefault(previous={}) {
  return {company_name:previous.company_name||'',eval_date:previous.eval_date||null,eval_purpose:previous.eval_purpose||'증여',
    total_shares:previous.total_shares??null,shares_evaluated:previous.shares_evaluated??null,par_value:null,
    market_facts:{schema_version:'stock-market/1',valuation_date:previous.eval_date||null,purpose:previous.eval_purpose||'증여',
      candidates:[],all_candidates_reviewed:false,no_committee_extension:false,premium_eligibility_reviewed:false,
      premium_treatment:'',premium_evidence:'',evidence:''}};
}
function equityRawPrepare(draft) {
  const integerKeys=new Set(['total_shares','shares_evaluated','par_value','price_per_share','transaction_shares','amount','statutory_equity','equity_capital','assets_appraised','liabilities_book','assets_book','purchased_intangibles']);
  const arrays=new Set(['taxable_income','corporate_tax_amounts','adjustment_add','adjustment_sub','fiscal_year_shares']);
  const dates=new Set(['eval_date','valuation_date','contract_date','decision_date','period_start','period_end']);
  const labels={total_shares:'발행주식총수',shares_evaluated:'평가 주식수',par_value:'액면가',price_per_share:'거래가격',transaction_shares:'거래 주식수',amount:'명세 평가액',statutory_equity:'법정 자기자본',equity_capital:'법정 자기자본',purchased_intangibles:'매입 무체재산권 평가액',taxable_income:'사업연도 소득',corporate_tax_amounts:'차감 법인세등',adjustment_add:'가산조정',adjustment_sub:'차감조정',fiscal_year_shares:'연도별 주식수'};
  const label=path=>Object.entries(labels).reduce((text,[key,value])=>text.replaceAll(key,value),path.replace('valuation_input.','').replace('reviewed_supplement_facts.','').replace('market_facts.',''));
  const numeric=(v,path,signed=false)=>{
    if(v===null||v===undefined||v==='')return null;
    if(typeof v==='boolean'||!(signed?/^-?\d+$/:/^\d+$/).test(String(v))||!Number.isSafeInteger(Number(v)))throw Error(label(path)+'은 확인한 정수로 입력해 주세요. 빈칸은 0과 다릅니다.');
    return Number(v);
  };
  const walk=(v,key,path)=>{
    if(integerKeys.has(key))return numeric(v,path);
    if(arrays.has(key)){if(!Array.isArray(v))throw Error(path+' 자료를 확인해 주세요.');return v.map((x,i)=>numeric(x,path+' '+(i+1)+'번째',key==='taxable_income'));}
    if(['real_estate_ratio','stock_ratio','years_since_start','remaining_years'].includes(key)){
      if(v===null||v===undefined||v==='')return null;
      if(typeof v==='boolean'||!/^\d+(\.\d+)?$/.test(String(v))||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>Number.MAX_SAFE_INTEGER||((key==='real_estate_ratio'||key==='stock_ratio')&&Number(v)>1))throw Error(path+'의 확인한 비율·연수를 입력해 주세요.');return Number(v);
    }
    if(dates.has(key)){
      if(v===null||v===undefined||v==='')return null;
      if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error(path+' 날짜를 확인해 주세요.');return v;
    }
    if(Array.isArray(v))return v.map((x,i)=>walk(x,'',path+' '+(i+1)));
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,k,path?path+'.'+k:k)]));
    return v;
  };
  const prepared=walk(draft,'','');
  const input=prepared.valuation_input,s=input?.reviewed_supplement_facts;
  if(s){
    for(const [rows,key] of [[s.assets,'assets_appraised'],[s.liabilities,'liabilities_book']]){
      const total=Array.isArray(rows)&&rows.every(x=>x.amount!==null)?rows.reduce((sum,x)=>sum+x.amount,0):null;
      if(total!==null&&!Number.isSafeInteger(total))throw Error(key+' 합계가 안전한 정수 범위를 벗어납니다.');input[key]=total;
    }
    input.equity_capital=s.statutory_equity;
  }
  return prepared;
}
function equityRawAssetSummary(facts) {
  const amount=v=>(v!==null&&v!==undefined&&v!==''&&/^\d+$/.test(String(v))&&Number.isSafeInteger(Number(v)))?Number(v):null;
  const sum=rows=>{
    if(!Array.isArray(rows)||(!rows.length&&facts.review?.all_assets_liabilities_statutorily_valued!==true))return null;
    const values=rows.map(row=>amount(row.amount));if(values.some(v=>v===null))return null;
    const total=values.reduce((a,b)=>a+b,0);return Number.isSafeInteger(total)?total:null;
  };
  const assets=sum(facts.assets),liabilities=sum(facts.liabilities),equity=amount(facts.statutory_equity);
  const net=assets===null||liabilities===null?null:Math.max(assets-liabilities,0);
  return {assets,liabilities,net,equity,mismatch:net!==null&&equity!==null&&net!==equity};
}
function equityRawInvalidate(input) {
  return {...input,market_facts:{...input.market_facts,all_candidates_reviewed:false,no_committee_extension:false,premium_eligibility_reviewed:false},
    ...(input.reviewed_supplement_facts?{reviewed_supplement_facts:{...input.reviewed_supplement_facts,review:{},...(input.reviewed_supplement_facts.goodwill?{goodwill:{...input.reviewed_supplement_facts.goodwill,ordinary_five_years_confirmed:false,no_duplicates_confirmed:false}}:{})}}:{})};
}
function JTEquityRawInputs({input,onChange,disabled}) {
  const r=input,m={...equityRawDefault(r).market_facts,...r.market_facts,candidates:r.market_facts?.candidates||[]};
  const s=r.reviewed_supplement_facts?{...r.reviewed_supplement_facts,assets:r.reviewed_supplement_facts.assets||[],liabilities:r.reviewed_supplement_facts.liabilities||[],...(r.reviewed_supplement_facts.schema_version==='stock-supplement/office-2'?{goodwill:{purchased_intangibles:null,purchased_evidence:'',review_evidence:'',ordinary_five_years_confirmed:false,no_duplicates_confirmed:false,...r.reviewed_supplement_facts.goodwill}}:{})}:null;
  const set=(patch,review=false)=>{const next={...r,market_facts:m,...patch};onChange(review?next:equityRawInvalidate(next));};
  const market=(patch,review=false)=>set({market_facts:{...m,...patch}},review);
  const supplement=(patch,review=false)=>set({reviewed_supplement_facts:{...s,...patch}},review);
  const field=(key,label,type='text')=><label key={key}>{label}<input data-testid={'equity-raw-'+key} type={type} inputMode={type==='text'&&key!=='company_name'?'decimal':undefined} value={r[key]??''} onChange={e=>{
    const value=e.target.value||null;set({[key]:value,...(key==='eval_date'?{market_facts:{...m,valuation_date:value},...(s?{reviewed_supplement_facts:{...s,valuation_date:value}}:{})}:{})});
  }}/></label>;
  const bool=(value,callback,id,label)=><label>{label}<select data-testid={id} value={value===true?'yes':value===false?'no':''} onChange={e=>callback(e.target.value===''?null:e.target.value==='yes')}><option value="">미확인</option><option value="no">아니오</option><option value="yes">예</option></select></label>;
  const checkbox=(value,callback,id,label)=><p key={id}><label><input data-testid={id} type="checkbox" checked={value===true} onChange={e=>callback(e.target.checked)}/>{label}</label></p>;
  const candidate=(index,patch)=>market({candidates:m.candidates.map((c,i)=>i===index?{...c,...patch}:c)});
  const exemptionFlags=['is_sme','is_mid_size','has_3yr_consecutive_loss','all_shares_sold','is_deemed_gift_calc','is_subsidiary_eval','is_startup_no_profit','is_liquidation_confirmed','is_non_largest_recipient','is_nominee_gift'];
  const lineSet=(key,i,patch)=>supplement({[key]:s[key].map((x,j)=>j===i?{...x,...patch}:x)});
  const summary=s?equityRawAssetSummary(s):null;
  const money=value=>value===null?'미확인':value.toLocaleString('ko-KR')+'원';
  return <fieldset disabled={disabled}><legend>시가·평가 원자료</legend>
    <div className="eq-grid">{field('company_name','회사명')}{field('eval_date','평가기준일','date')}
      <label>평가 목적<select data-testid="equity-raw-eval_purpose" value={r.eval_purpose||''} onChange={e=>set({eval_purpose:e.target.value,market_facts:{...m,purpose:e.target.value}})}><option value="">선택</option><option>증여</option><option>상속</option></select></label>
      {field('total_shares','발행주식총수 (주)')}{field('shares_evaluated','평가 대상 주식수 (주)')}{field('par_value','1주 액면가 (원)')}
    </div>
    <section className="eq-section"><h2>시가 후보와 검토 자료</h2><p>매매 등 후보의 실제 원자료를 입력합니다. 적격 여부·평가기간·채택 가액은 기존 엔진이 판정합니다. 빈 목록은 후보가 없음을 검토한 경우에만 그대로 두세요. 주식 감정가액은 시가로 채택되지 않으며 수용·경매 경로는 현재 별도 검토 대상입니다.</p>
      {(m.candidates||[]).map((c,i)=><section className="eq-section" key={i}><h3>시가 후보 {i+1}</h3><div className="eq-grid">
        <label>자료 구분명<input data-testid={'equity-market-id-'+i} value={c.id} onChange={e=>candidate(i,{id:e.target.value,...(c.committee_decision?{committee_decision:{...c.committee_decision,transaction_id:e.target.value}}:{})})}/></label>
        <label>후보 유형<select data-testid={'equity-market-kind-'+i} value={c.kind||''} onChange={e=>candidate(i,{kind:e.target.value})}><option value="">선택</option><option value="sale">매매</option><option value="appraisal">감정평가</option><option value="compensation">수용</option><option value="auction">경매</option></select></label>
        {[['price_per_share','1주당 거래가격 (원)','text'],['contract_date','매매계약일','date'],['transaction_shares','거래 주식수 (주)','text'],['evidence','계약·거래 자료 근거','text']].map(([k,label,type])=><label key={k}>{label}<input data-testid={'equity-market-'+k+'-'+i} type={type} value={c[k]??''} onChange={e=>candidate(i,{[k]:e.target.value||null})}/></label>)}
        {bool(c.related_party,v=>candidate(i,{related_party:v}),'equity-market-related-'+i,'특수관계 거래인가요?')}
        {bool(c.objectively_unfair,v=>candidate(i,{objectively_unfair:v}),'equity-market-unfair-'+i,'객관적으로 부당한 가격인가요?')}
      </div>
      {checkbox(!!c.committee_decision,v=>candidate(i,{committee_decision:v?{decision_date:null,transaction_id:c.id,legitimate_reason_confirmed:false,evidence:''}:null}),'equity-market-committee-'+i,'소액거래 예외에 관한 실제 위원회 결정 자료가 있습니다.')}
      {c.committee_decision&&<div className="eq-grid">{[['decision_date','위원회 결정일','date'],['evidence','결정 원문 근거','text']].map(([k,label,type])=><label key={k}>{label}<input data-testid={'equity-market-committee-'+k+'-'+i} type={type} value={c.committee_decision[k]??''} onChange={e=>candidate(i,{committee_decision:{...c.committee_decision,[k]:e.target.value||null}})}/></label>)}
      {checkbox(c.committee_decision.legitimate_reason_confirmed,v=>candidate(i,{committee_decision:{...c.committee_decision,legitimate_reason_confirmed:v}}),'equity-market-committee-confirmed-'+i,'이 거래를 대상으로 위원회가 정당한 사유를 인정한 결정임을 확인했습니다.')}</div>}
      <button type="button" data-testid={'equity-market-remove-'+i} onClick={()=>market({candidates:m.candidates.filter((_,j)=>j!==i)})}>후보 {i+1} 삭제</button></section>)}
      <button type="button" data-testid="equity-market-add" disabled={(m.candidates||[]).length>=100} onClick={()=>market({candidates:[...(m.candidates||[]),{id:window.crypto.randomUUID(),kind:'',price_per_share:null,contract_date:null,transaction_shares:null,related_party:null,objectively_unfair:null,evidence:''}]})}>시가 후보 추가</button>
      <div className="eq-grid"><label>전체 시가 후보 검토 근거<textarea data-testid="equity-market-evidence" value={m.evidence||''} onChange={e=>market({evidence:e.target.value})}/></label>
        <label>최대주주·할증 검토 근거<textarea data-testid="equity-market-premium-evidence" value={m.premium_evidence||''} onChange={e=>market({premium_evidence:e.target.value})}/></label>
        <label>최대주주·할증 처리<select data-testid="equity-market-premium" value={m.premium_treatment||''} onChange={e=>{
          const value=e.target.value;set({market_facts:{...m,premium_treatment:value},is_largest_shareholder:value?value!=='not_largest':null,...Object.fromEntries(exemptionFlags.map(k=>[k,false]))});
        }}><option value="">미확인</option><option value="not_largest">최대주주등 아님</option><option value="add_20_percent">최대주주등 · 20% 할증</option><option value="statutory_exempt">최대주주등 · 검토한 할증 면제</option></select></label>
        {m.premium_treatment==='statutory_exempt'&&<label>확인한 할증 면제 사실<select data-testid="equity-market-exemption" value={exemptionFlags.find(k=>r[k]===true)||''} onChange={e=>set(Object.fromEntries(exemptionFlags.map(k=>[k,k===e.target.value])))}><option value="">확인 후 선택</option>{[['is_sme','중소기업기본법상 중소기업'],['is_mid_size','법정 중견기업 · 직전 3개 연도 평균 매출 5천억원 미만(단기연도 연환산)'],['has_3yr_consecutive_loss','법인세법상 결손금의 계속 발생 요건 충족'],['all_shares_sold','평가기간 내 최대주주등 보유 전량을 적격 매매가액으로 매각'],['is_deemed_gift_calc','시행령 제28조·제29조·제29조의2·제29조의3·제30조 이익 계산'],['is_subsidiary_eval','평가대상 발행법인이 최대주주등인 피출자법인 주식의 평가'],['is_startup_no_profit','3년 이내 사업개시 · 개시연도부터 직전연도까지 매년 기업회계상 영업이익 0 이하'],['is_liquidation_confirmed','상속세·증여세 신고기한 내 청산 확정'],['is_non_largest_recipient','최대주주등 보유분을 기존 최대주주등 외의 자가 합산기간 내 상속·증여받고 취득 뒤에도 최대주주등 아님'],['is_nominee_gift','실소유자·명의자가 달라 상증법 제45조의2에 해당하는 명의신탁 증여의제']].map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>}
      </div>
      {checkbox(m.all_candidates_reviewed,v=>market({all_candidates_reviewed:v},true),'equity-market-reviewed','모든 시가 후보를 빠짐없이 검토했습니다.')}
      {checkbox(m.no_committee_extension,v=>market({no_committee_extension:v},true),'equity-market-no-extension','평가기간 밖 위원회 인정가액이 없음을 확인했습니다.')}
      {checkbox(m.premium_eligibility_reviewed,v=>market({premium_eligibility_reviewed:v},true),'equity-market-premium-reviewed','1년 소급 처분 등 최대주주·할증 적용 및 면제 요건을 검토했습니다.')}
    </section>
    <section className="eq-section"><h2>적격 시가가 없을 때의 보충평가 원자료</h2>
      <label>입력 경로<select data-testid="equity-raw-supplement-mode" value={s?'supplement':'market'} onChange={e=>{
        if(!window.confirm('보충평가 입력 경로를 바꾸면 현재 보충 원자료를 비웁니다. 저장된 과거 버전은 유지됩니다.'))return;
        const enabled=e.target.value==='supplement';const next={...r,market_facts:m};
        if(enabled)Object.assign(next,{reviewed_supplement_facts:{schema_version:'stock-supplement/office-2',valuation_date:r.eval_date||null,assets:[],liabilities:[],statutory_equity:null,equity_evidence:'',review:{},evidence:'',profit_years:[2025,2024,2023].map(year=>({year,evidence:'',period_start:null,period_end:null})),goodwill:{purchased_intangibles:null,purchased_evidence:'',review_evidence:'',ordinary_five_years_confirmed:false,no_duplicates_confirmed:false}},
          taxable_income:[null,null,null],corporate_tax_amounts:[null,null,null],adjustment_add:[null,null,null],adjustment_sub:[null,null,null],fiscal_year_shares:[null,null,null],include_goodwill:true});
        else for(const key of ['reviewed_supplement_facts','taxable_income','corporate_tax_amounts','adjustment_add','adjustment_sub','fiscal_year_shares','assets_appraised','liabilities_book','equity_capital','include_goodwill','years_since_start','remaining_years','real_estate_ratio','stock_ratio'])delete next[key];
        onChange(equityRawInvalidate(next));
      }}><option value="market">시가 후보만 입력</option><option value="supplement">보충평가 원자료도 입력</option></select></label>
      {s&&<><label>보충평가 검토 범위<select data-testid="equity-raw-supplement-contract" value={s.schema_version} onChange={e=>{
          const office=e.target.value==='stock-supplement/office-2';const next={...s,schema_version:e.target.value,review:{}};
          if(office){next.profit_years=[2025,2024,2023].map(year=>({year,evidence:'',period_start:null,period_end:null}));next.goodwill={purchased_intangibles:null,purchased_evidence:'',review_evidence:'',ordinary_five_years_confirmed:false,no_duplicates_confirmed:false};delete next.purchased_intangibles;delete next.purchased_evidence;}else{delete next.goodwill;next.purchased_intangibles=null;next.purchased_evidence='';next.profit_years=s.profit_years||[2025,2024,2023].map(year=>({year,evidence:'',period_start:null,period_end:null}));}
          set({reviewed_supplement_facts:next});
        }}><option value="stock-supplement/office-2">2026-10-01~10-17 업무용 일반 3:2·영업권 원자료</option><option value="stock-supplement/1">2026-06-30 공개 검증 범위</option></select></label>
        <p>{s.schema_version==='stock-supplement/office-2'?'업무용 10월 지원 범위입니다. 영업권 합산 대상·지속연수 5년과 모든 자산의 중복 제외를 검토합니다.':'6월 말 공개 범위는 일반 3:2·영업권 초과이익 0 이하·모든 단계 정수원 완결입니다.'} 적격 시가가 있으면 시가가 우선하며, 다른 기준일·평가특례와 미확인 사실은 엔진의 보완·미지원 사유를 확인하세요.</p>
        {s.schema_version==='stock-supplement/1'&&<div className="eq-grid"><label>영업권 포함 매입 무체재산권 평가액 (원)<input data-testid="equity-raw-purchased-intangibles" value={s.purchased_intangibles??''} onChange={e=>supplement({purchased_intangibles:e.target.value||null})}/></label><label>매입 무체재산권이 실제 없음을 확인한 근거<input data-testid="equity-raw-purchased-evidence" value={s.purchased_evidence||''} onChange={e=>supplement({purchased_evidence:e.target.value})}/></label><p>6월 말 공개 범위는 매입 무체재산권이 실제 없어 0원임을 확인한 경우만 지원합니다. 빈칸을 0원으로 바꾸지 않으며, 0원 초과는 별도 검토합니다.</p></div>}
        {s.goodwill&&<section className="eq-section"><h3>영업권 평가 원자료</h3><p>아래 자산 명세에서는 영업권과 그에 포함되는 매입 무체재산권을 제외합니다. 확인된 영업권·매입 무체재산권을 다른 자산에 다시 더하지 마세요.</p><div className="eq-grid">{[['purchased_intangibles','영업권 포함 매입 무체재산권 평가액 (없으면 0원)'],['purchased_evidence','매입 무체재산권 평가·귀속 근거'],['review_evidence','영업권 합산 대상·지속연수·중복 검토 근거']].map(([key,label])=><label key={key}>{label}<input data-testid={'equity-raw-goodwill-'+key} value={s.goodwill[key]??''} onChange={e=>supplement({goodwill:{...s.goodwill,[key]:e.target.value||null}})}/></label>)}</div>
        {checkbox(s.goodwill.ordinary_five_years_confirmed,v=>supplement({goodwill:{...s.goodwill,ordinary_five_years_confirmed:v}},true),'equity-raw-goodwill-five-years','영업권 합산 제외에 해당하지 않고 지속연수 5년 적용을 검토했습니다.')}
        {checkbox(s.goodwill.no_duplicates_confirmed,v=>supplement({goodwill:{...s.goodwill,no_duplicates_confirmed:v}},true),'equity-raw-goodwill-no-duplicates','영업권·매입 무체재산권의 자산 중복이 없음을 검토했습니다.')}</section>}
        <div className="eq-grid">{field('years_since_start','사업개시 후 연수')}{field('remaining_years','남은 존속연수')}{field('real_estate_ratio','부동산 비율 (0~1)')}{field('stock_ratio','다른 법인 주식 비율 (0~1)')}
          <label>영업권을 더하기 전의 법정 순자산가액 (원)<input data-testid="equity-raw-statutory-equity" value={s.statutory_equity??''} onChange={e=>{const value=e.target.value||null;set({equity_capital:value,reviewed_supplement_facts:{...s,statutory_equity:value}});}}/></label>
          <label>자기자본 평가 근거<input data-testid="equity-raw-equity-evidence" value={s.equity_evidence||''} onChange={e=>supplement({equity_evidence:e.target.value})}/></label>
        </div>
        <div data-testid="equity-raw-asset-summary" aria-live="polite"><p>입력 명세 기준 자산 합계 {money(summary.assets)} / 부채 합계 {money(summary.liabilities)} / 영업권 합산 전 순자산 {money(summary.net)} / 입력한 법정 자기자본 {money(summary.equity)}</p><p>자산과 부채의 법정 평가·조정을 먼저 확인한 뒤 영업권을 더하기 전의 법정 순자산가액과 자기자본 입력을 대조하세요.</p>{summary.mismatch&&<p>명세의 순자산과 입력 자기자본이 다릅니다. 채택한 자산·부채와 평가 근거를 다시 확인해 주세요.</p>}</div>
        {[0,1,2].map(i=><section className="eq-section" key={i}><h3>{`${2025-i}년 (12월 말 결산)`} 소득·조정 원자료</h3>{<><label>{2025-i}년 신고·세무조정 원자료 근거<input data-testid={'equity-raw-profit-evidence-'+i} value={s.profit_years?.[i]?.evidence||''} onChange={e=>supplement({profit_years:[2025,2024,2023].map((year,j)=>({...s.profit_years?.[j],year,evidence:j===i?e.target.value:s.profit_years?.[j]?.evidence||''}))})}/></label>
        {checkbox(s.profit_years?.[i]?.period_start===`${2025-i}-01-01`&&s.profit_years?.[i]?.period_end===`${2025-i}-12-31`,v=>supplement({profit_years:[2025,2024,2023].map((year,j)=>({...s.profit_years?.[j],year,...(j===i?{period_start:v?`${year}-01-01`:null,period_end:v?`${year}-12-31`:null}:{})}))}),'equity-raw-profit-period-'+i,`신고·조정 원자료에서 실제 사업기간이 ${2025-i}-01-01~${2025-i}-12-31(1년)임을 확인했습니다.`)}
        <p>단기 사업연도 등 다른 실제 기간은 이 업무용 범위에서 별도 검토합니다. 확인 전에는 기간을 전송하지 않습니다.</p></>}<div className="eq-grid">{[['taxable_income','각 사업연도 소득 (원)'],['corporate_tax_amounts','차감 법인세·지방세·농특세 (원)'],['adjustment_add','가산조정 (원)'],['adjustment_sub','차감조정 (원)'],['fiscal_year_shares','해당 연도 발행주식수 (주)']].map(([k,label])=><label key={k}>{label}<input data-testid={'equity-raw-'+k+'-'+i} value={r[k]?.[i]??''} onChange={e=>set({[k]:[0,1,2].map(j=>j===i?e.target.value||null:r[k]?.[j]??null)})}/></label>)}</div></section>)}
        {['assets','liabilities'].map(key=><section className="eq-section" key={key}><h3>{key==='assets'?'자산':'부채'} 법정 평가 명세</h3>{s[key].map((line,i)=><div className="eq-grid" key={i}>{[['id','자료 구분명'],['amount','법정 평가완료 가액 (원)'],['evidence','평가·채택 근거']].map(([k,label])=><label key={k}>{label}<input data-testid={'equity-raw-'+key+'-'+k+'-'+i} value={line[k]??''} onChange={e=>lineSet(key,i,{[k]:e.target.value||null})}/></label>)}<button type="button" data-testid={'equity-raw-'+key+'-remove-'+i} onClick={()=>supplement({[key]:s[key].filter((_,j)=>j!==i)})}>명세 {i+1} 삭제</button></div>)}<button type="button" data-testid={'equity-raw-'+key+'-add'} disabled={s[key].length>=1000} onClick={()=>supplement({[key]:[...s[key],{id:window.crypto.randomUUID(),amount:null,evidence:''}]})}>명세 추가</button><p>실제 명세가 없으면 비워 두고 아래 전체 검토를 확인하세요. 빈 금액을 0원으로 바꾸지 않습니다.</p></section>)}
        <label>보충평가 전체 검토 근거<textarea data-testid="equity-raw-supplement-evidence" value={s.evidence||''} onChange={e=>supplement({evidence:e.target.value})}/></label>
        {EQ_RAW_REVIEW_KEYS.map(([key,label])=>checkbox(s.review?.[key],v=>supplement({review:{...s.review,[key]:v}},true),'equity-raw-review-'+key,label))}
      </>}
    </section>
    <p>빈칸·미확인은 사실이 확인된 0원·아니오와 구분해 저장합니다. 입력을 바꾸면 검토 확인을 다시 받으며, 계산은 저장된 입력으로만 실행합니다.</p>
  </fieldset>;
}

/* Saved equity cases use the same authenticated client/case workbench. */
let jtEquitySession = null;
function equityDirty(w = jtEquitySession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
function JTEquityCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtEquitySession);
  const [opened,setOpened] = React.useState(false);
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [revision,setRevision] = React.useState('');
  const errorRef = React.useRef(null);
  React.useEffect(()=>{if(error)errorRef.current?.scrollIntoView({block:'center'});},[error]);
  const keys = React.useRef({});
  const remember = value => { ref.current = value; jtEquitySession = value; if (alive.current) setW(value); };
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),45000);
    try {
      const r = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/,'') + path,
        {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (r.status === 401) jtGiftSession.token = '';
        const messages={REVISION_CONFLICT:'다른 저장본이 있습니다. 다시 열어 확인해 주세요.',SNAPSHOT_MIGRATION_REQUIRED:'지원하지 않는 저장 버전입니다.',PARTY_OUTSIDE_CLIENT:'선택한 당사자가 이 고객의 자료가 아닙니다.',INVALID_CASE_INPUT:'금액과 중복 입력을 확인해 주세요.',DRAFT_NOT_RUNNABLE:'저장본의 보완 항목을 확인해 주세요.',ENGINE_CALCULATION_ERROR:'계산 입력을 추가 확인해야 합니다. 결과는 저장되지 않았습니다.'};
        const detail=['DRAFT_NOT_RUNNABLE','ENGINE_NEEDS_INPUT','ENGINE_UNSUPPORTED'].includes(data.detail?.code) ? (typeof data.detail.message==='string'?data.detail.message:Array.isArray(data.detail.errors)?data.detail.errors.join(' / '):'') : '';
        throw new Error(r.status===401?'로그인이 필요합니다. 작업대로 돌아가 같은 계정으로 로그인하세요.':
          detail || messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({path,method,body,etag});
    const memory = path==='/v1/equity-cases' ? keys.current : ref.current?.keys || keys.current;
    return api(path,{method,body:JSON.stringify(body),headers:{'Idempotency-Key':memory[signature] ||= window.crypto.randomUUID(),...(etag?{'If-Match':etag}:{})}});
  };
  const act = async fn => {
    if (lock.current) return;
    lock.current=true;setBusy(true);setError('');
    try { await fn(); } catch(e) { if(alive.current)setError(e instanceof TypeError || e.name==='AbortError'?
      '응답을 받지 못했습니다. 입력은 유지됩니다. 같은 작업을 다시 누르면 저장 여부를 확인합니다.':e.message); }
    finally {lock.current=false;if(alive.current)setBusy(false);}
  };
  const load = async (id, number='') => {
    const saved = await api('/v1/equity-cases/'+id+(number?'?revision='+number:''));
    if(saved.client_id!==clientId)throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id?await api('/v1/equity-cases/'+id+'/runs/'+saved.last_successful_run_id):null;
    remember({uid:jtGiftSession.uid,meta:saved,label:saved.label,draft:saved.draft,run,keys:ref.current?.keys || keys.current,
      baseline:JSON.stringify({label:saved.label,draft:saved.draft})});
    if(alive.current)setOpened(true);
  };
  React.useEffect(()=>{
    alive.current=true;
    act(async()=>{
      if(caseId==='resume' && ref.current?.meta?.client_id===clientId){if(ref.current.uid!==jtGiftSession.uid)throw new Error('편집하던 계정으로 다시 로그인해 주세요.');setOpened(true);return;}

      if(caseId)await load(caseId);
      else {
        const made=await mutation('/v1/equity-cases','POST',{client_id:clientId,label:'새 주식평가 사건',draft:{schema_version:'equity-case/2',valuation_input:equityRawDefault()}});
        await load(made.case_id);
      }
    });
    const protect=e=>{if(lock.current||equityDirty(ref.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};
  },[]);
  const current = opened && w?.meta?.client_id===clientId && (caseId==='resume'||!caseId||w.meta.case_id===caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision!==w.meta.current_revision;
  const base = current?'/v1/equity-cases/'+w.meta.case_id:'';
  if(current&&w.meta.read_only)return <div><button onClick={onExit}>작업대로</button><p>지원하지 않는 입력 버전입니다. 읽기 전용 원본을 보존합니다.</p><pre>{JSON.stringify(w.meta.case_input,null,2)}</pre></div>;
  const change = (key,value,confirmation=false) => remember({...ref.current,draft:{...ref.current.draft,...(confirmation?{}:{ordinary_scope_confirmed:false,no_market_price_confirmed:false,unchanged_shares_confirmed:false,not_largest_group_confirmed:false,adjusted_amounts_confirmed:false,...(ref.current.draft.goodwill?{goodwill:{...ref.current.draft.goodwill,ordinary_five_years_confirmed:false,no_duplicates_confirmed:false}}:{})}),[key]:value}});
  const save=async()=>{if(!equityDirty(ref.current))return ref.current.meta;const draft=ref.current.draft.schema_version==='equity-case/2'?equityRawPrepare(ref.current.draft):ref.current.draft;const saved=await mutation(base,'PUT',{label:ref.current.label,draft},ref.current.meta.etag);await load(saved.case_id);return ref.current.meta;};
  const d=current?w.draft:null;
  const rawMode=d?.schema_version==='equity-case/2';
  const confirmations=[
    ['ordinary_scope_confirmed','12월 말 결산·사업 3년 이상 일반 법인입니다. 부동산과다·주식과다·휴폐업/청산·존속기한 3년 이내·상장 추진·특례 평가·자기주식은 없습니다.'],
    ['no_market_price_confirmed','시가 우선 적용 여부를 검토했고 시가 산정이 어려워 보충적 평가를 적용합니다.'],
    ['unchanged_shares_confirmed','최근 3개 사업연도와 평가일까지 증감자·합병·분할·주식수 변동이 없으며 연도말 발행주식총수가 모두 같습니다.'],
    ['not_largest_group_confirmed','평가 주식은 최대주주등 및 그 특수관계인 보유 주식에 해당하지 않습니다.'],
    ['adjusted_amounts_confirmed','순손익은 세법상 가감 조정 후 금액이며 자산·부채는 자산별 평가와 영업권·각종 조정까지 완료한 금액입니다.']
  ];
  const field=(key,label,type='text')=><label key={key}>{label}<input data-testid={'equity-'+key} type={type} value={d[key]??''} onChange={e=>change(key,e.target.value||null)}/></label>;
  return <div className="jt-container cw-workspace">
    <style>{`.eq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.eq-grid label{display:flex;flex-direction:column;gap:6px}.eq-grid input,.eq-grid textarea,.eq-grid select{font:inherit;padding:10px;min-height:44px}.eq-section{padding:20px;border:1px solid #ccd8cd;margin:20px 0;border-radius:10px}.eq-section p{line-height:1.7}.eq-section button{min-height:44px}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>비상장주식 평가 사건</h1>
    <p>시가 후보와 평가 원자료를 저장하고 기존 평가 엔진으로 새 계산을 실행합니다. 검토가 끝나지 않은 입력도 초안으로 저장하고 다시 열 수 있습니다. 자료의 법적 적격성은 검토한 사실로 입력하며 자동 인증하지 않습니다.</p>
    <p>시가 경로는 2026-01-01~10-28, 업무용 일반 3:2 보충평가는 2026-10-01~10-17 범위입니다. 별도 6월 말 공개 검증 경로도 선택할 수 있습니다. 지원 범위 밖이거나 자료가 모자라면 사유를 표시하고 새 평가액을 저장하지 않습니다. 저장한 평가는 같은 고객·날짜·목적의 증여·상속 사건에서 가져올 수 있습니다.</p>
    {error&&<p ref={errorRef} data-testid="equity-error" role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/equity-cases','POST',{client_id:clientId,label:'새 주식평가 사건',draft:{schema_version:'equity-case/2',valuation_input:equityRawDefault()}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{equityDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      {!rawMode&&<section className="eq-section"><h2>종전 검토 완료 총액 저장본</h2><p>이 양식의 원본·과거 결과를 보존합니다. 시가 검토가 없는 종전 입력으로 새 평가를 실행하지 않습니다. 새 원자료 입력으로 전환한 뒤 저장하면 별도 입력 버전이 만들어집니다.</p><button type="button" data-testid="equity-upgrade-raw" disabled={busy||readonly} onClick={()=>{if(window.confirm('종전 입력과 과거 결과를 보존하고 원자료 입력으로 전환할까요? 회사명·평가기준일·목적·주식수만 가져오며 검토 확인은 다시 받습니다.'))remember({...ref.current,draft:{schema_version:'equity-case/2',valuation_input:equityRawDefault(ref.current.draft)}});}}>시가·평가 원자료로 새 입력 버전 작성</button></section>}
      {rawMode?<><div className="eq-grid"><label>사건명<input data-testid="equity-label" disabled={busy||readonly} value={w.label} onChange={e=>remember({...ref.current,label:e.target.value})}/></label></div><JTEquityRawInputs input={d.valuation_input||equityRawDefault()} onChange={input=>remember({...ref.current,draft:{schema_version:'equity-case/2',valuation_input:input}})} disabled={busy||readonly}/></>:<fieldset disabled={busy||readonly}><legend>종전 평가 사실·검토 자료</legend>
      <div className="eq-grid"><label>사건명<input data-testid="equity-label" value={w.label} onChange={e=>remember({...w,label:e.target.value})}/></label>
        {field('company_name','회사명')}{field('eval_date','평가기준일','date')}
        <label>평가 목적<select data-testid="equity-eval_purpose" value={d.eval_purpose} onChange={e=>change('eval_purpose',e.target.value)}><option>증여</option><option>상속</option></select></label>
        {field('total_shares','평가기준일 발행주식총수 (주)')}{field('shares_evaluated','평가 대상 주식수 (주)')}
      </div>
      <section className="eq-section"><h2>순손익 조정 완료 자료</h2><p>회계상 당기순이익을 그대로 넣지 마세요. 법인세 등 차감·가산 조정을 모두 검토한 순손익액과 근거를 입력하세요.</p>
        {[2025,2024,2023].map(year=>{
          const row=d.profits.find(p=>p.year===year)||{year,net_profit:null,source:''};
          const update=next=>change('profits',[2025,2024,2023].map(y=>y===year?next:d.profits.find(p=>p.year===y)||{year:y,net_profit:null,source:''}));
          const set=(k,v)=>update({...row,...(row.detail?{detail:{...row.detail,review_complete:false}}:{}),[k]:v});
          const setDetail=patch=>update({...row,detail:{...row.detail,review_complete:false,...patch}});
          return <section className="eq-section" key={year}><h3>{year}년 순손익</h3>
            <label>입력 방식<select data-testid={'equity-profit-mode-'+year} value={row.detail?'details':'totals'} onChange={e=>{
              if(!window.confirm('이 연도의 순손익 총액·명세·근거를 비웁니다. 과거 저장본은 유지됩니다.'))return;
              update({year,net_profit:null,source:'',...(e.target.value==='details'?{detail:{income_base:null,base_source:'',adjustments:[],review_complete:false}}:{})});
            }}><option value="totals">검토 완료 순손익 총액</option><option value="details">각 사업연도소득과 검토된 가감 명세</option></select></label>
            {row.detail?<>
              <p>회계상 당기순이익이 아닌 법인세 각 사업연도소득에서 시작합니다. 적용할 가산·차감 금액과 연도 귀속을 검토한 뒤 입력하세요. 법적 인정·환입 안분·감가상각 조정을 자동 판정하지 않습니다.</p>
              <div className="eq-grid"><label>각 사업연도소득 (원)<input data-testid={'equity-profit-base-'+year} value={row.detail.income_base??''} onChange={e=>setDetail({income_base:e.target.value})}/></label>
              <label>기초 소득의 신고·조정 근거<input data-testid={'equity-profit-base-source-'+year} value={row.detail.base_source} onChange={e=>setDetail({base_source:e.target.value})}/></label></div>
              {row.detail.adjustments.map((line,i)=>{const lineSet=(k,v)=>setDetail({adjustments:row.detail.adjustments.map(x=>x.local_id===line.local_id?{...x,[k]:v}:x)});return <div className="eq-section" key={line.local_id}><div className="eq-grid">
                <label>가감 구분<select data-testid={'equity-profit-direction-'+year+'-'+i} value={line.direction} onChange={e=>lineSet('direction',e.target.value)}><option value="add">가산</option><option value="subtract">차감</option></select></label>
                {[['account','조정 항목명'],['amount','검토 완료 금액 (원)'],['source','신고·조정 자료 근거'],['reason','가감 및 연도 귀속 검토 사유']].map(([k,label])=><label key={k}>{label}<input data-testid={'equity-profit-'+k+'-'+year+'-'+i} value={line[k]??''} onChange={e=>lineSet(k,e.target.value)}/></label>)}
              </div><button data-testid={'equity-profit-remove-'+year+'-'+i} onClick={()=>setDetail({adjustments:row.detail.adjustments.filter(x=>x.local_id!==line.local_id)})}>조정 항목 삭제</button></div>})}
              <button data-testid={'equity-profit-add-'+year} disabled={row.detail.adjustments.length>=100} onClick={()=>setDetail({adjustments:[...row.detail.adjustments,{local_id:window.crypto.randomUUID(),direction:'add',account:'',amount:null,source:'',reason:''}]})}>가감 항목 추가</button>
              <label style={{display:'block'}}><input data-testid={'equity-profit-reviewed-'+year} type="checkbox" checked={row.detail.review_complete} onChange={e=>setDetail({review_complete:e.target.checked})}/>가산·차감의 누락·중복·연도 귀속을 검토했습니다(항목이 없으면 조정 없음 확인).</label>
              <p>기초 소득 + 가산 합계 − 차감 합계는 저장 시 서버가 계산합니다. 기초·항목·가산/차감 합계·최종 순손익은 각각 0~1조 원 범위입니다.</p>
            </>:<label>조정 완료 순손익 (원)<input data-testid={'equity-profit-'+year} value={row.net_profit??''} onChange={e=>set('net_profit',e.target.value)}/></label>}
            <label>{year}년 전체 순손익 조정 검토 근거<input data-testid={'equity-source-'+year} value={row.source} onChange={e=>set('source',e.target.value)}/></label>
          </section>;
        })}
      </section>
      <section className="eq-section"><h2>순자산 조정 완료 자료</h2>
        <label>입력 방식<select data-testid="equity-asset_input_mode" value={d.asset_input_mode||'totals'} onChange={e=>{
          if(!window.confirm('입력 방식을 바꾸면 현재 명세·총액·조정 근거를 비웁니다. 저장된 과거 버전은 유지됩니다.'))return;
          const next={...ref.current.draft,asset_input_mode:e.target.value,goodwill:null,net_asset_lines:[],adjusted_assets:null,adjusted_liabilities:null,asset_source:'',ordinary_scope_confirmed:false,no_market_price_confirmed:false,unchanged_shares_confirmed:false,not_largest_group_confirmed:false,adjusted_amounts_confirmed:false};
          remember({...ref.current,draft:next});
        }}><option value="totals">검토 완료 총액</option><option value="details">자산·부채별 명세 합산</option></select></label>
        {d.asset_input_mode==='details'?<>
          <p>각 항목의 장부금액과 세법 검토·조정이 끝난 최종 금액을 입력합니다. 차이가 있으면 채택 사유를 남깁니다. 자산 행에는 영업권을 포함하지 않고 별도 영업권 행 하나에 입력합니다. 영업권·부채가 없으면 0원과 검토 근거를 명시하세요.</p>
          <label>영업권 입력 방식<select data-testid="equity-goodwill-mode" value={d.goodwill?'sources':'reviewed'} onChange={e=>{
            if(!window.confirm('현재 영업권 입력과 영업권 행을 비웁니다. 저장된 과거 버전은 유지됩니다.'))return;
            const next={...d,net_asset_lines:(d.net_asset_lines||[]).filter(x=>x.kind!=='goodwill'),goodwill:e.target.value==='sources'?{treatment:'unconfirmed',equity_capital:null,capital_source:'',purchased_intangibles:null,purchased_source:'',review_source:'',ordinary_five_years_confirmed:false,no_duplicates_confirmed:false}:null,ordinary_scope_confirmed:false,no_market_price_confirmed:false,unchanged_shares_confirmed:false,not_largest_group_confirmed:false,adjusted_amounts_confirmed:false};
            remember({...ref.current,draft:next});
          }}><option value="reviewed">검토 완료 영업권 행</option><option value="sources">순손익·자기자본 원본 연결 계산</option></select></label>
          {d.goodwill&&<section className="eq-section"><h3>영업권 원본 연결</h3>
            <p>위 3개년 순손익과 아래 증빙 자기자본으로 초과이익을 산정하고 원칙적 5년·연 10%로 환산합니다. 영업권에 포함되는 매입 무체재산권의 평가액이 더 크면 그 금액을 채택합니다. 해당 무체재산권과 영업권은 다른 자산 행에 넣지 마세요. 청산·휴폐업·3년 미만·계속 결손 등 법정 제외 사건과 자기자본 추정·예외 지속연수는 현재 자동 연결 범위 밖입니다.</p>
            <label>합산 판단<select data-testid="equity-goodwill-treatment" value={d.goodwill.treatment} onChange={e=>change('goodwill',{...d.goodwill,treatment:e.target.value,ordinary_five_years_confirmed:false,no_duplicates_confirmed:false})}><option value="unconfirmed">미확인</option><option value="include">일반법인 합산 대상</option><option value="statutory_excluded">법정 합산 제외 (자동 계산 미지원)</option></select></label>
            <div className="eq-grid">{[['equity_capital','평가기준일 증빙 자기자본 (원)'],['capital_source','자기자본 증빙·확정 근거'],['purchased_intangibles','영업권 포함 매입 무체재산권 평가액 (없으면 0원)'],['purchased_source','매입 무체재산권 평가·귀속 근거 (없으면 없음 확인)'],['review_source','합산 대상·5년 지속연수·자산 중복 검토 근거']].map(([k,label])=><label key={k}>{label}<input data-testid={'equity-goodwill-'+k} value={d.goodwill[k]??''} onChange={e=>change('goodwill',{...d.goodwill,[k]:e.target.value,ordinary_five_years_confirmed:false,no_duplicates_confirmed:false})}/></label>)}</div>
            {[['ordinary_five_years_confirmed','법정 합산 제외에 해당하지 않고 영업권 지속연수 5년을 적용함을 검토했습니다.'],['no_duplicates_confirmed','영업권과 이에 포함되는 매입 무체재산권이 다른 자산 행에 들어 있지 않으며 누락·중복이 없음을 검토했습니다.']].map(([k,label])=><p key={k}><label><input data-testid={'equity-goodwill-'+k} type="checkbox" checked={d.goodwill[k]} onChange={e=>change('goodwill',{...d.goodwill,[k]:e.target.checked})}/>{label}</label></p>)}
          </section>}
          {(d.net_asset_lines||[]).map((row,i)=>{const set=(k,v)=>change('net_asset_lines',d.net_asset_lines.map(x=>x.local_id===row.local_id?{...x,[k]:v}:x));return <section className="eq-section" key={row.local_id}>
            <div className="eq-grid"><label>구분<select data-testid={'equity-line-kind-'+i} value={row.kind} onChange={e=>set('kind',e.target.value)}><option value="asset">영업권 외 자산</option><option value="liability">부채</option>{!d.goodwill&&<option value="goodwill">영업권</option>}</select></label>
            {[['account','계정명'],['book_amount','장부금액 (원)'],['reviewed_amount','조정 완료 금액 (원)'],['source','평가·조정 근거'],['adjustment_reason','차액 채택 사유']].map(([key,label])=><label key={key}>{label}<input data-testid={'equity-line-'+key+'-'+i} value={row[key]??''} onChange={e=>set(key,e.target.value)}/></label>)}
            </div><button onClick={()=>change('net_asset_lines',d.net_asset_lines.filter(x=>x.local_id!==row.local_id))}>명세 {i+1} 삭제</button>
          </section>})}
          <button disabled={(d.net_asset_lines||[]).length>=100} onClick={()=>change('net_asset_lines',[...(d.net_asset_lines||[]),{local_id:window.crypto.randomUUID(),kind:'asset',account:'',book_amount:null,reviewed_amount:null,source:'',adjustment_reason:''}])}>명세 항목 추가</button>
          <p>합계와 차액은 저장할 때 서버에서 계산합니다. 아래 저장된 명세 요약은 마지막 저장본 기준입니다.</p>
        </>:<div className="eq-grid">{field('adjusted_assets','영업권 포함 조정 후 자산 합계 (원)')}{field('adjusted_liabilities','조정 후 부채 합계 (원)')}</div>}
        <div className="eq-grid">
        <label>자산별 평가·영업권·부채 조정 근거<textarea data-testid="equity-asset_source" value={d.asset_source} onChange={e=>change('asset_source',e.target.value)}/></label>
        <label>적용 범위 검토 근거<textarea data-testid="equity-review_note" value={d.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      </div></section>
      {confirmations.map(([key,label])=><p key={key}><label><input data-testid={'equity-'+key} type="checkbox" checked={d[key]} onChange={e=>change(key,e.target.checked,true)}/>{label}</label></p>)}
      </fieldset>}
      {w.meta.case_input?.asset_worksheet&&<section className="eq-section" aria-label="저장된 명세 요약"><h2>저장된 명세 요약{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p data-testid="equity-worksheet-total">자산 {w.meta.case_input.asset_worksheet.adjusted_assets.toLocaleString('ko-KR')}원 / 부채 {w.meta.case_input.asset_worksheet.adjusted_liabilities.toLocaleString('ko-KR')}원 / 순자산 {w.meta.case_input.asset_worksheet.net_assets.toLocaleString('ko-KR')}원</p><ul>{w.meta.case_input.asset_worksheet.lines.map(row=><li key={row.local_id}>{row.account}: 조정 완료 {row.reviewed_amount?.toLocaleString('ko-KR')??'미입력'}원 · 장부 대비 차액 {row.difference?.toLocaleString('ko-KR')??'미확정'}원</li>)}</ul></section>}
      {w.meta.case_input?.goodwill_worksheet&&<section className="eq-section"><h2>저장된 영업권 산정표{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p data-testid="equity-goodwill-total">영업권 {w.meta.case_input.goodwill_worksheet.goodwill.toLocaleString('ko-KR')}원 · 초과이익 {w.meta.case_input.goodwill_worksheet.excess_income.toLocaleString('ko-KR')}원 · 환산액 {w.meta.case_input.goodwill_worksheet.converted_goodwill.toLocaleString('ko-KR')}원</p><p>채택 사유: {({positive_excess:'초과이익 환산액',purchased_floor:'영업권 포함 매입 무체재산권 평가액',zero_excess:'양의 초과이익 및 매입 무체재산권 평가액 없음'})[w.meta.case_input.goodwill_worksheet.outcome]}</p><p>원본 해시 {w.meta.case_input.goodwill_worksheet.source_hash}</p></section>}
      {w.meta.case_input?.profit_worksheet&&<section className="eq-section" aria-label="저장된 순손익 명세"><h2>저장된 순손익 명세{equityDirty(w)?' · 수정 전 입력 기준':''}</h2>{w.meta.case_input.profit_worksheet.map(p=><div key={p.year}><p data-testid={'equity-profit-total-'+p.year}>{p.year}년: {p.income_base?.toLocaleString('ko-KR')??'미입력'} + {p.additions.toLocaleString('ko-KR')} − {p.deductions.toLocaleString('ko-KR')} = {p.net_profit?.toLocaleString('ko-KR')??'미확정'}원</p><ul>{p.adjustments.map(a=><li key={a.local_id}>{a.direction==='add'?'가산':'차감'} · {a.account}: {a.amount?.toLocaleString('ko-KR')??'미입력'}원 · {a.reason}</li>)}</ul></div>)}</section>}
      {(w.meta.validation.errors||[]).length>0&&<section><p>마지막 저장 기준 확인 항목</p><ul>{w.meta.validation.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></section>}
      <button data-testid="equity-save" disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
      <button data-testid="equity-calculate" disabled={busy||readonly} onClick={()=>act(async()=>{const saved=await save();if(!saved.validation.can_run)throw new Error((saved.validation.errors||[]).join(' / ')||'저장본의 보완 항목을 확인해 주세요.');await mutation(base+'/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});await load(saved.case_id);})}>저장하고 계산</button>
      <label>다시 열 입력 버전<input data-testid="equity-reopen-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button disabled={busy} onClick={()=>{if(!equityDirty(w)||window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?'))act(()=>load(w.meta.case_id,revision));}}>저장본 다시 열기</button>
      {w.run&&<section className="eq-section" aria-label="저장된 평가 결과"><h2>저장된 평가 결과{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p>1주당 가액 {w.run.response_snapshot.calc['최종_1주당가액'].toLocaleString('ko-KR')}원 × {w.run.engine_request.shares_evaluated.toLocaleString('ko-KR')}주</p><output data-testid="equity-total">{w.run.response_snapshot.calc['총평가액'].toLocaleString('ko-KR')}원</output>
        {rawMode&&w.run.engine_request.reviewed_supplement_facts&&w.run.response_snapshot.calc['시가적용']===false&&<div>
          {Number.isSafeInteger(w.run.response_snapshot.calc['영업권'])&&<p data-testid="equity-goodwill-result">계산에 반영된 영업권 {w.run.response_snapshot.calc['영업권'].toLocaleString('ko-KR')}원</p>}
          {Number.isSafeInteger(w.run.response_snapshot.calc['순자산가액'])&&<p data-testid="equity-nav-result">영업권 반영 후 순자산가액 {w.run.response_snapshot.calc['순자산가액'].toLocaleString('ko-KR')}원</p>}
        </div>}
        <p>결과 ID {w.run.run_id} · 입력 ID {w.run.revision_id}</p>{rawMode?<><p>평가 방법: {w.run.response_snapshot.calc['평가방법']} · {w.run.response_snapshot.calc['시가적용']?'시가 채택':'보충평가'} · 이 결과는 위 결과 ID의 저장된 입력에만 대응합니다.</p>{(w.run.response_snapshot.calc['경고사항']||[]).map((message,i)=><p key={i}>{message}</p>)}{w.run.response_snapshot.calc['시가검토']&&<details><summary>시가 후보 검토 내역</summary><pre>{JSON.stringify(w.run.response_snapshot.calc['시가검토'],null,2)}</pre></details>}</>:<p>입력한 자산·부채는 조정 완료 총액입니다. 엔진 단계에 표시되는 장부가·조정 전 자산 명칭은 이 사건에서는 채택한 총액을 뜻하며 영업권을 다시 더하지 않습니다.</p>}<details><summary>계산 단계</summary><pre>{JSON.stringify(w.run.response_snapshot.calc['단계별계산'],null,2)}</pre></details></section>}
    </>}
  </div>;
}
window.JTEquityCases=JTEquityCases;
