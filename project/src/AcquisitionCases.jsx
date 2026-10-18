/* Acquisition drafts: calculation runs only after explicit user action. */
let jtAcquisitionSession = null;
function acquisitionDirty(w = jtAcquisitionSession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
const acquisitionMissingLabels = {
  'parties.acquirer.name': '취득자 이름',
  'case_info.acquisition_date': '취득일',
  'case_info.filing_type': '신고 구분',
  'relationship.category': '당사자 관계',
  'relationship.as_of_date': '관계 기준일',
  'relationship.evidence': '관계 확인 근거',
  'relationship.review_state': '관계 확인 상태',
  'calculation.housing_count': '취득 후 주택 수',
  'calculation.regulated_area': '조정대상지역 여부',
  'calculation.location_scope': '소재지 범위',
  'calculation.transaction_price_confirmed': '실제 취득가격·부대비용 확인',
  'calculation.ordinary_scope_confirmed': '일반 주택 매매 범위 확인',
  'calculation.facts_confirmed': '계산 사실 확인',
  'calculation.review_note': '계산 금액·면적 수정 근거'
};
function acquisitionNewDraft() {
  return {
    schema_version: 'acquisition-case/1',
    case_info: { acquisition_date: null, registration_date: null, filing_type: 'unknown', reference: '', memo: '' },
    parties: [
      { party_ref: window.crypto.randomUUID(), role: 'acquirer', name: '', birth_date: null },
      { party_ref: window.crypto.randomUUID(), role: 'previous_owner', name: '', birth_date: null }
    ],
    relationship: { category: 'unknown', as_of_date: null, evidence: '', review_state: 'unknown' }
  };
}
function acquisitionNewFiling() {
  return { schema_version: 'acquisition-filing-input/1', mode: 'unknown',
    filer: { party_ref: null, name: '', address: '', postal_code: '', phone: '', email: '' },
    agent: { name: '', office: '', address: '', phone: '', email: '' },
    authorization: { state: 'unknown', grantor_ref: null, signed_on: null, scope: '', document_reference: '' },
    jurisdiction: { name: '', code: '', department: '', evidence: '' },
    filing_date: null, review_state: 'unknown', reviewed_on: null, review_note: '' };
}
function JTAcquisitionCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtAcquisitionSession);
  const [opened, setOpened] = React.useState(false);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState('');
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const keys = React.useRef({}), createdId = React.useRef(null), createBody = React.useRef(null);
  const remember = value => { ref.current = value; jtAcquisitionSession = value; if (alive.current) setW(value); };
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '') + path,
        { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jtGiftSession.token, ...options.headers } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) jtGiftSession.token = '';
        const messages = {
          REVISION_CONFLICT: '다른 저장본이 있습니다. 현재 입력을 보존한 채 최신 저장본을 확인해 주세요.',
          SNAPSHOT_MIGRATION_REQUIRED: '지원하지 않는 저장 버전입니다. 읽기 전용으로 확인해 주세요.',
          INVALID_CASE_INPUT: '입력 형식과 날짜를 확인해 주세요.',
          FILING_TAX_INPUT_CHANGED: '현재 계산 입력이 저장된 결과의 입력과 다릅니다. 해당 입력의 계산 결과를 선택해 주세요.',
          SHARE_ASSET_REVIEW_REQUIRED: '같은 공통 원본의 일반 주택 매매 물건을 확인해 주세요. 전체가액·취득분 가액의 정확한 지분 배분, 주택 전체 전용면적과 물건 검토가 필요합니다.',
    FILING_TAX_ASSET_MISMATCH: '연결 물건의 원본·전체 지분·거래가액·전용면적과 검토 상태를 확인해 주세요.',
          FILING_TAX_RESULT_INVALID: '저장된 계산 결과의 형식·출처·세액 합계를 확인하지 못했습니다.',
          FILING_ASSETS_REQUIRED: '저장된 물건별 신고정보가 누락되었습니다. 최신 저장본을 다시 열어 주세요.',
          FILING_ASSET_SOURCE_REQUIRED: '물건의 채택 원본을 확인할 수 없습니다. 저장본을 다시 열어 주세요.',
          FILING_ASSET_DUPLICATE_OR_LIMIT: '이미 추가한 재산이거나 물건 수 한도(100개)를 초과했습니다.',
          FILING_SUPPLEMENT_REQUIRED: '저장된 신고 보완정보가 누락되었습니다. 최신 저장본을 다시 열어 주세요.',
          SOURCE_CHANGED: '미리보기 이후 공통 원본이 바뀌었습니다. 원본 버전과 평가자료를 다시 조회해 주세요.',
          SOURCE_EVENT_DATE_MISMATCH: '취득일이 미리보기와 다릅니다. 현재 취득일로 다시 확인해 주세요.',
          SOURCE_FACT_DATE_INVALID: '선택한 과거 원본의 날짜가 취득일보다 늦습니다. 다른 버전을 선택해 주세요.',
          DRAFT_NOT_RUNNABLE: '계산에 필요한 입력과 확인 항목을 마친 뒤 저장해 주세요.',
          INPUT_HASH_MISMATCH: '계산 입력이 바뀌었습니다. 저장본을 다시 열어 확인해 주세요.',
          MIXED_ASSET_REVIEW_REQUIRED: '혼합용도 연결 전에 공통 원본과 물건별 일반 매매 가액·토지·건축면적을 저장하고 확인해 주세요.',
          RUN_NOT_FOUND: '저장된 계산 결과를 찾지 못했습니다.'
        };
        throw new Error(response.status === 401 ? '로그인이 필요합니다. 입력을 유지하고 같은 계정으로 다시 로그인해 주세요.' :
          messages[data.detail?.code] || (response.status === 422 ? '입력 형식과 날짜를 확인해 주세요.' :
            '자료를 처리하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({ path, method, body, etag });
    const memory = ref.current?.keys || keys.current;
    return api(path, { method, body: JSON.stringify(body), headers: {
      'Idempotency-Key': memory[signature] ||= window.crypto.randomUUID(), ...(etag ? { 'If-Match': etag } : {})
    } });
  };
  const act = async fn => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); }
    catch (e) { if (alive.current) setError(e instanceof TypeError || e.name === 'AbortError' ?
      '응답을 받지 못했습니다. 입력은 유지됩니다. 같은 작업을 다시 누르면 같은 요청으로 저장 여부를 확인합니다.' : e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const load = async (id, number = '') => {
    const saved = await api('/v1/acquisition-cases/' + encodeURIComponent(id) + (number ? '?revision=' + encodeURIComponent(number) : ''));
    if (saved.client_id !== clientId) throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id ?
      await api('/v1/acquisition-cases/' + encodeURIComponent(id) + '/runs/' + encodeURIComponent(saved.last_successful_run_id)) : null;
    remember({ uid: jtGiftSession.uid, meta: saved, label: saved.label, draft: saved.draft, run,
      keys: ref.current?.keys || keys.current, baseline: JSON.stringify({ label: saved.label, draft: saved.draft }) });
    if (alive.current) setOpened(true);
  };
  const open = async () => {
    if (caseId === 'resume' && ref.current?.meta?.client_id === clientId) {
      if (ref.current.uid !== jtGiftSession.uid) throw new Error('편집하던 계정으로 다시 로그인해 주세요.');
      if (alive.current) setOpened(true);
    } else if (caseId && caseId !== 'resume') {
      await load(caseId);
    } else {
      if (!createdId.current) {
        createBody.current ||= { client_id: clientId, label: '새 취득세 사건', draft: acquisitionNewDraft() };
        const made = await mutation('/v1/acquisition-cases', 'POST', createBody.current);
        createdId.current = made.case_id;
      }
      await load(createdId.current);
    }
  };
  React.useEffect(() => {
    alive.current = true;
    act(open);
    const protect = e => { if (lock.current || acquisitionDirty(ref.current)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => { alive.current = false; window.removeEventListener('beforeunload', protect); };
  }, []);
  const current = opened && w?.meta?.client_id === clientId &&
    (caseId === 'resume' || !caseId || w.meta.case_id === caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision !== w.meta.current_revision;
  const base = current ? '/v1/acquisition-cases/' + encodeURIComponent(w.meta.case_id) : '';
  const exit = () => {
    if (lock.current) return;
    if (!acquisitionDirty(ref.current) || window.confirm('저장하지 않은 취득세 입력이 있습니다. 입력을 메모리에 유지하고 작업대로 이동할까요?')) onExit();
  };
  const resetFacts = draft => draft.calculation ? { ...draft, calculation: { ...draft.calculation, facts_confirmed: false } } : draft;
  const change = (group, key, value) => remember({ ...ref.current, draft: resetFacts({
    ...ref.current.draft, [group]: { ...ref.current.draft[group], [key]: value }
  }) });
  const changeParty = (role, key, value) => remember({ ...ref.current, draft: resetFacts({
    ...ref.current.draft, parties: ref.current.draft.parties.map(p => p.role === role ? { ...p, [key]: value } : p)
  }) });
  const addParty = role => remember({ ...ref.current, draft: resetFacts({
    ...ref.current.draft, parties: [...ref.current.draft.parties, { party_ref: window.crypto.randomUUID(), role, name: '', birth_date: null }]
  }) });
  const removeParty = role => remember({ ...ref.current, draft: resetFacts({
    ...ref.current.draft, parties: ref.current.draft.parties.filter(p => p.role !== role)
  }) });
  const changeCalculation = (key, value) => remember({ ...ref.current, draft: { ...ref.current.draft,
    calculation: { ...ref.current.draft.calculation, [key]: value,
      facts_confirmed: key === 'facts_confirmed' ? value : false } } });
  const changeFiling = (group, key, value) => {
    const prior = ref.current.draft.filing_supplement || acquisitionNewFiling();
    const supplement = group ? { ...prior, [group]: { ...prior[group], [key]: value }, review_state: 'unknown' } :
      { ...prior, [key]: value, review_state: key === 'review_state' ? value : 'unknown' };
    remember({ ...ref.current, draft: { ...ref.current.draft, filing_supplement: supplement } });
  };
  const linkFiler = () => {
    const party = ref.current.draft.parties.find(p => p.role === 'acquirer');
    if (!party) return;
    const prior = ref.current.draft.filing_supplement || acquisitionNewFiling();
    remember({ ...ref.current, draft: { ...ref.current.draft, filing_supplement: { ...prior,
      filer: { ...prior.filer, party_ref: party.party_ref, name: party.name },
      authorization: { ...prior.authorization, grantor_ref: party.party_ref, state: 'unknown' }, review_state: 'unknown' } } });
  };
  const save = async () => {
    if (!acquisitionDirty(ref.current)) return ref.current.meta;
    const saved = await mutation(base, 'PUT', { label: ref.current.label, draft: ref.current.draft }, ref.current.meta.etag);
    await load(saved.case_id);
    return ref.current.meta;
  };
  const d = current ? w.draft : null;
  const editableSchema = ['acquisition-case/1', 'acquisition-case/2', 'acquisition-case/3', 'acquisition-case/4', 'acquisition-case/5', 'acquisition-case/6'].includes(d?.schema_version) &&
    !!d.case_info && Array.isArray(d.parties) && !!d.relationship &&
    (d.schema_version === 'acquisition-case/1' || !!d.calculation) &&
    (!d.filing_supplement || d.filing_supplement.schema_version === 'acquisition-filing-input/1') &&
    (!d.filing_assets || d.filing_assets.schema_version === 'acquisition-filing-assets/1');
  const f = d?.filing_supplement;
  const filingText = (group, key, label, maxLength, type = 'text') => <label key={key}>{label}<input
    data-testid={'acquisition-filing-' + group + '-' + key} type={type} maxLength={maxLength}
    value={f[group][key] || ''} onChange={e => changeFiling(group, key, type === 'date' ? e.target.value || null : e.target.value)}/></label>;
  return <div className="jt-container cw-workspace">
    <style>{`.acq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.acq-grid label,.acq-field{display:flex;flex-direction:column;gap:6px}.acq-grid input,.acq-grid select,.acq-field input,.acq-field textarea{font:inherit;padding:10px;min-height:44px}.acq-section{border:1px solid #ccd8cd;padding:20px;margin:20px 0;border-radius:10px}.acq-section p{line-height:1.6}.acq-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}`}</style>
    <button disabled={busy} onClick={exit}>← 고객·사건 작업대</button><h1>취득세 사건</h1>
    <p>기본정보와 공통 원본을 저장합니다. 확인한 일반 주택·비주택 매매 사건은 계산 입력을 연결한 뒤, 계산 버튼을 눌러 별도 실행합니다.</p>
    {error && <p role="alert">{error}</p>}
    {!current && busy && <p>사건을 여는 중입니다.</p>}
    {!current && !busy && <button data-testid="acquisition-open-retry" onClick={() => act(open)}>사건 열기 다시 시도</button>}
    {current && <>
      <p data-testid="acquisition-status">저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}
        {readonly ? ' · 읽기 전용 저장본' : ''}{acquisitionDirty(w) ? ' · 저장하지 않은 변경 있음' : ''}</p>
      {!editableSchema ? <section className="acq-section"><h2>지원하지 않는 입력 버전</h2><p>원본을 읽기 전용으로 보존합니다.</p><pre>{JSON.stringify(d, null, 2)}</pre></section> : <>
        <fieldset disabled={busy || readonly}><legend>사건 기본정보 초안</legend>
          <div className="acq-grid">
            <label>사건명<input data-testid="acquisition-label" value={w.label} maxLength={200} onChange={e => remember({ ...ref.current, label: e.target.value })}/></label>
            <label>취득일<input data-testid="acquisition-acquisition_date" type="date" value={d.case_info.acquisition_date || ''} onChange={e => change('case_info', 'acquisition_date', e.target.value || null)}/></label>
            <label>등기일<input data-testid="acquisition-registration_date" type="date" value={d.case_info.registration_date || ''} onChange={e => change('case_info', 'registration_date', e.target.value || null)}/></label>
            <label>신고 구분<select data-testid="acquisition-filing_type" value={d.case_info.filing_type} onChange={e => change('case_info', 'filing_type', e.target.value)}>
              <option value="unknown">미정</option><option value="regular">정기</option><option value="late">기한 후</option><option value="amended">수정</option>
            </select></label>
            <label>참조번호·식별 메모<input data-testid="acquisition-reference" value={d.case_info.reference} onChange={e => change('case_info', 'reference', e.target.value)}/></label>
          </div>
          <label className="acq-field">사건 메모<textarea data-testid="acquisition-memo" rows="5" value={d.case_info.memo} onChange={e => change('case_info', 'memo', e.target.value)}/></label>
          {[['acquirer', '취득자'], ['previous_owner', '전소유자']].map(([role, title]) => {
            const party = d.parties.find(p => p.role === role);
            return <section className="acq-section" key={role}><h2>{title}</h2>
              {party ? <><div className="acq-grid">
                <label>이름<input data-testid={'acquisition-' + role + '-name'} value={party.name} onChange={e => changeParty(role, 'name', e.target.value)}/></label>
                <label>생년월일<input data-testid={'acquisition-' + role + '-birth_date'} type="date" value={party.birth_date || ''} onChange={e => changeParty(role, 'birth_date', e.target.value || null)}/></label>
              </div><button type="button" data-testid={'acquisition-' + role + '-remove'} onClick={() => removeParty(role)}>{title} 제거</button></> :
                <button type="button" data-testid={'acquisition-' + role + '-add'} disabled={d.parties.length >= 2} onClick={() => addParty(role)}>{title} 추가</button>}
            </section>;
          })}
          <section className="acq-section"><h2>당사자 관계</h2><div className="acq-grid">
            <label>관계 구분<select data-testid="acquisition-relationship-category" value={d.relationship.category} onChange={e => change('relationship', 'category', e.target.value)}>
              <option value="unknown">미확인</option><option value="spouse">배우자</option><option value="lineal">직계존비속</option><option value="other_relative">기타 친족</option><option value="unrelated">특수관계 없음</option><option value="not_applicable">해당 없음</option>
            </select></label>
            <label>관계 기준일<input data-testid="acquisition-relationship-as_of_date" type="date" value={d.relationship.as_of_date || ''} onChange={e => change('relationship', 'as_of_date', e.target.value || null)}/></label>
            <label>확인 상태<select data-testid="acquisition-relationship-review_state" value={d.relationship.review_state} onChange={e => change('relationship', 'review_state', e.target.value)}>
              <option value="unknown">미확인</option><option value="confirmed">확인</option><option value="not_applicable">해당 없음</option>
            </select></label>
          </div><label className="acq-field">관계 확인 근거<textarea data-testid="acquisition-relationship-evidence" rows="3" value={d.relationship.evidence} onChange={e => change('relationship', 'evidence', e.target.value)}/></label></section>
        <section className="acq-section" aria-label="신고 보완정보"><h2>신고 보완정보</h2>
          <p>일반 정기 신고의 신고인·대리인·위임·관할 정보를 보관합니다. 이 입력의 확인 상태는 신고서 완성이나 접수 완료를 뜻하지 않습니다.</p>
          {!f ? <button type="button" data-testid="acquisition-filing-enable" onClick={() =>
            remember({ ...ref.current, draft: { ...ref.current.draft, filing_supplement: acquisitionNewFiling() } })}>신고 보완정보 입력 시작</button> : <>
            <div className="acq-grid"><label>신고 방식<select data-testid="acquisition-filing-mode" value={f.mode} onChange={e => changeFiling(null, 'mode', e.target.value)}>
              <option value="unknown">미확인</option><option value="self">본인 신고</option><option value="agent">대리 신고</option></select></label>
              <label>신고 예정일<input data-testid="acquisition-filing-date" type="date" value={f.filing_date || ''} onChange={e => changeFiling(null, 'filing_date', e.target.value || null)}/></label></div>
            <h3>신고인</h3><button type="button" data-testid="acquisition-filing-link" disabled={!d.parties.some(p => p.role === 'acquirer')}
              onClick={linkFiler}>현재 취득자를 신고인·위임인으로 연결</button>
            <p>주민등록번호 원문은 입력하지 않습니다. 취득자 이름이 바뀌면 연결을 다시 확인해 주세요.</p>
            <div className="acq-grid">{[['name','신고인 이름',200],['address','신고인 주소',500],['postal_code','우편번호',5],['phone','신고인 연락처',50],['email','신고인 전자우편',200]].map(x => filingText('filer', ...x))}</div>
            {f.mode === 'agent' && <><h3>대리인</h3><div className="acq-grid">
              {[['name','대리인 이름',200],['office','대리인 소속',200],['address','대리인 주소',500],['phone','대리인 연락처',50],['email','대리인 전자우편',200]].map(x => filingText('agent', ...x))}</div>
              <h3>위임 확인</h3><div className="acq-grid"><label>위임 상태<select data-testid="acquisition-filing-authorization-state" value={f.authorization.state} onChange={e => changeFiling('authorization', 'state', e.target.value)}>
                <option value="unknown">미확인</option><option value="confirmed">위임장 확인</option><option value="not_authorized">위임 없음</option></select></label>
                {filingText('authorization','signed_on','위임일',10,'date')}
                {filingText('authorization','document_reference','위임장 문서 참조',500)}</div>
              <label className="acq-field">위임 업무 범위<textarea data-testid="acquisition-filing-authorization-scope" maxLength={2000} value={f.authorization.scope} onChange={e => changeFiling('authorization','scope',e.target.value)}/></label></>}
            {f.mode === 'self' && <p>본인 신고에서는 대리인·위임 내용을 사용하지 않습니다. 이전에 입력한 내용은 보관됩니다.</p>}
            <h3>관할</h3><div className="acq-grid">{[['name','관할 기관명',200],['code','관할 기관코드(확인한 경우)',50],['department','담당 부서',200]].map(x => filingText('jurisdiction', ...x))}</div>
            <label className="acq-field">관할 확인 근거<textarea data-testid="acquisition-filing-jurisdiction-evidence" maxLength={2000} value={f.jurisdiction.evidence} onChange={e => changeFiling('jurisdiction','evidence',e.target.value)}/></label>
            <h3>보완정보 검토</h3><div className="acq-grid"><label>검토일<input data-testid="acquisition-filing-reviewed-on" type="date" value={f.reviewed_on || ''} onChange={e => changeFiling(null,'reviewed_on',e.target.value || null)}/></label>
              <label>검토 상태<select data-testid="acquisition-filing-review-state" value={f.review_state} onChange={e => changeFiling(null,'review_state',e.target.value)}><option value="unknown">미확인</option><option value="confirmed">입력·근거 확인</option></select></label></div>
            <label className="acq-field">검토 근거<textarea data-testid="acquisition-filing-review-note" maxLength={2000} value={f.review_note} onChange={e => changeFiling(null,'review_note',e.target.value)}/></label>
            <p data-testid="acquisition-filing-status">{acquisitionDirty(w) ? '저장하면 보완 항목을 다시 확인합니다.' :
              w.meta.validation.filing_supplement?.complete_for_review ? '보완 입력 검토 항목 충족 · 신고 준비 여부는 별도 확인' : '보완 입력 확인 필요'}</p>
            {!acquisitionDirty(w) && <ul>{(w.meta.validation.filing_supplement?.missing_fields || []).map(x => <li key={x}>{x}</li>)}</ul>}
          </>}
        </section>
        </fieldset>
        {w.meta.master_snapshot && <section className="acq-section" aria-label="채택한 공통 원본">
          <h2>저장된 공통 원본</h2><p data-testid="acquisition-source-status">{w.meta.master_snapshot.property.address} · {w.meta.source_status === 'matched' ? '가져온 자료와 입력 일치' : '가져온 뒤 당사자·취득일 직접 수정'} · 평가 기준일 {w.meta.master_snapshot.valuation.as_of_date} · 원본 금액 {w.meta.master_snapshot.valuation.amount}원</p>
          <p>원본은 저장 당시 상태로 보관되며 최신 공통 원본과 자동 동기화되지 않습니다. 평가금액은 저장 당시의 원본입니다. 계산 입력을 연결한 뒤 실제 취득가격과 검토 근거를 확인합니다.</p></section>}
        {w.meta.master_snapshot?.property?.property_type === '주택' && d.schema_version === 'acquisition-case/1' && !readonly &&
          <button data-testid="acquisition-connect-calculation" disabled={busy || acquisitionDirty(w)}
            onClick={() => act(async () => {
              const saved = await mutation(base + '/calculation-inputs', 'POST',
                { label: ref.current.label, draft: ref.current.draft }, ref.current.meta.etag);
              await load(saved.case_id);
            })}>계산 입력 연결</button>}
        {w.meta.master_snapshot?.property?.property_type === '주택' && !readonly && (d.filing_assets?.assets || []).map((asset, index) =>
          <button key={asset.line_id} data-testid={'acquisition-share-connect-' + index} disabled={busy || acquisitionDirty(w)}
            onClick={() => act(async () => {
              const saved = await mutation(base + '/share-calculation-inputs', 'POST',
                {label: ref.current.label, draft: ref.current.draft, asset_line_id: asset.line_id}, ref.current.meta.etag);
              await load(saved.case_id);
            })}>물건 {index + 1} 지분 계산 입력 연결</button>)}
        {['토지', '상가'].includes(w.meta.master_snapshot?.property?.property_type) && !readonly && (d.filing_assets?.assets || []).map((asset, index) =>
          <div key={asset.line_id}>{(w.meta.master_snapshot.property.property_type === '토지' ? [['land','토지']] : [['building','건물'],['land_building','토지+건물']]).map(([kind, label]) =>
            <button key={kind} data-testid={'acquisition-nonhousing-connect-' + kind + '-' + index} disabled={busy || acquisitionDirty(w)}
              onClick={() => act(async () => {
                const saved = await mutation(base + '/nonhousing-calculation-inputs', 'POST',
                  {label: ref.current.label, draft: ref.current.draft, asset_line_id: asset.line_id, component_kind: kind}, ref.current.meta.etag);
                await load(saved.case_id);
              })}>물건 {index + 1} {label} 계산 입력 연결</button>)}</div>)}
        {['주택', '상가'].includes(w.meta.master_snapshot?.property?.property_type) && !readonly && (d.filing_assets?.assets || []).map((asset,index) =>
          <button key={asset.line_id} data-testid={'acquisition-mixed-connect-' + index} disabled={busy || acquisitionDirty(w)} onClick={() => act(async () => {
            const saved = await mutation(base + '/mixed-calculation-inputs','POST', {label:ref.current.label,draft:ref.current.draft,asset_line_id:asset.line_id},ref.current.meta.etag);
            await load(saved.case_id);
          })}>물건 {index + 1} 주택·비주택 혼합용도 연결</button>)}
        {['acquisition-case/5','acquisition-case/6'].includes(d.schema_version) && d.calculation && <section className="acq-section" aria-label="혼합용도 취득세 계산 입력">
          <h2>주택·비주택 혼합용도 일반 매매</h2>
          <p>2026-10-01~2026-10-17 자연인의 전체 지분 또는 모든 용도·토지·건물에 동일한 일부 지분 취득을 지원합니다. 주택 한 호(취득 후 1주택)와 비농지 비주택의 일반 매매 본세 범위이며, 일부 지분은 전체·취득분 가액이 원 단위까지 정확한 비례 배분이어야 합니다. 법인·감면·중과·특례는 입력 저장만 가능합니다.</p>
          <fieldset disabled={busy || readonly}><legend>용도별 면적·시가표준액 확인</legend>
            <label>취득분 합계(원)<input data-testid="acquisition-mixed-total" readOnly value={d.calculation.property_value ?? ''}/></label>
            <p>용도별 면적·시가표준액 네 가지는 전체 지분 기준으로 입력합니다. 용도별 건축면적의 합계는 물건별 전체 건축면적과 같아야 합니다. 주택 실제 전용면적은 별도로 입력합니다.</p>
            <div className="acq-grid">{[['housing_building_area','주택 용도 건축면적'],['nonhousing_building_area','비주택 용도 건축면적'],['exclusive_area','주택 한 호의 실제 전용면적'],['housing_land_area','직접 확인 주택 부속토지 면적'],['nonhousing_land_area','직접 확인 비주택 부속토지 면적']].map(([key,label]) =>
              <label key={key}>{label}(㎡)<input data-testid={'acquisition-mixed-'+key} inputMode="decimal" value={d.calculation[key] ?? ''} onChange={e=>changeCalculation(key,e.target.value || null)}/></label>)}</div>
            <label>부속토지 면적 적용<select data-testid="acquisition-mixed-land_area_mode" value={d.calculation.land_area_mode} onChange={e=>changeCalculation('land_area_mode',e.target.value)}>
              <option value="unknown">미확인</option><option value="building_ratio">건축면적 비율 후보를 검토 후 사용</option><option value="manual">직접 확인한 구분 면적 사용</option></select></label>
            <p>자동 후보는 주택 토지면적 소수 넷째 자리까지 버림 후 잔액을 비주택에 배분합니다. 직접 면적을 선택해도 후보와 이전 입력을 보관합니다. 이 면적비율을 가액 안분에 적용하지 않습니다.</p>
            <div className="acq-grid">{[['housing_land_standard','주택 부속토지 시가표준액'],['housing_building_standard','주택 부분 건축물 시가표준액'],['nonhousing_land_standard','비주택 부속토지 시가표준액'],['nonhousing_building_standard','비주택 부분 건축물 시가표준액']].map(([key,label]) =>
              <label key={key}>{label}(원)<input data-testid={'acquisition-mixed-'+key} inputMode="numeric" value={d.calculation[key] ?? ''} onChange={e=>changeCalculation(key,e.target.value || null)}/></label>)}</div>
            <p>가액은 각 용도의 건축물+토지 시가표준액을 전체 시가표준액으로 나눈 비율로 안분합니다. 주택 공시가격을 건축물 시가표준액 대신 입력하지 마세요. 비주택 원 미만을 버리고 잔액을 주택에 배분합니다.</p>
            {d.schema_version === 'acquisition-case/6' && <div data-testid="acquisition-mixed-share-inputs">
              <h3>주택 일부 지분의 전체가액 환산</h3>
              <p>주택 전체가액으로 세율을 판정하고 취득분 가액에 적용합니다. 아래 주택 시가표준액은 위의 용도별 안분용 네 가지 금액과 구분합니다. 실제 전용면적에는 지분을 곱하지 않습니다.</p>
              {[['whole_standard_value','주택 전체 시가표준액'],['acquired_standard_value','주택 취득지분 시가표준액']].map(([key,label]) => <label key={key}>{label}(원)<input data-testid={'acquisition-mixed-'+key} inputMode="numeric" value={d.calculation[key] ?? ''} onChange={e=>changeCalculation(key,e.target.value || null)}/></label>)}
              <label>주택 시가표준액·동일 지분 근거<textarea data-testid="acquisition-mixed-standard_value_evidence" maxLength={2000} value={d.calculation.standard_value_evidence} onChange={e=>changeCalculation('standard_value_evidence',e.target.value)}/></label>
              <label><input type="checkbox" data-testid="acquisition-mixed-share_basis_confirmed" checked={d.calculation.share_basis_confirmed} onChange={e=>changeCalculation('share_basis_confirmed',e.target.checked)}/>주택·비주택 및 토지·건물 모두 동일 지분이며 가액과 주택 시가표준액도 같은 비율임을 확인했습니다.</label>
            </div>}
            <label>취득 후 세대 주택 수<input data-testid="acquisition-mixed-housing_count" type="number" min="0" value={d.calculation.housing_count ?? ''} onChange={e=>changeCalculation('housing_count',e.target.value === '' ? null : Number(e.target.value))}/></label>
            <label>조정대상지역<select data-testid="acquisition-mixed-regulated_area" value={d.calculation.regulated_area} onChange={e=>changeCalculation('regulated_area',e.target.value)}><option value="unknown">미확인</option><option value="yes">해당</option><option value="no">비해당</option></select></label>
            <label>소재지<select data-testid="acquisition-mixed-location_scope" value={d.calculation.location_scope} onChange={e=>changeCalculation('location_scope',e.target.value)}><option value="unknown">미확인</option><option value="city">도시지역(읍·면 100㎡ 특례 없음)</option><option value="other">그 외</option></select></label>
            {[['area_evidence','용도별 면적·부속토지 구분 근거'],['allocation_evidence','용도별 건축물·토지 시가표준액 근거'],['review_note','거래 및 적용 범위 검토 근거']].map(([key,label]) => <label key={key}>{label}<textarea data-testid={'acquisition-mixed-'+key} maxLength={2000} value={d.calculation[key]} onChange={e=>changeCalculation(key,e.target.value)}/></label>)}
            {[['transaction_price_confirmed','부가세 제외·부대비용 포함 실제 취득가격을 확인했습니다.'],['ordinary_scope_confirmed','자연인·주택 한 호와 비농지 비주택 일반 매매, 감면·중과·특례·신탁 없음, 주택 부속토지 법정 면적 한도 이내를 확인했습니다.'],['no_local_variation_confirmed','취득세·지방교육세 조례 세율 변동이 없음을 확인했습니다.'],['facts_confirmed','용도별 전체 면적과 시가표준액, 취득 지분, 원본 및 취득일을 확인했습니다.']].map(([key,label]) => <label key={key}><input type="checkbox" data-testid={'acquisition-mixed-'+key} checked={d.calculation[key]} onChange={e=>changeCalculation(key,e.target.checked)}/>{label}</label>)}
          </fieldset>
          <p>{acquisitionDirty(w) ? '저장하지 않은 변경이 있습니다. 아래 안분은 마지막 저장 기준입니다.' : '마지막 저장 기준 안분'}</p>
          {d.schema_version === 'acquisition-case/6' && w.meta.case_input?.mixed_allocation?.whole && <table data-testid="acquisition-mixed-share-summary">
            <caption>마지막 저장 기준 전체 / 취득분 연결</caption>
            <thead><tr><th>구분</th><th>전체 가액(원)</th><th>취득분 가액(원)</th><th>전체 토지 / 건축면적(㎡)</th><th>취득분 토지 / 건축면적(㎡)</th></tr></thead>
            <tbody>{['housing','nonhousing'].map(kind => {const a=w.meta.case_input.mixed_allocation;return <tr key={kind}><th>{kind==='housing'?'주택':'비주택'}</th><td>{a.whole.selected[kind]}</td><td>{a.selected[kind]}</td><td>{a.whole.areas.land.selected[kind]} / {a.whole.areas.building[kind]}</td><td>{a.acquired_areas.land[kind]} / {a.acquired_areas.building[kind]}</td></tr>;})}</tbody>
          </table>}
          <pre data-testid="acquisition-mixed-allocation">{JSON.stringify(w.meta.case_input?.mixed_allocation ?? null,null,2)}</pre>
          {!readonly && <button data-testid="acquisition-run" disabled={busy} onClick={() => act(async () => {
            const saved = await save();
            if (!saved.validation?.can_run) throw new Error('계산에 필요한 입력과 확인 항목을 마친 뒤 저장해 주세요.');
            const result = await mutation(base + '/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});
            if (result.status !== 'succeeded') throw new Error('계산이 완료되지 않았습니다. 입력을 확인해 주세요.');
            await load(saved.case_id);
          })}>입력 저장 후 계산</button>}
        </section>}

        {d.schema_version === 'acquisition-case/4' && d.calculation && <section className="acq-section" aria-label="비주택 취득세 계산 입력">
          <h2>비주택 일반 매매 · {{land:'토지',building:'건물',land_building:'토지+건물'}[d.calculation.component_kind]}</h2>
          <p>2026-10-01~2026-10-17 자연인의 비농지·순수 비주택 정기 신고, 감면·중과·특례·조례 세율 변동이 없는 경우를 지원합니다. 주택 혼합·법인·농지·신탁·소액취득은 지원하지 않습니다.</p>
          <p>물건별 취득정보의 취득분 가액을 사용하며 지분을 다시 곱하지 않습니다. 변경하려면 물건별 입력을 저장하고 다시 연결해 주세요. 각 구성의 취득가액은 50만원을 초과해야 합니다.</p>
          <fieldset disabled={busy || readonly}><legend>가액 구분 및 안분 근거</legend>
            <label>취득분 합계(원)<input data-testid="acquisition-nonhousing-total" readOnly value={d.calculation.property_value}/></label>
            {d.calculation.component_kind === 'land_building' && <>
              <label>가액 적용 방법<select data-testid="acquisition-nonhousing-mode" value={d.calculation.allocation_mode} onChange={e => changeCalculation('allocation_mode', e.target.value)}>
                <option value="unknown">미확인</option><option value="separate_prices">구분된 토지·건물 취득가액</option><option value="standard_ratio">구분 불가 · 시가표준액 비율</option></select></label>
              <div className="acq-grid">{[['land_price','구분된 토지 취득가액'],['building_price','구분된 건물 취득가액'],['land_standard_value','취득대상 토지 시가표준액'],['building_standard_value','취득대상 건물 시가표준액']].map(([key,label]) =>
                <label key={key}>{label}(원)<input data-testid={'acquisition-nonhousing-' + key} inputMode="numeric" value={d.calculation[key] ?? ''} onChange={e => changeCalculation(key,e.target.value || null)}/></label>)}</div>
              <p>구분가액은 합계가 취득분 가액과 같아야 합니다. 시가표준액 비율 선택 시 토지 원 미만은 버리고 나머지를 건물에 배분합니다. 선택하지 않은 방법의 입력도 보관합니다.</p>
            </>}
            <label>구분가액·시가표준액 및 안분 확인 근거<textarea data-testid="acquisition-nonhousing-evidence" maxLength={2000} value={d.calculation.allocation_evidence} onChange={e => changeCalculation('allocation_evidence',e.target.value)}/></label>
            <label>거래 및 적용 범위 검토 근거<textarea data-testid="acquisition-nonhousing-review" maxLength={2000} value={d.calculation.review_note} onChange={e => changeCalculation('review_note',e.target.value)}/></label>
            {[['transaction_price_confirmed','부가세를 제외한 실제 취득가격과 부대비용을 확인했습니다.'],['ordinary_scope_confirmed','자연인·특수관계 없음·비농지·순수 비주택 일반 매매이며 감면·중과·특례·신탁이 없음을 확인했습니다.'],['no_local_variation_confirmed','취득지의 조례에 따른 취득세·지방교육세 세율 변동이 없음을 확인했습니다.'],['facts_confirmed','원본·취득일·지분·면적·가액 구분과 시가표준액 적용 근거를 확인했습니다.']].map(([key,label]) =>
              <label key={key} className="acq-field"><input type="checkbox" data-testid={'acquisition-nonhousing-' + key} checked={d.calculation[key]} onChange={e => changeCalculation(key,e.target.checked)}/>{label}</label>)}
          </fieldset>
          <p>{acquisitionDirty(w) ? '저장하지 않은 변경이 있습니다. 아래 안분은 마지막 저장 기준입니다.' : '마지막 저장 기준 안분'}</p>
          <pre data-testid="acquisition-nonhousing-allocation">{JSON.stringify(w.meta.case_input?.nonhousing_allocation ?? null,null,2)}</pre>
          {!readonly && <button data-testid="acquisition-run" disabled={busy} onClick={() => act(async () => {
            const saved = await save();
            if (!saved.validation?.can_run) throw new Error('계산에 필요한 입력과 확인 항목을 마친 뒤 저장해 주세요.');
            const result = await mutation(base + '/runs', 'POST', {revision_id: saved.revision_id, expected_input_hash: saved.input_hash});
            if (result.status !== 'succeeded') throw new Error('계산이 완료되지 않았습니다. 입력을 확인해 주세요.');
            await load(saved.case_id);
          })}>입력 저장 후 계산</button>}
        </section>}
        {['acquisition-case/2', 'acquisition-case/3'].includes(d.schema_version) && d.calculation && <section className="acq-section" aria-label="취득세 계산 입력">
          <h2>계산 입력</h2>{d.schema_version === 'acquisition-case/3' ? <p>2026-07-01~2026-10-17 자연인 일반 주택 매매의 일부지분, 취득 후 1주택, 특수관계·감면·중과 없음, 도시지역, 부속토지 법정 면적 한도 이내 범위입니다. 취득가액과 시가표준액이 동일한 지분 비율인 경우를 지원합니다. 물건별 취득정보를 먼저 저장·검토한 뒤 연결해 주세요.</p> : <p>2026-01-01부터 2026-10-17까지 취득한 자연인 일반 주택 매매의 전체 지분, 취득 후 1주택, 특수관계 없음, 감면·일시적 2주택 없음, 고급주택 등 중과 없음, 부속토지 법정 면적 한도 이내 범위입니다. 법령 확인 기준일은 2026-10-17입니다. 소재지의 ‘도시지역’은 읍·면 100㎡ 예외가 없는 경우입니다.</p>}
          <p>저장된 원본 평가금액 {w.meta.master_snapshot?.valuation?.amount || '없음'}원 · 원본 전용면적 {w.meta.master_snapshot?.property?.exclusive_area ?? '없음'}㎡. 아래 금액·면적과 일반 매매 적용 근거를 기록해야 합니다.</p>
          <fieldset disabled={busy || readonly}><legend>계산 사실과 확인</legend><div className="acq-grid">
            <label>실제 취득가격(원)<input data-testid="acquisition-calc-value" readOnly={d.schema_version === 'acquisition-case/3'} inputMode="numeric" value={d.calculation.property_value ?? ''} onChange={e => changeCalculation('property_value', e.target.value)}/></label>
            <label>전용면적(㎡)<input data-testid="acquisition-calc-area" readOnly={d.schema_version === 'acquisition-case/3'} inputMode="decimal" value={d.calculation.exclusive_area ?? ''} onChange={e => changeCalculation('exclusive_area', e.target.value || null)}/></label>
            <label>취득 후 주택 수<input data-testid="acquisition-calc-housing-count" type="number" min="0" step="1" value={d.calculation.housing_count ?? ''} onChange={e => changeCalculation('housing_count', e.target.value === '' ? null : Number(e.target.value))}/></label>
            <label>조정대상지역 여부<select data-testid="acquisition-calc-regulated-area" value={d.calculation.regulated_area} onChange={e => changeCalculation('regulated_area', e.target.value)}><option value="unknown">미확인</option><option value="no">아니오</option><option value="yes">예</option></select></label>
            <label>소재지 범위<select data-testid="acquisition-calc-location-scope" value={d.calculation.location_scope} onChange={e => changeCalculation('location_scope', e.target.value)}><option value="unknown">미확인</option><option value="city">도시지역(읍·면 100㎡ 예외 없음)</option><option value="other">그 외</option></select></label>
          </div>
          {d.schema_version === 'acquisition-case/3' && <div data-testid="acquisition-share-fields">
            <p>취득분 가액과 주택 전체 전용면적은 연결한 물건에서 가져옵니다. 수정하려면 물건별 취득정보를 저장하고 다시 연결해 주세요. 전용면적을 지분 비율로 나누지 않습니다.</p>
            <div className="acq-grid">
              <label>주택 전체 시가표준액(원)<input data-testid="acquisition-share-whole-standard" inputMode="numeric" value={d.calculation.whole_standard_value ?? ''} onChange={e => changeCalculation('whole_standard_value', e.target.value || null)}/></label>
              <label>취득지분 시가표준액(원)<input data-testid="acquisition-share-acquired-standard" inputMode="numeric" value={d.calculation.acquired_standard_value ?? ''} onChange={e => changeCalculation('acquired_standard_value', e.target.value || null)}/></label>
            </div>
            <label className="acq-field">시가표준액 확인 근거<textarea data-testid="acquisition-share-evidence" value={d.calculation.standard_value_evidence} maxLength={2000} onChange={e => changeCalculation('standard_value_evidence', e.target.value)}/></label>
            <label><input data-testid="acquisition-share-confirm" type="checkbox" checked={d.calculation.share_basis_confirmed} onChange={e => changeCalculation('share_basis_confirmed', e.target.checked)}/>시가표준액 증빙과 취득가액·시가표준액의 동일 지분 비율을 확인했습니다.</label>
          </div>}
          <label className="acq-field">금액·면적 및 계산 사실 검토 근거<textarea data-testid="acquisition-calc-review-note" rows="3" value={d.calculation.review_note ?? ''} onChange={e => changeCalculation('review_note', e.target.value)}/></label>
          <label><input data-testid="acquisition-calc-price-confirm" type="checkbox" checked={!!d.calculation.transaction_price_confirmed} onChange={e => changeCalculation('transaction_price_confirmed', e.target.checked)}/>실제 취득가격과 부대비용 반영 여부를 확인했습니다.</label><br/>
          <label><input data-testid="acquisition-calc-scope-confirm" type="checkbox" checked={!!d.calculation.ordinary_scope_confirmed} onChange={e => changeCalculation('ordinary_scope_confirmed', e.target.checked)}/>{d.schema_version === 'acquisition-case/3' ? '2026-07-01~2026-10-17 일부지분 취득' : '2026-01-01~2026-10-17 전체 지분 취득'}, 자연인 일반 주택 매매, 취득 후 1주택, 특수관계 없음, 감면·일시적 2주택 없음, 고급주택 등 중과 없음, 부속토지 법정 면적 한도 이내를 확인했습니다.</label><br/>
          <label><input data-testid="acquisition-calc-facts-confirm" type="checkbox" checked={!!d.calculation.facts_confirmed} onChange={e => changeCalculation('facts_confirmed', e.target.checked)}/>원본 자료, 취득일, 당사자 관계와 위 계산 사실을 확인했습니다.</label>
          </fieldset>
          <p>금액은 원 단위 정수(최대 9,007,199,254,740,991원), 면적은 양수·소수 둘째 자리까지 입력합니다. 계산 가능 여부는 저장 후 표시됩니다.</p>
          {!readonly && <button data-testid="acquisition-run" disabled={busy} onClick={() => act(async () => {
            const saved = await save();
            if (!saved.validation?.can_run) throw new Error('계산에 필요한 입력과 확인 항목을 마친 뒤 저장해 주세요.');
            const result = await mutation(base + '/runs', 'POST',
              { revision_id: saved.revision_id, expected_input_hash: saved.input_hash });
            if (result.status !== 'succeeded') throw new Error('계산이 완료되지 않았습니다. 입력을 확인해 주세요.');
            await load(saved.case_id);
          })}>입력 저장 후 계산</button>}
        </section>}
        {w.run?.response_snapshot && <section className="acq-section" aria-label="저장된 취득세 계산 결과">
          <h2>저장된 계산 결과</h2>
          {acquisitionDirty(w) && <p>현재 화면에 저장하지 않은 변경이 있습니다. 아래 결과는 마지막 저장 버전의 결과입니다.</p>}
          <p data-testid="acquisition-result-total">총세액 {w.run.response_snapshot.calc?.세액 ?? '—'}원</p>
          <div className="acq-grid">{['취득세', '지방교육세', '농어촌특별세', '과세표준', '적용세율'].map(key =>
            <p key={key}>{key}: {w.run.response_snapshot.calc?.[key] ?? '—'}</p>)}</div>
          {w.run.response_snapshot.calc?.구성별취득가액 && <div data-testid="acquisition-component-results">{w.run.response_snapshot.calc.구성별취득가액.map(r => <p key={r.component}>{r.component === 'land' ? '토지' : '건물'} 취득가액: {r.amount}원</p>)}<p>동일 세율 취득가액 합계로 계산한 세액입니다.</p></div>}
          {w.run.response_snapshot.calc?.용도별계산 && <div data-testid="acquisition-mixed-results">{w.run.response_snapshot.calc.용도별계산.map(r => <div key={r.component}><h3>{r.component === 'housing' ? '주택분' : '비주택분'}</h3><pre>{JSON.stringify(r.calc,null,2)}</pre></div>)}<p>용도별 본세 합계이며 최종 신고 납부세액은 아닙니다.</p></div>}
          <h3>계산 단계</h3><pre>{JSON.stringify(w.run.response_snapshot.calc?.단계별계산 ?? [], null, 2)}</pre>
          <h3>경고·적용 범위</h3><pre>{JSON.stringify({ 경고사항: w.run.response_snapshot.calc?.경고사항 ?? [], result_scope: w.run.response_snapshot.result_scope }, null, 2)}</pre>
        </section>}
        <JTAcquisitionFilingTaxes key={base + ':tax:' + w.meta.revision} saved={w.meta.case_input} draft={d}
          busy={busy} readonly={readonly} dirty={acquisitionDirty(w)} api={api} act={act} base={base}
          onConnect={async selection => {
            const saved = await mutation(base + '/filing-tax-connections', 'POST', selection, ref.current.meta.etag);
            await load(saved.case_id);
          }}/>
        <JTAcquisitionFilingAssets draft={d} saved={w.meta.case_input} disabled={busy || readonly}
          dirty={acquisitionDirty(w)} onChange={filing_assets => remember({ ...ref.current, draft: { ...ref.current.draft, filing_assets } })}/>
        {!readonly && <JTAcquisitionSources key={base + ':' + w.meta.revision + ':' + (d.case_info.acquisition_date || '')}
          api={api} act={act} base={base} draft={d} busy={busy}
          onAssetImport={async (selection, snapshot) => {
            const saved = await mutation(base + '/filing-asset-imports', 'POST', { label: ref.current.label, draft: ref.current.draft,
              selection, expected_source_hash: snapshot.source_hash }, ref.current.meta.etag);
            await load(saved.case_id);
          }}
          onImport={async (selection, snapshot) => {
            const saved = await mutation(base + '/source-imports', 'POST', { label: ref.current.label, draft: ref.current.draft,
              selection, expected_source_hash: snapshot.source_hash }, ref.current.meta.etag);
            await load(saved.case_id);
          }}/>}
        {(w.meta.validation?.missing_fields || []).length > 0 && <section aria-label="초안 보완 항목"><p>마지막 저장 기준 보완 항목</p><ul>{w.meta.validation.missing_fields.map((x, i) => <li key={i}>{acquisitionMissingLabels[x] || x}</li>)}</ul></section>}
        {(w.meta.validation?.errors || []).length > 0 && <section role="alert"><p>마지막 저장 기준 오류</p><ul>{w.meta.validation.errors.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
        <div className="acq-actions"><button data-testid="acquisition-save" disabled={busy || readonly} onClick={() => act(save)}>입력 저장</button></div>
      </>}
      <div className="acq-actions"><label>다시 열 입력 버전<input data-testid="acquisition-reopen-revision" inputMode="numeric" value={revision} onChange={e => setRevision(e.target.value.replace(/[^0-9]/g, ''))}/></label>
        <button data-testid="acquisition-reopen" disabled={busy} onClick={() => {
          if (!acquisitionDirty(ref.current) || window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?')) act(() => load(w.meta.case_id, revision));
        }}>저장본 다시 열기</button></div>
    </>}
  </div>;
}
function JTAcquisitionSources({ api, act, base, draft, busy, onImport, onAssetImport }) {
  const eventDate = draft.case_info.acquisition_date || '';
  const [catalog, setCatalog] = React.useState(null), [options, setOptions] = React.useState(null);
  const [choice, setChoice] = React.useState({ property_id: '', acquirer_person_id: '', previous_owner_person_id: '',
    property_version: 'current', acquirer_version: 'current', previous_owner_version: 'current', valuation_id: '',
    applicable_from: eventDate, applicable_until: eventDate, reason: '', confirmed: false });
  const [preview, setPreview] = React.useState(null);
  const generation = React.useRef(0), alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const choose = (key, value) => {
    generation.current++;
    setPreview(null);
    const sourceChanged = ['property_id', 'acquirer_person_id', 'previous_owner_person_id'].includes(key);
    if (sourceChanged) setOptions(null);
    setChoice(old => ({ ...old, [key]: value, confirmed: key === 'confirmed' ? value : false,
      ...(sourceChanged ? { property_version: 'current', acquirer_version: 'current', previous_owner_version: 'current', valuation_id: '' } : {}),
      ...(key === 'acquirer_person_id' && value === old.previous_owner_person_id ? { previous_owner_person_id: '' } : {}) }));
  };
  const selection = () => ({
    property_id: choice.property_id || null,
    acquirer_person_id: choice.acquirer_person_id || null,
    previous_owner_person_id: choice.previous_owner_person_id || null,
    valuation_id: choice.valuation_id || null,
    property_version: choice.property_version,
    acquirer_version: choice.acquirer_version,
    ...(choice.previous_owner_person_id ? { previous_owner_version: choice.previous_owner_version } : {}),
    event_date: eventDate,
    applicable_from: choice.applicable_from,
    applicable_until: choice.applicable_until,
    confirmed: choice.confirmed,
    reason: choice.reason
  });
  const versionOptions = (items, kind) => <>
    <option value="current">현재 원본</option>
    {(items || []).filter(x => String(x.version) !== 'current').map(x =>
      <option key={String(x.version)} value={String(x.version)}>{x.label || ('기록 버전 ' + x.version)} · {kind === 'property' ? x.record?.address : x.record?.name}</option>)}
  </>;
  const property = catalog?.properties?.find(x => x.id === choice.property_id);
  const acquirer = catalog?.persons?.find(x => x.id === choice.acquirer_person_id);
  const previous = catalog?.persons?.find(x => x.id === choice.previous_owner_person_id);
  const validPreview = preview && preview.signature === JSON.stringify(selection());
  return <fieldset disabled={busy} className="acq-section" aria-label="공통 당사자·재산·평가 채택">
    <legend>공통 당사자·재산·평가 원본</legend>
    <p>원본과 기록된 과거 버전을 명시적으로 선택합니다. 평가금액은 출처 확인용으로 보관하며 여기서 세액을 계산하지 않습니다.</p>
    {!eventDate && <p role="alert">원본을 채택하려면 먼저 취득일을 입력하세요.</p>}
    <button data-testid="acquisition-source-load" onClick={() => act(async () => { setCatalog(await api(base + '/sources')); setOptions(null); setPreview(null); })}>공통 원본 조회</button>
    {catalog && <>
      <div className="acq-grid">
        <label>재산<select data-testid="acquisition-source-property" value={choice.property_id} onChange={e => choose('property_id', e.target.value)}>
          <option value="">선택</option>{catalog.properties.map(x => <option key={x.id} value={x.id}>{x.address} · {x.property_type}</option>)}</select></label>
        <label>취득자 원본<select data-testid="acquisition-source-acquirer" value={choice.acquirer_person_id} onChange={e => choose('acquirer_person_id', e.target.value)}>
          <option value="">선택</option>{catalog.persons.map(x => <option key={x.id} value={x.id}>{x.name} · {x.birth_date || '생년월일 미상'}</option>)}</select></label>
        <label>전소유자 원본 (선택)<select data-testid="acquisition-source-previous_owner" value={choice.previous_owner_person_id} onChange={e => choose('previous_owner_person_id', e.target.value)}>
          <option value="">선택하지 않음</option>{catalog.persons.filter(x => x.id !== choice.acquirer_person_id).map(x => <option key={x.id} value={x.id}>{x.name} · {x.birth_date || '생년월일 미상'}</option>)}</select></label>
      </div>
      <p>선택: {property?.address || '재산 미선택'} · {acquirer?.name || '취득자 미선택'} · {previous?.name || '전소유자 미선택'}</p>
      <button data-testid="acquisition-source-options" disabled={!eventDate || !choice.property_id || !choice.acquirer_person_id}
        onClick={() => act(async () => {
          const id = ++generation.current;
          const q = new URLSearchParams({ property_id: choice.property_id, acquirer_person_id: choice.acquirer_person_id });
          if (choice.previous_owner_person_id) q.set('previous_owner_person_id', choice.previous_owner_person_id);
          const data = await api(base + '/source-options?' + q.toString());
          if (alive.current && id === generation.current) setOptions(data);
        })}>원본 버전·평가자료 조회</button>
    </>}
    {options && <>
      <div className="acq-grid">
        <label>재산 사실 버전<select data-testid="acquisition-source-property-version" value={choice.property_version} onChange={e => choose('property_version', e.target.value)}>{versionOptions(options.property_versions, 'property')}</select></label>
        <label>취득자 사실 버전<select data-testid="acquisition-source-acquirer-version" value={choice.acquirer_version} onChange={e => choose('acquirer_version', e.target.value)}>{versionOptions(options.acquirer_versions, 'person')}</select></label>
        {choice.previous_owner_person_id && <label>전소유자 사실 버전<select data-testid="acquisition-source-previous_owner-version" value={choice.previous_owner_version} onChange={e => choose('previous_owner_version', e.target.value)}>{versionOptions(options.previous_owner_versions, 'person')}</select></label>}
        <label>평가자료<select data-testid="acquisition-source-valuation" value={choice.valuation_id} onChange={e => choose('valuation_id', e.target.value)}>
          <option value="">선택</option>{options.valuations.map(x => <option key={x.id} value={x.id}>{x.as_of_date} · {x.valuation_type} · {x.amount}원 · {x.source}</option>)}</select></label>
        <label>사실 적용 시작일<input data-testid="acquisition-source-from" type="date" value={choice.applicable_from} onChange={e => choose('applicable_from', e.target.value)}/></label>
        <label>사실 적용 종료일<input data-testid="acquisition-source-until" type="date" value={choice.applicable_until} onChange={e => choose('applicable_until', e.target.value)}/></label>
      </div>
      <label className="acq-field">선택 원본을 이번 취득일에 적용하는 근거<input data-testid="acquisition-source-reason" maxLength={1000} value={choice.reason} onChange={e => choose('reason', e.target.value)}/></label>
      <label><input data-testid="acquisition-source-confirm" type="checkbox" checked={choice.confirmed} onChange={e => choose('confirmed', e.target.checked)}/>선택한 원본 버전, 평가 기준일·금액, 적용기간과 당사자를 확인했습니다.</label>
      <div className="acq-actions"><button data-testid="acquisition-source-preview" disabled={!choice.valuation_id || !choice.confirmed || !choice.reason.trim() || !choice.applicable_from || !choice.applicable_until}
        onClick={() => act(async () => {
          const selected = selection(), signature = JSON.stringify(selected), id = ++generation.current;
          const snapshot = await api(base + '/source-preview', { method: 'POST', body: JSON.stringify(selected) });
          if (alive.current && id === generation.current) setPreview({ snapshot, signature });
        })}>선택 원본 미리보기</button></div>
      {validPreview && <section className="acq-section" aria-label="선택 원본 미리보기">
        <h3>채택할 원본</h3>
        <p data-testid="acquisition-source-preview-details">재산 {preview.snapshot.property.address} · 취득자 {preview.snapshot.parties.acquirer.name}
          {preview.snapshot.parties.previous_owner && ' · 전소유자 ' + preview.snapshot.parties.previous_owner.name}</p>
        <p>평가 기준일 {preview.snapshot.valuation.as_of_date} · {preview.snapshot.valuation.valuation_type} · 원본 금액 {preview.snapshot.valuation.amount}원 · {preview.snapshot.valuation.source}</p>
        <p>선택 사실 버전: 재산 {choice.property_version} · 취득자 {choice.acquirer_version}{choice.previous_owner_person_id && ' · 전소유자 ' + choice.previous_owner_version}</p>
        <button data-testid="acquisition-source-import" onClick={() => act(async () => {
          if (preview.signature !== JSON.stringify(selection())) throw new Error('원본 선택이나 취득일이 바뀌었습니다. 다시 미리보세요.');
          if (!window.confirm('선택한 당사자·재산·평가 원본을 새 저장 버전으로 채택합니다. 당사자 관계 확인은 다시 입력해야 합니다.')) return;
          try { await onImport(selection(), preview.snapshot); if (alive.current) setPreview(null); }
          catch (e) {
            if (e.message?.includes('미리보기 이후 공통 원본이 바뀌었습니다') && alive.current) {
              setPreview(null);
              setOptions(null);
            }
            throw e;
          }
        })}>원본 채택·새 버전 저장</button>
        <button data-testid="acquisition-asset-import" onClick={() => act(async () => {
          if (preview.signature !== JSON.stringify(selection())) throw new Error('원본 선택이나 취득일이 바뀌었습니다. 다시 미리보세요.');
          await onAssetImport(selection(), preview.snapshot);
          if (alive.current) setPreview(null);
        })}>물건별 신고정보에 추가·저장</button>
      </section>}
    </>}
  </fieldset>;
}

function JTAcquisitionFilingAssets({ draft, saved, disabled, dirty, onChange }) {
  const envelope = draft.filing_assets;
  const update = (id, patch) => onChange({ ...envelope, assets: envelope.assets.map(a => a.line_id === id ?
    { ...a, ...patch, review_state: Object.hasOwn(patch, 'review_state') ? patch.review_state : 'unknown' } : a) });
  return <fieldset disabled={disabled} className="acq-section" aria-label="물건별 신고정보"><legend>물건별 신고정보</legend>
    <p>아래 공통 원본 선택에서 물건별 신고정보에 추가하세요. 평가금액의 범위·용도를 확인한 뒤 연결합니다. 지분은 직접 확인하며, 전용면적은 지분으로 줄이지 않습니다.</p>
    <p>자동 후보는 전체 값 × 취득 지분입니다. 금액은 원 미만, 면적은 소수 넷째 자리 아래를 버립니다. 직접수정을 선택하면 근거와 함께 저장하며, 자동 후보도 보관합니다.</p>
    {(envelope?.assets || []).map((a, i) => {
      const src = saved?.filing_asset_sources?.[a.line_id];
      const projection = saved?.filing_data?.assets.find(x => x.line_id === a.line_id);
      const field = (key, label, type = 'text') => <label key={key}>{label}<input data-testid={'acquisition-asset-' + i + '-' + key}
        type={type} value={a[key] ?? ''} onChange={e => update(a.line_id, { [key]: e.target.value || (type === 'date' || ['whole_value','land_whole','building_whole','physical_exclusive','share_numerator','share_denominator'].includes(key) ? null : '') })}/></label>;
      return <section key={a.line_id} className="acq-section"><h3>물건 {i + 1} · {src?.property.address || '채택 원본'}</h3>
        <p>공통 재산 종류: {src?.property.property_type} · 평가 {src?.valuation.valuation_type} · {src?.valuation.as_of_date} · {src?.valuation.amount}원 · {src?.valuation.source}</p>
        <div className="acq-grid">{[['acquisition_cause','취득원인'],['asset_code','확인한 물건 코드·구분'],['property_use','물건 용도'],['acquisition_date','물건 취득일','date'],['share_numerator','취득 지분 분자'],['share_denominator','취득 지분 분모']].map(x => field(...x))}
          <label>평가 원본의 금액 범위<select data-testid={'acquisition-asset-' + i + '-valuation_scope'} value={a.valuation_scope} onChange={e => update(a.line_id,{valuation_scope:e.target.value})}>
            <option value="unknown">미확인</option><option value="whole">전체 가액</option><option value="acquired">취득분 가액</option><option value="component">구성요소 가액</option></select></label>
          <label>가액 용도<select data-testid={'acquisition-asset-' + i + '-value_purpose'} value={a.value_purpose} onChange={e => update(a.line_id,{value_purpose:e.target.value})}>
            <option value="unknown">미확인</option><option value="transaction">거래 가액</option><option value="standard">시가표준액</option><option value="other">기타 평가 가액</option></select></label>
        </div>
        <button type="button" data-testid={'acquisition-asset-' + i + '-copy-value'} disabled={!src || !['whole','acquired'].includes(a.valuation_scope)} onClick={() => {
          if (!window.confirm('선택한 범위의 가액 입력을 채택 평가금액으로 바꿀까요?')) return;
          update(a.line_id, a.valuation_scope === 'whole' ? {whole_value:src.valuation.amount} :
            {acquired_value:{...a.acquired_value,mode:'manual',manual:src.valuation.amount,reason:'채택 평가자료의 취득분 금액'}});
        }}>확인한 범위에 평가금액 연결</button>
        <div className="acq-grid">{[['whole_value','전체 가액(원)'],['land_whole','전체 토지면적(㎡)'],['building_whole','전체 건물면적(㎡)'],['physical_exclusive','물리적 전용면적(㎡)']].map(x => field(...x))}</div>
        {[['acquired_value','취득분 가액(원)'],['land_acquired','취득 토지면적(㎡)'],['building_acquired','취득 건물면적(㎡)']].map(([key,label]) => <div key={key} className="acq-section"><h4>{label}</h4><div className="acq-grid">
          <label>사용할 값<select data-testid={'acquisition-asset-' + i + '-' + key + '-mode'} value={a[key].mode} onChange={e => update(a.line_id,{[key]:{...a[key],mode:e.target.value}})}>
            <option value="unknown">미확인</option><option value="proportional">전체 × 지분 자동 후보</option><option value="manual">직접수정</option></select></label>
          <label>직접수정 값<input data-testid={'acquisition-asset-' + i + '-' + key + '-manual'} value={a[key].manual ?? ''} onChange={e => update(a.line_id,{[key]:{...a[key],manual:e.target.value || null}})}/></label>
          <label>직접수정 근거<input data-testid={'acquisition-asset-' + i + '-' + key + '-reason'} maxLength={2000} value={a[key].reason} onChange={e => update(a.line_id,{[key]:{...a[key],reason:e.target.value}})}/></label>
        </div>{!dirty && projection && <p data-testid={'acquisition-asset-' + i + '-' + key + '-resolved'}>저장된 자동 후보: {projection.values[key].automatic_candidate ?? '미확인'} · 선택 값: {projection.values[key].selected ?? '미확인'}</p>}</div>)}
        <div className="acq-grid">{field('review_note','물건별 확인 근거')}<label>물건별 검토<select data-testid={'acquisition-asset-' + i + '-review_state'} value={a.review_state} onChange={e => update(a.line_id,{review_state:e.target.value})}>
          <option value="unknown">미확인</option><option value="confirmed">확인</option></select></label></div>
        {!dirty && projection && <p>저장 기준 보완: {projection.missing_fields.join(' · ') || '입력 검토 완료 (신고 완성 아님)'}</p>}
        <button type="button" data-testid={'acquisition-asset-' + i + '-remove'} onClick={() => {
          if (window.confirm('현재 초안에서 이 물건 행을 제거할까요? 이전 저장본에는 보존됩니다.')) onChange({...envelope,assets:envelope.assets.filter(x => x.line_id !== a.line_id)});
        }}>물건 행 제거</button>
      </section>;
    })}
    {dirty && <p>변경한 값의 자동 후보와 신고 데이터는 입력 저장 후 확인할 수 있습니다.</p>}
  </fieldset>;
}

function JTAcquisitionFilingTaxes({ saved, draft, busy, readonly, dirty, api, act, base, onConnect }) {
  const [results, setResults] = React.useState([]), [runId, setRunId] = React.useState(''), [lineId, setLineId] = React.useState('');
  const snapshot = saved?.filing_tax_snapshot, status = saved?.filing_tax_status;
  const chosen = results.find(r => r.run_id === runId);
  return <section className="acq-section" aria-label="신고 세액행"><h2>저장된 계산 결과 → 신고 세액행</h2>
    <p>지원 범위 내 일반 주택·비주택 매매 계산 결과의 취득세·지방교육세·농어촌특별세 본세를 연결합니다. 연결은 새 저장 버전을 만들며 세금을 계산하지 않습니다.</p>
    {snapshot && <>
      <p data-testid="acquisition-tax-status">{dirty ? '저장하지 않은 변경 있음 · 아래는 저장본 기준' : status?.state === 'linked' ? '저장된 결과 연결됨' : '재연결 필요'} · 계산 입력 버전 {snapshot.source.revision}</p>
      {status?.reason && <p role="alert">{status.reason}</p>}
      <table><thead><tr><th>세목</th><th>본세(원)</th><th>구분</th></tr></thead><tbody>
        {snapshot.tax_lines.map(x => <tr key={x.tax_type}><td>{x.label}</td><td data-testid={'acquisition-tax-'+x.tax_type}>{x.amount}</td><td>저장된 본세</td></tr>)}
      </tbody></table><p data-testid="acquisition-tax-total">본세 합계 {snapshot.principal_total}원</p>
      <p>감면·가산세·기납부·차감납부액은 연결되지 않았습니다. 신고서 완성 상태가 아닙니다.</p>
      {!saved.filing_data?.tax_summary?.coverage_complete && <p>세액 연결이 필요한 물건 또는 변경된 입력이 있습니다.</p>}
      <details><summary>계산 출처</summary><p>실행 {snapshot.source.run_id} · 입력 {snapshot.source.revision_id}</p><p>엔진 {snapshot.source.version.engine} · 세율 자료 {snapshot.source.version.tax_rates_version}</p><p>{snapshot.source.result_scope}</p></details>
    </>}
    {!readonly && <fieldset disabled={busy || dirty}><legend>계산 결과와 물건 선택</legend>
      <button type="button" data-testid="acquisition-tax-load" onClick={() => act(async () => {
        const data = await api(base + '/filing-tax-results');setResults(data.results);setRunId('');
      })}>저장된 계산 결과 조회</button>
      <div className="acq-grid"><label>저장된 계산 결과<select data-testid="acquisition-tax-run" value={runId} onChange={e => setRunId(e.target.value)}>
        <option value="">선택</option>{results.map(r => <option key={r.run_id} value={r.run_id}>입력 버전 {r.revision} · {r.computed_at} · 본세 {r.principal_total}원</option>)}</select></label>
        <label>신고 물건<select data-testid="acquisition-tax-asset" value={lineId} onChange={e => setLineId(e.target.value)}>
          <option value="">선택</option>{(draft.filing_assets?.assets || []).map((a,i) => <option key={a.line_id} value={a.line_id}>물건 {i+1} · {saved?.filing_asset_sources?.[a.line_id]?.property.address || a.property_use}</option>)}</select></label></div>
      <button type="button" data-testid="acquisition-tax-connect" disabled={busy || dirty || !chosen || !lineId} onClick={() => act(() => onConnect({run_id:chosen.run_id,asset_line_id:lineId,expected_run_input_hash:chosen.input_hash}))}>세액행 연결·새 버전 저장</button>
    </fieldset>}
    {dirty && <p>입력 저장 후 계산 결과를 연결해 주세요.</p>}
  </section>;
}

window.JTAcquisitionCases = JTAcquisitionCases;
