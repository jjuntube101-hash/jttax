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
        throw new Error(r.status===401?'로그인이 필요합니다. 작업대로 돌아가 같은 계정으로 로그인하세요.':
          messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
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
        const made=await mutation('/v1/equity-cases','POST',{client_id:clientId,label:'새 주식평가 사건',draft:{}});
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
  const save=async()=>{if(!equityDirty(ref.current))return ref.current.meta;const saved=await mutation(base,'PUT',{label:ref.current.label,draft:ref.current.draft},ref.current.meta.etag);await load(saved.case_id);return ref.current.meta;};
  const d=current?w.draft:null;
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
    <p>검토 완료한 순손익·자산·부채를 기존 평가 엔진에 연결합니다. 평가기준일은 2026-10-01~10-17, 각 금액은 0 이상 1조 이하의 원 단위입니다. 결손 연도·주당 순손익/가중평균 소수점 조합과 아래 조건 밖의 사건은 계산을 지원하지 않습니다.</p>
    <p>검토 완료 총액 또는 자산·부채별 조정 완료 명세를 입력합니다. 세무조정의 인정 여부는 직접 검토합니다. 영업권은 검토 완료 금액 또는 원본 연결 계산 중 하나를 선택합니다. 저장한 평가는 증여·상속 사건에서 같은 고객·날짜·목적으로 가져올 수 있습니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/equity-cases','POST',{client_id:clientId,label:'새 주식평가 사건',draft:{}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{equityDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      <fieldset disabled={busy||readonly}><legend>평가 사실·검토 자료</legend>
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
      </fieldset>
      {w.meta.case_input?.asset_worksheet&&<section className="eq-section" aria-label="저장된 명세 요약"><h2>저장된 명세 요약{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p data-testid="equity-worksheet-total">자산 {w.meta.case_input.asset_worksheet.adjusted_assets.toLocaleString('ko-KR')}원 / 부채 {w.meta.case_input.asset_worksheet.adjusted_liabilities.toLocaleString('ko-KR')}원 / 순자산 {w.meta.case_input.asset_worksheet.net_assets.toLocaleString('ko-KR')}원</p><ul>{w.meta.case_input.asset_worksheet.lines.map(row=><li key={row.local_id}>{row.account}: 조정 완료 {row.reviewed_amount?.toLocaleString('ko-KR')??'미입력'}원 · 장부 대비 차액 {row.difference?.toLocaleString('ko-KR')??'미확정'}원</li>)}</ul></section>}
      {w.meta.case_input?.goodwill_worksheet&&<section className="eq-section"><h2>저장된 영업권 산정표{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p data-testid="equity-goodwill-total">영업권 {w.meta.case_input.goodwill_worksheet.goodwill.toLocaleString('ko-KR')}원 · 초과이익 {w.meta.case_input.goodwill_worksheet.excess_income.toLocaleString('ko-KR')}원 · 환산액 {w.meta.case_input.goodwill_worksheet.converted_goodwill.toLocaleString('ko-KR')}원</p><p>채택 사유: {({positive_excess:'초과이익 환산액',purchased_floor:'영업권 포함 매입 무체재산권 평가액',zero_excess:'양의 초과이익 및 매입 무체재산권 평가액 없음'})[w.meta.case_input.goodwill_worksheet.outcome]}</p><p>원본 해시 {w.meta.case_input.goodwill_worksheet.source_hash}</p></section>}
      {w.meta.case_input?.profit_worksheet&&<section className="eq-section" aria-label="저장된 순손익 명세"><h2>저장된 순손익 명세{equityDirty(w)?' · 수정 전 입력 기준':''}</h2>{w.meta.case_input.profit_worksheet.map(p=><div key={p.year}><p data-testid={'equity-profit-total-'+p.year}>{p.year}년: {p.income_base?.toLocaleString('ko-KR')??'미입력'} + {p.additions.toLocaleString('ko-KR')} − {p.deductions.toLocaleString('ko-KR')} = {p.net_profit?.toLocaleString('ko-KR')??'미확정'}원</p><ul>{p.adjustments.map(a=><li key={a.local_id}>{a.direction==='add'?'가산':'차감'} · {a.account}: {a.amount?.toLocaleString('ko-KR')??'미입력'}원 · {a.reason}</li>)}</ul></div>)}</section>}
      {(w.meta.validation.errors||[]).length>0&&<section><p>마지막 저장 기준 확인 항목</p><ul>{w.meta.validation.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></section>}
      <button disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
      <button disabled={busy||readonly} onClick={()=>act(async()=>{const saved=await save();if(!saved.validation.can_run)throw new Error('저장본의 보완 항목을 확인해 주세요.');await mutation(base+'/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});await load(saved.case_id);})}>저장하고 계산</button>
      <label>다시 열 입력 버전<input data-testid="equity-reopen-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button disabled={busy} onClick={()=>{if(!equityDirty(w)||window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?'))act(()=>load(w.meta.case_id,revision));}}>저장본 다시 열기</button>
      {w.run&&<section className="eq-section" aria-label="저장된 평가 결과"><h2>저장된 평가 결과{equityDirty(w)?' · 수정 전 입력 기준':''}</h2><p>1주당 가액 {w.run.response_snapshot.calc['최종_1주당가액'].toLocaleString('ko-KR')}원 × {w.run.engine_request.shares_evaluated.toLocaleString('ko-KR')}주</p><output data-testid="equity-total">{w.run.response_snapshot.calc['총평가액'].toLocaleString('ko-KR')}원</output><p>결과 ID {w.run.run_id} · 입력 ID {w.run.revision_id}</p><p>입력한 자산·부채는 조정 완료 총액입니다. 엔진 단계에 표시되는 장부가·조정 전 자산 명칭은 이 사건에서는 채택한 총액을 뜻하며 영업권을 다시 더하지 않습니다.</p><details><summary>계산 단계</summary><pre>{JSON.stringify(w.run.response_snapshot.calc['단계별계산'],null,2)}</pre></details></section>}
    </>}
  </div>;
}
window.JTEquityCases=JTEquityCases;
