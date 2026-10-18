/* Authenticated gift cases. Uses the existing GIFT_QS and server mapper.
   Session/draft live in memory only: no access token or taxpayer data in Web Storage. */
let jtGiftSession = { token: '', uid: '', workspace: null };
const GIFT_ADJUSTMENTS = [
  ['prior_marriage_child_deduction_used', '혼인·출산 공제 기사용액'],
  ['non_taxable', '비과세 재산가액'], ['appraisal_fee', '감정평가 수수료'],
  ['foreign_tax_paid', '외국납부세액'],
];
const GIFT_HISTORY_FLAGS = [
  ['is_generation_skip', '과거 증여도 세대생략이었나요?'],
  ['is_minor', '과거 증여 당시 미성년이었나요?'],
  ['donor_child_deceased', '과거 증여 당시 건너뛴 자녀가 사망했나요?'],
];
function giftNewDraft(answers = {}) {
  return { schema_version: 'gift-case/1', ui_schema_version: 'gift-ui/1', answers_raw: { ...answers },
    ui_state: { phase: 'detail', current_question_id: null, step: 0, ui_schema_version: 'gift-ui/1' },
    supplemental: { calculation_basis: 'current_engine', gift_date: null, donor_person_id: null,
      donee_person_id: null, relationship_as_of: null, marriage_date: null, childbirth_date: null,
      child_name: null, deduction_eligibility_confirmed: false, value_basis: 'gifted_interest_value',
      adjustments: Object.fromEntries(GIFT_ADJUSTMENTS.map(([k]) => [k, 0])), adjustments_confirmed: false,
      history_inclusion_confirmed: false, prior_gift_deduction_confirmed: false, history_flags_confirmed: false,
      aggregate_history_flags: Object.fromEntries(GIFT_HISTORY_FLAGS.map(([k]) => [k, null])),
      prior_gifts: [], assets: [], multiasset_confirmed: false, primary_value_source: "" }, valuation_snapshot: null };
}
function giftInputIssue(issue) {
  if(issue.code==='NONHOUSING_SOURCE_REIMPORT_REQUIRED')return '토지·상가 채택 당시 금액·당사자·날짜·평가자료가 변경됐습니다. 검토 후 원본을 다시 채택하세요.';
  if(issue.code==='ADDITIONAL_SOURCE_REIMPORT_REQUIRED')return '추가 원본의 사건 당사자·날짜 또는 재산 조건이 달라졌습니다. 해당 행을 다시 채택하거나 제거하세요.';
  if(issue.code==='SOURCE_PROPERTY_DUPLICATE')return '첫 재산과 추가 재산의 원본이 중복됩니다. 중복 행을 제거하세요.';
  const messages = { OWNERSHIP_HISTORY_REIMPORT_REQUIRED:'사건 날짜 또는 증여자가 바뀌었습니다. 해당 날짜의 소유 지분 자료를 다시 가져와 주세요', REQUIRED_FIELD: '필수 입력을 확인해 주세요', INVALID_CHOICE: '선택값을 확인해 주세요',
    ADJUSTMENTS_UNCONFIRMED: '조정금액을 확인해 주세요', PRIOR_FLAGS_UNCONFIRMED: '과거 증여의 세 상태를 선택하고 확인해 주세요',
    PRIOR_DEDUCTION_UNCONFIRMED: '과거 공제 사용액을 확인해 주세요', PRIOR_INCLUSION_UNCONFIRMED: '과거 증여의 합산 대상 여부를 확인해 주세요',
    DEDUCTION_ELIGIBILITY_UNCONFIRMED: '혼인·출산 적용 요건을 확인해 주세요',
    UNSUPPORTED_NONRESIDENT: '비거주자는 초안 저장만 지원합니다', UNSUPPORTED_BURDENED_GIFT: '부담부증여는 초안 저장만 지원합니다',
    MULTIASSET_REVIEW_REQUIRED: '같은 당사자·증여일·일반 증여 범위를 확인해 주세요', MULTIASSET_DATE_UNSUPPORTED: '다자산은 2026년 증여일을 입력해 주세요', MULTIASSET_PARTIES_REQUIRED: '서로 다른 증여자·수증자를 선택해 주세요', MULTIASSET_VALUATION_DATE_MISMATCH: '추가 재산의 평가 기준일은 사건 증여일과 같아야 합니다', VALUATION_AMOUNT_MISMATCH: '채택 평가액과 입력 평가액이 다릅니다',
    VALUATION_REVIEW_REQUIRED: '평가 자료를 재확인해 주세요', DETAIL_INCOMPLETE: '상세 입력이 필요합니다' };
  const key = (issue.field_path || '').split('.').pop();
  const question = typeof GIFT_QS === 'undefined' ? null : GIFT_QS.find(q => q.id === key);
  return (messages[issue.code] || '입력 확인이 필요합니다') + (question ? ': ' + question.q : '') + ' [' + issue.code + ']';
}
function giftExactWon(value) { return Number(value).toLocaleString('ko-KR') + '원'; }
function giftPackDraft(draft) {
  const packed = JSON.parse(JSON.stringify(draft));
  for (const [key, title] of GIFT_ADJUSTMENTS) {
    const raw = packed.supplemental.adjustments[key];
    const n = Number(String(raw).replace(/,/g, ''));
    if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(String(raw)) || !Number.isSafeInteger(n) || n < 0) throw new Error(title + ': 0 이상의 원 단위 정수를 입력해 주세요.');
    packed.supplemental.adjustments[key] = n;
  }
  if (packed.valuation_snapshot) {
    for (const k of ['candidate_amount', 'adopted_amount']) {
      const raw = packed.valuation_snapshot[k];
      if (raw == null || raw === '') { packed.valuation_snapshot[k] = null; continue; }
      const n = Number(String(raw).replace(/,/g, ''));
      if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(String(raw)) || !Number.isSafeInteger(n) || n < 0) throw new Error('평가금액은 0 이상의 원 단위 정수로 입력해 주세요.');
      packed.valuation_snapshot[k] = n;
    }
  }
  return packed;
}
const GIFT_NONHOUSING_CHECKS = [
  ['market_priority_confirmed','시가 우선·평가방법과 최종 가액의 법령 적용을 확인했습니다'],
  ['lease_security_confirmed','임대차·담보재산의 평가 특례를 검토한 최종 가액입니다'],
  ['no_debt_assumption_confirmed','이번 증여에서는 채무·임대보증금을 인수하지 않습니다'],
  ['no_overlap_confirmed','다른 재산 행과 토지·건물·대지권 가액이 중복되지 않습니다']];
function giftNonhousingReview() { return {coverage:'',valuation_method:'',scope_note:'',review_note:'',...Object.fromEntries(GIFT_NONHOUSING_CHECKS.map(([k])=>[k,false]))}; }
function GiftNonhousingSaved({source}) {
  const r=source?.selection?.nonhousing_review;
  return r?<div data-testid="nonhousing-saved"><p>재산ID {source.property.id} · 소유ID {source.ownership.id} · 평가ID {source.valuation.id}</p>
    <p>포함 범위: {{land_only:'토지만',building_only:'건물만',land_and_building:'토지·건물 함께'}[r.coverage]} · {r.scope_note}</p>
    <p>평가 검토: {r.valuation_method==='market'?'시가':'시가 산정 곤란에 따른 보충적 평가'} · {r.review_note}</p>
    <p>채무 미인수·중복 제외·시가 우선·임대차/담보 특례 검토 확인을 원본과 함께 보존합니다.</p></div>:null;
}
function GiftCaseField({ title, hint, children }) {
  return <label className="gc-field"><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function GiftCaseCheck({ label, checked, onChange }) {
  return <label className="gc-check"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
}
function GiftCaseBool({ title, value, onChange }) {
  return <GiftCaseField title={title}><select value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
    <option value="">미확인</option><option value="true">예</option><option value="false">아니오</option>
  </select></GiftCaseField>;
}

function JTGiftCases({ initialAnswers, initialValuation, onAnswers, onExit, exitLabel = "← 빠른 계산으로" }) {
  const savedMemory = React.useRef(jtGiftSession.workspace).current;
  const [draft, setDraft] = React.useState(() => {
    if (!savedMemory) return { ...giftNewDraft(initialAnswers), valuation_snapshot: initialValuation || null };
    if (!Object.keys(initialAnswers || {}).length || savedMemory.meta?.read_only || savedMemory.meta?.revision !== savedMemory.meta?.current_revision) return savedMemory.draft;
    const changed = JSON.stringify(initialAnswers) !== JSON.stringify(savedMemory.draft.answers_raw);
    if (!changed) return savedMemory.draft;
    const next = { ...savedMemory.draft, answers_raw: { ...initialAnswers } };
    if (initialValuation && initialValuation !== savedMemory.initialValuation) next.valuation_snapshot = initialValuation;
    if (next.valuation_snapshot && String(next.valuation_snapshot.adopted_amount ?? '') !== String(initialAnswers.giftValue ?? ''))
      next.valuation_snapshot = { ...next.valuation_snapshot, adopted_amount: initialAnswers.giftValue || null, manual_override: true };
    next.supplemental = { ...next.supplemental, multiasset_confirmed: false, deduction_eligibility_confirmed: false, prior_gift_deduction_confirmed: false, history_inclusion_confirmed: false };
    return next;
  });
  const [equityTarget,setEquityTarget]=React.useState('primary');
  const [clientId, setClientId] = React.useState(savedMemory?.clientId || '');
  const [label, setLabel] = React.useState(savedMemory?.label || '');
  const [meta, setMeta] = React.useState(savedMemory?.meta || null);
  const [baseline, setBaseline] = React.useState(savedMemory?.baseline || null);
  const [touched, setTouched] = React.useState(savedMemory?.touched || Object.keys(initialAnswers || {}).length > 0);
  const [run, setRun] = React.useState(savedMemory?.run || null);
  const [request, setRequest] = React.useState(savedMemory?.request || null);
  const [token, setToken] = React.useState(jtGiftSession.token);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [clients, setClients] = React.useState([]);
  const [persons, setPersons] = React.useState([]);
  const [cases, setCases] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [reopenRevision, setReopenRevision] = React.useState('');
  const [reports, setReports] = React.useState([]);
  const [reportId, setReportId] = React.useState('');
  const [filingDirty, setFilingDirty] = React.useState(false);
  const [ownerTimeline,setOwnerTimeline] = React.useState(null);
  const ownerQuery = React.useRef(0);
  const [sourceCatalog, setSourceCatalog] = React.useState(null);
  const [sourceChoice, setSourceChoice] = React.useState({ property_id:'', ownership_id:'', donee_person_id:'', valuation_id:'', gift_share:'', gift_date:'', re_type:'', adoption_reason:'', valuation_confirmed:false, nonhousing_review:giftNonhousingReview() });
  const [sourcePreview, setSourcePreview] = React.useState(null);
  const [sourceTarget,setSourceTarget] = React.useState('primary');
  const [sourceQueue,setSourceQueue] = React.useState([]);
  const sourceVersion = React.useRef(0);
  const operationKeys = React.useRef(savedMemory?.operationKeys || {});
  const contentKey = JSON.stringify({ clientId, label, draft });
  const dirty = baseline == null ? touched : contentKey !== baseline;
  const readonly = !!meta?.read_only || (meta && meta.revision !== meta.current_revision);
  const a = draft.answers_raw, s = draft.supplemental;
  const base = () => (window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const keyFor = (kind, body) => {
    const fingerprint = JSON.stringify([kind, body]);
    return operationKeys.current[fingerprint] ||= window.crypto.randomUUID();
  };
  React.useEffect(() => {
    jtGiftSession.workspace = { draft, initialValuation, clientId, label, meta, baseline, touched, run, request, operationKeys: operationKeys.current };
  }, [draft, clientId, label, meta, baseline, touched, run, request]);
  React.useEffect(() => {
    const protect = e => { if (dirty || filingDirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, filingDirty, busy]);
  const requestApi = async (path, options = {}, authToken = token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const { download = false, ...requestOptions } = options;
      const response = await fetch(base() + path, { ...requestOptions, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}), ...options.headers } });
      const body = download && response.ok ? await response.blob() : await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) { jtGiftSession.token = ''; setToken(''); }
        const code = body.detail?.code;
        const messages = { REVISION_CONFLICT: '다른 화면에서 수정되었습니다. 입력은 유지했습니다. 새 사건으로 저장하거나 저장본을 다시 열어 주세요.',
          IDEMPOTENCY_CONFLICT: '같은 요청의 내용이 달라졌습니다. 저장 상태를 확인해 주세요.',
          SNAPSHOT_MIGRATION_REQUIRED: '이 저장본은 읽기 전용입니다. 지원 버전 변환이 필요합니다.',
          DRAFT_NOT_RUNNABLE: '초안은 저장됐습니다. 아래 확인 항목을 보완한 후 계산해 주세요.',
          RUN_STILL_PENDING: '이전 계산이 진행 중입니다. 상태를 확인해 주세요.',
          REPORT_STILL_PENDING: '문서를 생성 중입니다. 잠시 후 상태를 확인해 주세요.',
          ARTIFACT_ALREADY_READY: '이미 생성된 파일은 다시 만들지 않습니다. 저장된 파일을 내려받으세요.',
          RENDERER_VERSION_UNAVAILABLE: '이 보고서 버전의 출력 환경을 사용할 수 없습니다.',
          FILING_SOURCE_UNSUPPORTED: '선택한 계산 원본으로는 신고 입력을 만들 수 없습니다. 입력 버전과 성공한 계산 결과를 확인해 주세요.',
          RESOLVED_RECORDS_NOT_READY: '신고 입력의 확인 항목을 보완하고 다시 저장해 주세요.',
          FILING_EXPORT_UNAVAILABLE: '이 신고 저장본의 규격·출력 버전을 현재 서버에서 생성할 수 없습니다.',
          INVALID_FILING_REQUEST: '신고 입력 형식을 확인해 주세요. 입력값은 유지했습니다.',
          FILE_NOT_CREATED: '아직 생성된 부분 파일이 없습니다.',
          ARTIFACT_INTEGRITY_FAILED: '저장 파일의 무결성 검사에 실패했습니다. 다운로드를 중단했습니다.',
          DOCX_NOT_READY: 'DOCX가 먼저 생성되어야 PDF를 만들 수 있습니다.' };
        Object.assign(messages, {
          SOURCE_FACT_HISTORY_GAP:'원본 이력의 연결이 끊겼습니다. 변경 내역을 확인하세요.',SOURCE_FACT_VERSION_NOT_FOUND:'선택한 원본 버전을 찾을 수 없습니다.',SOURCE_FACT_NOT_FOUND:'해당 고객의 원본 자료가 없습니다.',SOURCE_FACT_DATE_INVALID:'선택 버전의 취득일·생년월일이 사건일보다 늦습니다.',SOURCE_FACT_APPLICABILITY_REQUIRED:'사건일을 포함하는 적용기간과 선택 근거를 확인하세요.',SOURCE_OWNERSHIP_HISTORY_GAP:'소유 이력과 현재 원본이 일치하지 않습니다. 변동 기록을 확인하세요.',SOURCE_OWNERSHIP_VERSION_DATE_MISMATCH:'사건 날짜에 맞는 소유 이력을 다시 조회하고 선택하세요.',SOURCE_OWNERSHIP_VERSION_OWNER_MISMATCH:'선택한 이력의 소유자를 다시 선택하세요.',SOURCE_OWNERSHIP_HISTORY_CONFIRM_REQUIRED:'과거 소유 지분과 현재 취득·평가자료의 사용을 확인하세요.',SOURCE_OWNERSHIP_DATE_REVIEW_REQUIRED:'현재 소유 변동일보다 이른 사건입니다. 과거 소유 자료를 확인해야 합니다.',SOURCE_CHANGED: '원본 자료가 확인 이후 변경됐습니다. 선택 자료를 다시 확인한 뒤 가져오세요.',
          SOURCE_EVENT_REQUIRED:'먼저 사건의 증여자·수증자·2026년 증여일을 입력하세요.',
          SOURCE_EVENT_MISMATCH:'추가 재산은 현재 사건과 증여자·수증자·증여일이 같아야 합니다.',
          SOURCE_VALUATION_DATE_MISMATCH:'추가 원본 채택은 증여일 기준 평가자료만 지원합니다.',
          SOURCE_FRACTIONAL_WON_UNSUPPORTED:'지분을 곱한 가액에 원 미만 금액이 있어 자동 채택할 수 없습니다.',
          SOURCE_PROPERTY_DUPLICATE:'이미 채택한 재산입니다. 해당 추가 행을 선택해 재채택하거나 중복 선택을 제거하세요.',
          SOURCE_TARGET_DUPLICATE:'같은 추가 행을 두 번 선택했습니다. 목록에서 중복을 제거하세요.',
          SOURCE_TARGET_INVALID:'채택 대상 추가 부동산 행이 없습니다. 대상을 다시 선택하세요.',
          SOURCE_BURDENED_UNSUPPORTED:'부담부증여의 추가 원본 채택은 아직 지원하지 않습니다.',
          SOURCE_ASSET_LIMIT:'첫 재산을 포함해 최대 100개까지 채택할 수 있습니다.',
          SOURCE_NOT_FOUND: '선택한 자료가 없거나 이 고객의 자료가 아닙니다.',
          SOURCE_NONHOUSING_REVIEW_REQUIRED:'토지·상가의 포함 범위·평가방법·검토 확인과 증여일 기준 최종 평가자료를 확인하세요. 지원 사건일은 2026-10-01~2026-10-18입니다.',
          SOURCE_PROPERTY_TYPE_MISMATCH:'등록 재산 유형과 선택한 부동산 구분이 다릅니다.',
          SOURCE_PROPERTY_UNSUPPORTED: '현재 자료 가져오기는 주택·토지·상가를 지원합니다. 분양권·입주권은 아직 연결하지 않았습니다.',
          SOURCE_SHARE_INVALID: '증여 지분은 0 초과이고 증여자 소유 지분 이하여야 합니다.',
          SOURCE_SAME_PARTY: '증여자와 수증자는 서로 다른 당사자를 선택해 주세요.',
          SOURCE_REVIEW_REQUIRED: '평가액 채택 이유를 입력해 주세요.',
          SOURCE_BIRTH_DATE_INVALID: '수증자의 생년월일과 증여일을 확인해 주세요.',
          SOURCE_AMOUNT_INVALID: '선택한 평가금액의 범위를 확인해 주세요.' });
        const exception = new Error(response.status === 401 ? '로그인이 필요합니다. 입력은 유지되어 있습니다.' : messages[code] ||
          (response.status === 404 ? '사건 서비스 또는 요청 자료를 찾지 못했습니다.' : response.status === 403 ? '사무소 등록을 확인해 주세요.' : '요청에 실패했습니다. 입력을 유지했습니다.'));
        exception.status = response.status; exception.detail = body.detail; throw exception;
      }
      return body;
    } finally { clearTimeout(timer); }
  };
  const act = async fn => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.name === 'AbortError' || e instanceof TypeError ? '연결을 확인해 주세요. 입력을 유지했습니다. 같은 작업을 다시 누르면 처리 상태를 확인합니다.' : e.message); }
    finally { setBusy(false); }
  };
  React.useEffect(() => {
    if (!token) return;
    let active = true;
    requestApi('/v1/gift-cases/context' + (clientId ? '?client_id=' + encodeURIComponent(clientId) : ''))
      .then(data => { if (active) { setClients(data.clients); setPersons(data.persons); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, clientId]);
  React.useEffect(() => {
    setReports([]); setReportId('');
    if (!token || !run) return;
    let active = true;
    requestApi('/v1/gift-cases/' + run.case_id + '/runs/' + run.run_id + '/reports')
      .then(data => { if (active) { setReports(data.items); setReportId(data.items[0]?.report_id || ''); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, run?.run_id]);
  const currentReport = reports.find(item => item.report_id === reportId);
  const acceptReport = data => {
    setReports(old => [data, ...old.filter(item => item.report_id !== data.report_id)]);
    setReportId(data.report_id);
    setNotice(data.status === 'ready' ? 'DOCX와 PDF가 저장됐습니다. 재계산하지 않았습니다.' : '보고서 형식별 상태를 확인해 주세요.');
  };
  const generateReport = async () => {
    const route = '/v1/gift-cases/' + run.case_id + '/runs/' + run.run_id + '/reports';
    const body = { template_version: 'gift-report/1', locale: 'ko-KR', formats: ['docx', 'pdf'] };
    const data = await requestApi(route, { method: 'POST', headers: { 'Idempotency-Key': keyFor(route, body) }, body: JSON.stringify(body) });
    // Lost responses replay the same key; a completed response ends this creation intent.
    if (data.status !== 'pending') delete operationKeys.current[JSON.stringify([route, body])];
    acceptReport(data);
  };
  const refreshReports = async () => {
    const data = await requestApi('/v1/gift-cases/' + run.case_id + '/runs/' + run.run_id + '/reports');
    setReports(data.items); setReportId(data.items.some(item => item.report_id === reportId) ? reportId : data.items[0]?.report_id || '');
  };
  const retryReport = async () => {
    const route = '/v1/gift-reports/' + currentReport.report_id + '/retries';
    const body = { failed_formats: currentReport.artifacts.filter(item => item.retryable).map(item => item.format) };
    // Each failed attempt needs a new retry intent; replaying that attempt reuses its key.
    const attemptIdentity = currentReport.artifacts.map(item => [item.format, item.attempt_no]);
    acceptReport(await requestApi(route, { method: 'POST', headers: { 'Idempotency-Key': keyFor(route, { body, attemptIdentity }) }, body: JSON.stringify(body) }));
  };
  const downloadReport = async format => {
    const blob = await requestApi('/v1/gift-reports/' + currentReport.report_id + '/files/' + format, { download: true });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'gift-' + currentReport.report_id + '.' + format;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const reloadList = async (more = false, customer = clientId) => {
    if (!customer) return;
    const data = await requestApi('/v1/gift-cases?client_id=' + encodeURIComponent(customer) + (more && cursor ? '&cursor=' + cursor : ''));
    setCases(old => more ? [...old, ...data.items] : data.items); setCursor(data.next_cursor);
  };
  const confirmDiscard = () => (!dirty && !filingDirty) || window.confirm('저장하지 않은 입력이 있습니다. 현재 입력을 버리고 계속할까요?');
  const change = fn => { setDraft(d => {
    const next = fn(d);
    // Confirmation applies to these facts; every other edit invalidates it.
    const facts = v => JSON.stringify([v.answers_raw, v.valuation_snapshot, {...v.supplemental, multiasset_confirmed:false}]);
    if (facts(next) !== facts(d)) next.supplemental = {...next.supplemental, multiasset_confirmed:false};
    return next;
  }); setTouched(true); setNotice(''); };
  const setAnswer = (id, value) => {
    change(d => {
      const next = { ...d, answers_raw: { ...d.answers_raw, [id]: value } };
      if(id==='assetType'&&value!=='stock')next.supplemental={...next.supplemental,primary_equity_ref:null};
      if (['priorGiftValue', 'priorGiftDed', 'priorGiftHas'].includes(id)) next.supplemental = { ...d.supplemental, prior_gift_deduction_confirmed: false, history_inclusion_confirmed: false };
      if (['marriageDed', 'childbirthDed', 'relationship'].includes(id)) next.supplemental = { ...next.supplemental, multiasset_confirmed: false, deduction_eligibility_confirmed: false };
      if (id === 'giftValue' && d.valuation_snapshot) next.valuation_snapshot = { ...d.valuation_snapshot, adopted_amount: value, manual_override: true };
      return next;
    });
  };
  const setSupplemental = (key, value) => change(d => ({ ...d, supplemental: { ...d.supplemental, [key]: value } }));
  const save = async (asNew = false) => {
    if (!clientId) throw new Error('고객을 선택해 주세요.');
    if (!asNew && meta?.read_only) throw new Error('읽기 전용 저장본입니다.');
    if (!asNew && meta && !dirty) return meta;
    const packed = giftPackDraft(draft);
    const copying = !!meta && asNew;
    const updating = meta && !asNew;
    const body = copying ? { label, draft: packed, source_revision_id: meta.revision_id }
      : { label, draft: packed, ...(!updating ? { client_id: clientId } : {}) };
    const route = '/v1/gift-cases' + (copying ? '/' + meta.case_id + '/copies' : updating ? '/' + meta.case_id : '');
    const headers = { 'Idempotency-Key': keyFor(route, { body, etag: updating ? meta.etag : null }), ...(updating ? { 'If-Match': meta.etag } : {}) };
    const result = await requestApi(route, { method: updating ? 'PUT' : 'POST', headers, body: JSON.stringify(body) });
    const next = { ...result, current_revision: result.revision, read_only: false };
    const committedDraft = copying ? result.draft : packed;
    setMeta(next); setDraft(committedDraft); setBaseline(JSON.stringify({ clientId, label, draft: committedDraft })); setTouched(false);
    setRun(null); setRequest(null); setNotice('저장 완료 · 입력 버전 ' + result.revision);
    await reloadList().catch(() => {});
    return next;
  };
  const adoptRun = async (status, caseId) => {
    setRequest(status);
    if (status.status === 'succeeded' && status.run_id) {
      const stored = await requestApi('/v1/gift-cases/' + caseId + '/runs/' + status.run_id);
      setRun(stored); setNotice('계산 완료 · 저장된 결과를 표시합니다.');
    } else setNotice(status.status === 'pending' ? '계산 처리 중입니다. 상태 확인으로 이어갈 수 있습니다.' : '계산 결과가 저장되지 않았습니다. 확인 후 다시 계산할 수 있습니다.');
  };
  const calculate = async () => {
    const saved = await save();
    if (!saved.validation.can_run) { setNotice('초안 저장 완료 · 아래 확인 항목을 보완해 주세요.'); return; }
    const payload = { revision_id: saved.revision_id, expected_input_hash: saved.input_hash };
    // A failed/interrupted or expired pending request must be retried explicitly.
    if (request && request.revision_id === saved.revision_id && request.status !== 'succeeded') payload.retry_of_request_id = request.request_id;
    const route = '/v1/gift-cases/' + saved.case_id + '/runs';
    const status = await requestApi(route, { method: 'POST', headers: { 'Idempotency-Key': keyFor(route, payload) }, body: JSON.stringify(payload) });
    await adoptRun(status, saved.case_id);
  };
  const reopen = async (id, revision = '') => {
    if (!confirmDiscard()) return;
    const data = await requestApi('/v1/gift-cases/' + id + (revision ? '?revision=' + Number(revision) : ''));
    // Fetch the result before replacing local edits: failed reads preserve the draft.
    const storedRun = data.last_successful_run_id ? await requestApi('/v1/gift-cases/' + id + '/runs/' + data.last_successful_run_id) : null;
    setClientId(data.client_id); setLabel(data.label); setDraft(data.draft); setMeta(data);
    setBaseline(JSON.stringify({ clientId: data.client_id, label: data.label, draft: data.draft }));
    setTouched(false); setRun(storedRun); setRequest(null); setReopenRevision('');
    setNotice('저장된 입력 버전 ' + data.revision + '을 다시 열었습니다. 재계산하지 않았습니다.');
  };
  const login = async e => {
    e.preventDefault();
    await act(async () => {
      const data = await requestApi('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, '');
      if (!data.access_token || !data.uid) throw new Error('로그인 응답을 확인할 수 없습니다.');
      if (jtGiftSession.uid && jtGiftSession.uid !== data.uid && jtGiftSession.workspace) throw new Error('입력이 남아 있습니다. 기존 계정으로 로그인해 주세요.');
      jtGiftSession.token = data.access_token; jtGiftSession.uid = data.uid;
      setToken(data.access_token); setPassword(''); setNotice('로그인되었습니다.');
    });
  };
  const reset = () => {
    if (!confirmDiscard()) return;
    operationKeys.current = {};
    setDraft(giftNewDraft()); setLabel(''); setMeta(null); setBaseline(null); setTouched(false); setRun(null); setRequest(null);
  };
  React.useEffect(() => {
    sourceVersion.current++;
    setSourceCatalog(null); setSourcePreview(null); setSourceTarget('primary'); setSourceQueue([]);
    ownerQuery.current++;setOwnerTimeline(null);
    setSourceChoice({ property_id:'', ownership_id:'', donee_person_id:'', valuation_id:'', gift_share:'', gift_date:'', re_type:'', adoption_reason:'', valuation_confirmed:false, nonhousing_review:giftNonhousingReview() });
  }, [meta?.case_id]);
  const loadSources = async (more = false) => {
    const version = ++sourceVersion.current;
    const data = await requestApi('/v1/gift-cases/' + meta.case_id + '/sources' + (more && sourceCatalog?.next_cursor ? '?cursor=' + sourceCatalog.next_cursor : ''));
    if (version === sourceVersion.current) {
      setSourceCatalog(old => ({ ...data, properties: more ? [...(old?.properties || []), ...data.properties] : data.properties }));
      setSourcePreview(null);
    }
  };
  const chooseSource = (key, value) => {
    if(['property_id','gift_date'].includes(key)){ownerQuery.current++;setOwnerTimeline(null);}
    setSourceChoice(old => ({ ...old, [key]: value,
      ...(key!=='nonhousing_review'?{nonhousing_review:{...(old.nonhousing_review||giftNonhousingReview()),...Object.fromEntries(GIFT_NONHOUSING_CHECKS.map(([k])=>[k,false]))}}:{}),
      ...(['property_id','ownership_id','ownership_version','donee_person_id','valuation_id','gift_date'].includes(key)?{fact_selection:null}:{}),
      ...(key === 'property_id' ? { ownership_id:'', valuation_id:'', gift_share:'', valuation_confirmed:false } : {}),
      ...((['property_id','ownership_version'].includes(key)||(key==='gift_date'&&old.ownership_version))?{ownership_id:'',ownership_history_confirmed:false}:{}),
      ...(['property_id','gift_date'].includes(key)?{ownership_version:null}:{}),
      ...(key === 'valuation_id' ? { valuation_confirmed:false } : {}) }));
    setSourcePreview(null);
  };
  const selectedProperty = sourceCatalog?.properties.find(p => p.id === sourceChoice.property_id);
  const selectionPayload = () => {
    if (['property_id','ownership_id','donee_person_id','valuation_id','gift_share','gift_date','re_type','adoption_reason'].some(k => !sourceChoice[k].trim()))
      throw new Error('재산·소유자·수증자·평가자료·지분·날짜·부동산 구분·채택 이유를 모두 입력해 주세요.');
    const payload={ ...sourceChoice, valuation_basis:'whole_property' };
    if(!['토지','상가'].includes(selectedProperty?.property_type))delete payload.nonhousing_review;
    return payload;
  };
  const previewSource = async () => {
    setSourcePreview(null);
    const data = await requestApi('/v1/gift-cases/' + meta.case_id + '/source-preview', { method:'POST', body:JSON.stringify(selectionPayload()) });
    setSourcePreview(data);
  };
  const queuedSource = () => ({selection:sourcePreview.selection,expected_source_hash:sourcePreview.source_hash,
    target_local_id:sourceTarget==='new'?null:sourceTarget});
  const importSource = async (queued = false) => {
    if ((!queued && !sourcePreview) || (queued && !sourceQueue.length) || !window.confirm('선택한 재산·당사자·평가자료를 현재 입력에 반영하고 새 버전으로 저장합니다. 관계·거주자 여부·과거 증여·채무 인수 판단은 다시 확인해야 합니다. 계속할까요?')) return;
    const additional = queued || sourceTarget !== 'primary';
    const route = '/v1/gift-cases/' + meta.case_id + (additional?'/additional-source-imports':'/source-imports');
    const body = { label, draft:giftPackDraft(draft), ...(additional?
      {items:queued?sourceQueue.map(x=>x.item):[queuedSource()]}:
      {selection:sourcePreview.selection,expected_source_hash:sourcePreview.source_hash}) };
    const key = keyFor(route, { body, etag:meta.etag });
    const data = await requestApi(route, { method:'POST', headers:{'If-Match':meta.etag,'Idempotency-Key':key}, body:JSON.stringify(body) });
    setDraft(data.draft); setMeta({ ...data, current_revision:data.revision, read_only:false });
    setBaseline(JSON.stringify({ clientId, label, draft:data.draft })); setTouched(false); setRun(null); setRequest(null);
    setSourcePreview(null); if(queued)setSourceQueue([]); setNotice('원본 자료와 가져오기 당시 값을 새 입력 버전에 저장했습니다. 관계·거주자 여부·조정금액 등을 확인한 뒤 계산해 주세요.');
    await reloadList().catch(() => {});
  };
  const dateField = (key, title) => <GiftCaseField title={title} key={key}><input data-testid={"gift-s-"+key} type="date" value={s?.[key] || ''} onInput={e => setSupplemental(key, e.target.value || null)} onChange={e => setSupplemental(key, e.target.value || null)} /></GiftCaseField>;
  const assetUpdate = (index, key, value) => setSupplemental('assets', s.assets.map((row,i) => i===index ? {...row,[key]:value,...(key==='kind'?{property_type:null,address_text:null}: {})} : row));
  const assetTotal = (() => {
    const values=[a.assetType==='realestate'?a.giftValue:a.assetType==='stock'?a.giftValueStock:a.giftValueCash,...(s.assets||[]).map(row=>row.adopted_value_krw)];
    if(values.some(v=>v==null||!/^[0-9]+$/.test(String(v).replace(/,/g,''))))return '금액 입력 필요';
    const total=values.reduce((sum,v)=>sum+BigInt(String(v).replace(/,/g,'')),0n);
    return total>BigInt(Number.MAX_SAFE_INTEGER)?'범위 초과':total.toLocaleString('ko-KR')+'원';
  })();
  const rowUpdate = (index, key, value) => setSupplemental('prior_gifts', s.prior_gifts.map((row, i) => i === index ? { ...row, [key]: value, ...(key === 'deduction_used_krw' ? { deduction_origin: 'unknown' } : {}), ...(GIFT_HISTORY_FLAGS.some(([k]) => k === key) ? { history_flags_confirmed: false } : {}) } : row));
  return <div className="jt-container gc-workspace">
    <style>{`.gc-workspace{max-width:1040px;padding-bottom:56px}.gc-workspace h2{font-size:23px;margin:0 0 8px}.gc-workspace h3{font-size:18px;margin:0 0 12px}.gc-card{padding:24px;border:1px solid #d9e0d9;border-radius:12px;margin:18px 0;background:#fff}.gc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.gc-field{display:flex;flex-direction:column;gap:6px;font-size:14px}.gc-field>span{font-weight:600}.gc-field input,.gc-field select,.gc-field textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #aebcaf;border-radius:6px;background:#fff;color:#193629;font:inherit;min-height:42px}.gc-field small,.gc-help{font-size:13px;color:#54645a;line-height:1.6}.gc-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0;font-size:14px}.gc-check input{margin-top:4px}.gc-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.gc-workspace button{cursor:pointer}.gc-workspace button:disabled{cursor:default;opacity:.55}.gc-workspace fieldset{border:0;padding:0;margin:0;min-width:0}.gc-status{padding:12px 16px;background:#edf6ef;border-radius:8px;overflow-wrap:anywhere}.gc-error{background:#fff1e9;color:#82391e}.gc-workspace :focus-visible{outline:3px solid #3d7855;outline-offset:3px}.gc-row{padding:16px;border:1px solid #dde5de;border-radius:8px;margin:12px 0}.gc-result{border:2px solid #3b7050}.gc-result output{display:block;font-size:32px;font-weight:700;margin:12px 0}.gc-raw{white-space:pre-wrap;max-height:300px;overflow:auto;font-size:12px}.gc-table{width:100%;border-collapse:collapse}.gc-table td,.gc-table th{padding:10px;text-align:left;border-bottom:1px solid #dde5de}.gc-workspace legend{font-weight:700;margin-bottom:12px}@media(max-width:620px){.gc-grid{grid-template-columns:1fr}.gc-card{padding:16px}.gc-actions>button{flex:1;min-width:140px}.gc-workspace h2{font-size:21px}}`}</style>
    <div className="gc-actions"><button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => { onAnswers(a); onExit(); }}>{exitLabel}</button><h2>증여 사건 저장·계산</h2></div>
    <p className="gc-help">입력과 계산 결과를 고객별로 저장합니다. 현재는 거주자의 일반 증여·같은 당사자와 날짜의 다자산 계산을 지원하며, 다른 조건은 초안으로 보관할 수 있습니다.</p>
    {error && <p role="alert" className="gc-status gc-error">{error}</p>}
    {notice && <p role="status" className="gc-status">{notice}</p>}
    {!token ? <form className="gc-card" onSubmit={login}>
      <h3>사건 저장용 로그인</h3><p className="gc-help">계산기 서비스 계정으로 로그인하세요. 로그인 전 입력도 이 화면에 유지됩니다.</p>
      <div className="gc-grid"><GiftCaseField title="이메일"><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></GiftCaseField>
        <GiftCaseField title="비밀번호"><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></GiftCaseField></div>
      <button className="jt-btn jt-btn--primary" disabled={busy} style={{ marginTop: 16 }}>로그인</button>
    </form> : <section className="gc-card"><h3>고객과 저장된 사건</h3><div className="gc-actions">
      <GiftCaseField title="고객"><select value={clientId} disabled={busy || !!meta} onChange={e => { if (clientId && !confirmDiscard()) return; if (clientId) { operationKeys.current = {}; setDraft(giftNewDraft()); setTouched(false); setBaseline(null); } setClientId(e.target.value); setCases([]); setCursor(null); }}>
        <option value="">고객 선택</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></GiftCaseField>
      <button className="jt-btn jt-btn--ghost" disabled={!clientId || busy} onClick={() => act(() => reloadList())}>저장 목록</button>
      <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={reset}>새 사건</button>
      <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => { if (!confirmDiscard()) return; operationKeys.current = {}; jtGiftSession = { token: '', uid: '', workspace: null }; setToken(''); setDraft(giftNewDraft()); setClientId(''); setMeta(null); setBaseline(null); setTouched(false); setRun(null); setRequest(null); }}>로그아웃</button>
    </div>{clients.length === 0 && <p className="gc-help">등록된 고객이 없습니다. 사무소 고객을 먼저 등록해 주세요.</p>}
      {cases.length > 0 && <ul>{cases.map(item => <li key={item.case_id}><button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => act(() => reopen(item.case_id))}>{item.label || '제목 없는 사건'} · 버전 {item.current_revision} 열기</button></li>)}</ul>}
      {cursor && <button className="jt-btn jt-btn--ghost" onClick={() => act(() => reloadList(true))} disabled={busy}>목록 더 보기</button>}
    </section>}
    <p className="gc-help" data-testid="gift-save-state">{dirty ? '저장하지 않은 변경이 있습니다.' : meta ? '저장된 입력입니다.' : '새 초안입니다.'}{meta && ` · 입력 버전 ${meta.revision} / 최신 ${meta.current_revision}`}</p>
    {meta && <div className="gc-actions"><GiftCaseField title="다시 열 입력 버전"><input inputMode="numeric" value={reopenRevision} onChange={e => setReopenRevision(e.target.value.replace(/\D/g, ''))} placeholder={`1~${meta.current_revision}`} /></GiftCaseField>
      <button className="jt-btn jt-btn--ghost" disabled={busy || !token} onClick={() => act(() => reopen(meta.case_id, reopenRevision))}>저장본 다시 열기</button></div>}
    {readonly && <p className="gc-status">읽기 전용 저장본입니다. 현재 입력으로 새 사건을 저장하거나 최신 버전을 다시 열 수 있습니다.</p>}
    {Object.keys(meta?.property_sources||{}).length>0&&<section className="gc-card" data-testid="gift-saved-property-sources"><h3>추가 재산의 채택 당시 원본</h3>
      <p>{dirty?'저장 후 입력이 변경됐습니다. 아래는 마지막 저장 당시 상태입니다.':'저장된 원본 연결 상태입니다.'}</p>
      {Object.entries(meta.property_sources).map(([id,v])=><div key={id}><p>{v.property.address} · {v.parties.donor.name} → {v.parties.donee.name} · {v.selection.gift_date}</p>
        <p>{v.valuation.amount}원 × {v.selection.gift_share} = {giftExactWon(v.adopted_amount)} · 평가 기준일 {v.valuation.as_of_date} · {{matched:'채택값과 일치',manually_modified:'입력값 수동 수정',context_mismatch:'사건·재산 조건 변경: 재채택 필요'}[meta.property_source_status?.[id]]||'상태 확인 필요'}</p>
        <GiftNonhousingSaved source={v}/><p className="gc-help">{v.selection.adoption_reason} · 원본 해시 {v.source_hash}</p></div>)}
    </section>}
    {meta?.master_snapshot && <section className="gc-card" aria-label="가져오기 당시 원본 자료"><h3>가져오기 당시 자료</h3><GiftNonhousingSaved source={meta.master_snapshot}/>
      <p>{meta.master_snapshot.property.address} · 증여자 {meta.master_snapshot.parties.donor.name} → 수증자 {meta.master_snapshot.parties.donee.name}</p>
      {meta.master_snapshot.fact_history&&<p data-testid="gift-saved-fact-period">과거 사실 적용기간 {meta.master_snapshot.fact_history.applicability.applicable_from} ~ {meta.master_snapshot.fact_history.applicability.applicable_until} · 확인 근거: {meta.master_snapshot.fact_history.applicability.reason} · 당시 선택한 취득·당사자·평가자료 보존</p>}
      {meta.master_snapshot.ownership_history&&<p data-testid="gift-saved-ownership-period">채택 소유 기간: {meta.master_snapshot.ownership_history.valid_from}부터 {meta.master_snapshot.ownership_history.valid_until||'이후'} (변동 당일은 확인한 선후관계 기준) · 기록 {meta.master_snapshot.ownership_history.revision} · 다른 원본 사실은 아래 선택 버전 또는 가져오기 시점 자료</p>}
      <p>전체 평가액 {meta.master_snapshot.valuation.amount}원 · 기준일 {meta.master_snapshot.valuation.as_of_date} · 증여 지분 {meta.master_snapshot.selection.gift_share} · 가져온 가액 {giftExactWon(meta.master_snapshot.adopted_amount)}</p>
      <p className="gc-help">채택 이유: {meta.master_snapshot.selection.adoption_reason}<br/>가져온 시각: {meta.master_snapshot.captured_at}<br/>원본이 바뀌어도 이 기록은 유지됩니다. 이후 직접 수정한 현재 입력값과는 다를 수 있습니다.</p>
    </section>}
    <fieldset disabled={busy || readonly}>
      {typeof JTEquityPicker!=='undefined'&&<><label>평가 반영 위치<select data-testid="gift-equity-target" value={equityTarget} onChange={e=>setEquityTarget(e.target.value)}><option value="primary">첫 재산으로 반영/교체</option><option value="new">추가 주식 재산</option>{(s.assets||[]).filter(x=>x.kind==='stock').map(x=><option key={x.local_id} value={x.local_id}>기존 주식 {x.local_id} 교체</option>)}</select></label>
      <JTEquityPicker api={requestApi} clientId={clientId} eventDate={s.gift_date} purpose="증여" disabled={busy||readonly} onAdopt={x=>change(d=>{
        const row={local_id:window.crypto.randomUUID(),kind:'stock',property_type:null,address_text:null,adopted_value_krw:String(x.total_value),valuation_as_of:x.eval_date,value_source:x.company_name+' · 평가 결과 '+x.run_id,equity_ref:x.reference};
        if(equityTarget==='primary')return {...d,answers_raw:{...d.answers_raw,assetType:'stock',giftValueStock:String(x.total_value)},valuation_snapshot:null,supplemental:{...d.supplemental,primary_equity_ref:x.reference,primary_value_source:row.value_source,multiasset_confirmed:false}};
        const rows=equityTarget==='new'?[...d.supplemental.assets,row]:d.supplemental.assets.map(a=>a.local_id===equityTarget?{...row,local_id:a.local_id}:a);
        return {...d,supplemental:{...d.supplemental,assets:rows,multiasset_confirmed:false}};
      })}/></>}
      {a.assetType==='stock'&&<p>첫 주식 채택액: {a.giftValueStock||'미선택'}원 · {s.primary_equity_ref?.shares||'미선택'}주 · 결과 {s.primary_equity_ref?.run_id||'미선택'} (수량/금액 변경은 평가를 다시 선택)</p>}
      <section className="gc-card"><h3>기존 재산·당사자·평가자료 가져오기</h3>
        <p className="gc-help">이 고객의 주택·토지·상가·소유자·수증자·평가자료를 선택합니다. 평가액은 재산 전체 금액임을 확인해야 하며, 증여할 지분만 곱해 입력합니다. 자료를 가져오면 현재 입력을 새 버전으로 저장합니다.</p>
        <button className="jt-btn jt-btn--ghost" disabled={!meta || !token || busy || readonly} onClick={() => act(() => loadSources())}>기존 자료 조회</button>
        {!meta && <p className="gc-help">먼저 고객을 선택하고 초안을 저장해 주세요.</p>}
        {sourceCatalog && <><div className="gc-grid" style={{marginTop:16}}>
          <GiftCaseField title="채택할 위치"><select data-testid="source-target" value={sourceTarget} onChange={e=>setSourceTarget(e.target.value)}>
            <option value="primary">첫 재산 교체</option><option value="new">추가 부동산 새 행</option>
            {s.assets.filter(x=>x.kind==='realestate').map(x=><option key={x.local_id} value={x.local_id}>추가 행 교체·재채택: {x.address_text||x.local_id}</option>)}</select></GiftCaseField>
          <GiftCaseField title="가져올 재산"><select data-testid="source-property_id" value={sourceChoice.property_id} onChange={e => chooseSource('property_id',e.target.value)}><option value="">재산 선택</option>{sourceCatalog.properties.map(p => <option key={p.id} value={p.id} disabled={!['주택','토지','상가'].includes(p.property_type)}>{p.address || '주소 없음'} · {p.property_type}{!['주택','토지','상가'].includes(p.property_type) ? ' (연결 준비 중)' : ''}</option>)}</select></GiftCaseField>
          <GiftCaseField title="증여자 소유 지분"><select data-testid="source-ownership_id" value={sourceChoice.ownership_id} onChange={e => chooseSource('ownership_id',e.target.value)}><option value="">소유자 선택</option>{(ownerTimeline?.items.find(x=>x.version===sourceChoice.ownership_version)?.ownerships || selectedProperty?.ownerships || []).map(o => <option key={o.id} value={o.id}>{o.name || '이름 없음'} · 소유 지분 {o.share_ratio}</option>)}</select></GiftCaseField>
          <GiftCaseField title="수증자"><select data-testid="source-donee_person_id" value={sourceChoice.donee_person_id} onChange={e => chooseSource('donee_person_id',e.target.value)}><option value="">수증자 선택</option>{sourceCatalog.persons.map(p => <option key={p.id} value={p.id}>{p.name || '이름 없음'} · 고객 기준 {p.relationship}</option>)}</select></GiftCaseField>
          <GiftCaseField title="평가자료"><select data-testid="source-valuation_id" value={sourceChoice.valuation_id} onChange={e => chooseSource('valuation_id',e.target.value)}><option value="">평가자료 선택</option>{(selectedProperty?.valuations || []).map(v => <option key={v.id} value={v.id}>{v.as_of_date} · {v.valuation_type} · {v.amount}원 · {v.source}{v.hometax_confirm_required ? ' · 별도 확인 필요' : ''}</option>)}</select></GiftCaseField>
          <GiftCaseField title="증여할 지분 (전체 1, 절반 0.5)"><input data-testid="source-gift_share" inputMode="decimal" value={sourceChoice.gift_share} onChange={e => chooseSource('gift_share',e.target.value)} /></GiftCaseField>
          <GiftCaseField title="증여일"><input data-testid="source-gift_date" type="date" value={sourceChoice.gift_date} onChange={e => chooseSource('gift_date',e.target.value)} /></GiftCaseField>
          <GiftCaseField title="부동산 구분"><select data-testid="source-re_type" value={sourceChoice.re_type} onChange={e => chooseSource('re_type',e.target.value)}><option value="">선택</option><option>공동주택</option><option>개별주택</option><option>토지</option><option>상가</option></select></GiftCaseField>
          <GiftCaseField title="이 평가액을 채택한 이유·확인 내용"><input data-testid="source-adoption_reason" maxLength={500} value={sourceChoice.adoption_reason} onChange={e => chooseSource('adoption_reason',e.target.value)} /></GiftCaseField>
        </div><GiftCaseCheck label="재산 전체 평가액임을 확인했고 평가기준일·유형과 이번 증여에 사용할 값을 검토했습니다" checked={sourceChoice.valuation_confirmed} onChange={v => chooseSource('valuation_confirmed',v)} />
        {['토지','상가'].includes(selectedProperty?.property_type)&&<section data-testid="nonhousing-review"><h4>토지·상가 최종 평가 검토</h4>
          <p>2026-10-01~2026-10-18 증여일 기준 최종 전체 가액만 채택합니다. 평가자료의 기준일은 증여일이며, 거래·감정의 실제 날짜와 적정성은 근거에서 따로 확인합니다. 토지·건물의 이전 지분이 다르면 별도 재산으로 등록하세요.</p>
          <GiftCaseField title="평가에 포함한 범위"><select data-testid="nonhousing-coverage" value={sourceChoice.nonhousing_review.coverage} onChange={e=>chooseSource('nonhousing_review',{...giftNonhousingReview(),...sourceChoice.nonhousing_review,coverage:e.target.value,...Object.fromEntries(GIFT_NONHOUSING_CHECKS.map(([k])=>[k,false]))})}>
            <option value="">선택</option>{selectedProperty.property_type==='토지'?<option value="land_only">토지만</option>:<><option value="building_only">건물만 (대지권 제외)</option><option value="land_and_building">토지·건물 함께 (같은 증여 지분)</option></>}</select></GiftCaseField>
          <GiftCaseField title="최종 평가 방법"><select data-testid="nonhousing-valuation_method" value={sourceChoice.nonhousing_review.valuation_method} onChange={e=>chooseSource('nonhousing_review',{...sourceChoice.nonhousing_review,valuation_method:e.target.value,...Object.fromEntries(GIFT_NONHOUSING_CHECKS.map(([k])=>[k,false]))})}>
            <option value="">선택</option><option value="market">시가 (매매·감정)</option><option value="supplementary">시가 산정 곤란에 따른 보충적 평가</option></select></GiftCaseField>
          {[['scope_note','필지·건물·대지권 포함 범위와 중복 검토'],['review_note','시가 우선·임대차/담보 평가 검토 근거']].map(([k,title])=><GiftCaseField key={k} title={title}><input data-testid={'nonhousing-'+k} maxLength={k==='scope_note'?500:1000} value={sourceChoice.nonhousing_review[k]} onChange={e=>chooseSource('nonhousing_review',{...sourceChoice.nonhousing_review,[k]:e.target.value,...Object.fromEntries(GIFT_NONHOUSING_CHECKS.map(([k])=>[k,false]))})}/></GiftCaseField>)}
          {GIFT_NONHOUSING_CHECKS.map(([k,label])=><label key={k} className="gc-check"><input data-testid={'nonhousing-'+k} type="checkbox" checked={sourceChoice.nonhousing_review[k]} onChange={e=>chooseSource('nonhousing_review',{...sourceChoice.nonhousing_review,[k]:e.target.checked})}/>{label}</label>)}
        </section>}
        <div aria-label="사건일 소유 이력">
          <button data-testid="gift-ownership-load" disabled={busy||readonly||!sourceChoice.property_id||!sourceChoice.gift_date} onClick={()=>act(async()=>{
            const generation=++ownerQuery.current;setSourcePreview(null);setOwnerTimeline(null);
            const data=await requestApi('/v1/clients/'+clientId+'/masters/properties/'+sourceChoice.property_id+'/ownership-options?event_date='+sourceChoice.gift_date);
            if(generation===ownerQuery.current){setOwnerTimeline(data);chooseSource('ownership_version',null);}
          })}>사건일 소유 이력 조회</button>
          {ownerTimeline&&<><label>사건 날짜에 맞는 지분 기록<select data-testid="gift-ownership-version" disabled={busy||readonly} value={sourceChoice.ownership_version||''} onChange={e=>chooseSource('ownership_version',e.target.value||null)}>
            <option value="">명시적으로 선택</option>{ownerTimeline.items.filter(x=>x.eligible).map(x=><option key={x.version} value={x.version}>{x.valid_from}부터 {x.valid_until?'~ '+x.valid_until+' (당일 선후 확인)':'이후'} · 기록 {x.revision}{x.boundary_review_required?' · 당일 변동 후보':''}{x.basis==='before_first_retained_change'?' (첫 보관 전 상태·이전 변동 확인 필요)':''}</option>)}</select></label>
            {!ownerTimeline.items.some(x=>x.eligible)&&<p>이 날짜를 뒷받침하는 소유 기록이 없습니다.</p>}</>}
          {sourceChoice.ownership_version&&<label><input data-testid="gift-ownership-confirm" type="checkbox" disabled={busy||readonly} checked={!!sourceChoice.ownership_history_confirmed} onChange={e=>chooseSource('ownership_history_confirmed',e.target.checked)}/>사건과 소유 변동의 선후관계·선택 지분·이전 변동 누락 여부를 확인했습니다. 재산·당사자·평가자료는 별도 과거 버전을 선택하거나 현재 자료를 사용하므로 취득 사실·금액을 함께 검토합니다.</label>}
        </div>
        <JTFactVersionPicker api={requestApi} clientId={clientId} propertyId={sourceChoice.property_id} ownerId={(ownerTimeline?.items.find(x=>x.version===sourceChoice.ownership_version)?.ownerships||selectedProperty?.ownerships||[]).find(x=>x.id===sourceChoice.ownership_id)?.person_id} doneeId={sourceChoice.donee_person_id} eventDate={sourceChoice.gift_date} valuationId={sourceChoice.valuation_id} selection={sourceChoice.fact_selection} onChange={v=>chooseSource('fact_selection',v)} disabled={busy||readonly}/>
        <p className="gc-help">평가액 적정성을 자동 판정하지 않습니다. 소유 지분과 이번 증여 지분은 다를 수 있습니다. 첫 주택은 원 미만을 버리며, 토지·상가는 정확한 정수 원 지분 가액만 채택합니다. 추가 원본은 사건 당사자·날짜가 같고 증여일 기준 평가자료이며 지분 가액이 정수 원인 경우에 채택합니다. 고객 기준 가족관계는 증여자·수증자 사이 관계로 자동 적용하지 않습니다.</p>
        <div className="gc-actions"><button className="jt-btn jt-btn--ghost" disabled={busy || !sourceChoice.valuation_confirmed} onClick={() => act(previewSource)}>선택 자료 확인</button>
          {sourceCatalog.next_cursor && <button disabled={busy} onClick={() => act(() => loadSources(true))}>재산 더 보기</button>}</div>
        {sourcePreview && <div className="gc-status" style={{marginTop:12}}><GiftNonhousingSaved source={sourcePreview}/><p>증여자 {sourcePreview.parties.donor.name} → 수증자 {sourcePreview.parties.donee.name}</p>
          <p>{sourcePreview.property.address} · 전체 평가액 {sourcePreview.valuation.amount}원 × 증여 지분 {sourcePreview.selection.gift_share} = 입력 가액 {giftExactWon(sourcePreview.adopted_amount)}</p>
          <p>원본 평가기준일 {sourcePreview.valuation.as_of_date} · 증여일 {sourcePreview.selection.gift_date}</p>
          <button className="jt-btn jt-btn--primary" disabled={busy} data-testid="source-import" onClick={() => act(()=>importSource())}>가져와 새 버전 저장</button>
          {sourceTarget!=='primary'&&<button data-testid="source-queue-add" disabled={busy||sourceQueue.length>=20} onClick={()=>setSourceQueue(q=>[...q,{item:queuedSource(),address:sourcePreview.property.address}])}>추가 채택 목록에 담기</button>}</div>}
        {sourceQueue.length>0&&<div data-testid="source-queue"><p>일괄 채택 {sourceQueue.length}건 · 모두 검증되면 한 버전으로 저장합니다.</p>
          {sourceQueue.map((x,i)=><p key={i}>{x.address} · {x.item.target_local_id?'기존 행 교체':'새 행'}<button onClick={()=>setSourceQueue(q=>q.filter((_,j)=>i!==j))}>목록 {i+1} 제거</button></p>)}
          <button data-testid="source-queue-import" disabled={busy||readonly} onClick={()=>act(()=>importSource(true))}>추가 재산 일괄 채택</button></div>}
        {sourceCatalog.properties.length === 0 && <p className="gc-help">이 고객의 등록 재산이 없습니다.</p>}</>}
      </section>
      <section className="gc-card"><h3>기본 입력</h3><GiftCaseField title="사건 이름"><input maxLength={200} value={label} onChange={e => { setLabel(e.target.value); setTouched(true); }} /></GiftCaseField>
        <div className="gc-grid" style={{ marginTop: 16 }}>{GIFT_QS.filter(q => !q.showIf || q.showIf(a)).map(q => <GiftCaseField key={q.id} title={q.id === 'priorGiftDed' ? '과거 증여 당시 공제 사용액 (원 · 모르면 공란)' : q.q} hint={q.id === 'priorGiftDed' ? '모르는 공제액은 추정해서 저장된 계산에 사용하지 않습니다.' : q.id === 'giftValue' ? '실제로 이전하는 지분의 원 단위 가액을 입력하세요.' : null}>
          {q.opts ? <select data-testid={'gift-' + q.id} value={a[q.id] ?? ''} onChange={e => setAnswer(q.id, e.target.value)}><option value="">선택해 주세요</option>{(q.id==='assetType'?[...q.opts,['stock','비상장주식 (저장 평가 선택)']]:q.opts).map(([v, text]) => <option value={v} key={v}>{text}</option>)}</select> : q.freeform ?
            <textarea data-testid={'gift-' + q.id} value={a[q.id] ?? ''} maxLength={q.id === 'context' ? 200 : 120} onChange={e => setAnswer(q.id, e.target.value)} /> :
            <input data-testid={'gift-' + q.id} inputMode="numeric" value={a[q.id] ?? ''} onChange={e => setAnswer(q.id, e.target.value.replace(/[^0-9]/g, ''))} />}
        </GiftCaseField>)}</div>
      </section>
      {s && <><section className="gc-card"><h3>사건 기준과 당사자</h3><p className="gc-help">증여일과 당사자를 남겨 다시 열 때 같은 사실관계를 확인합니다. 날짜별 과거 규칙 선택은 아직 지원하지 않으며 현재 엔진 기준으로 계산합니다.</p>
        <div className="gc-grid">{dateField('gift_date', '증여일')}{dateField('relationship_as_of', '관계 확인 기준일')}
          {[['donor_person_id', '증여자'], ['donee_person_id', '수증자']].map(([k, title]) => <GiftCaseField title={title} key={k}><select data-testid={"gift-s-"+k} value={s[k] || ''} onChange={e => setSupplemental(k, e.target.value || null)}><option value="">선택하지 않음</option>{persons.map(p => <option key={p.id} value={p.id}>{p.name || '이름 없음'} · {p.relationship}</option>)}</select></GiftCaseField>)}
        </div></section>
      <section className="gc-card"><h3>계산에 반영할 조정금액</h3><p className="gc-help">기사용 공제액과 비용·외국납부액을 기존 계산 엔진에 전달합니다. 표시된 0원도 확인해야 계산할 수 있습니다.</p>
        <div className="gc-grid">{GIFT_ADJUSTMENTS.map(([k, title]) => <GiftCaseField key={k} title={title + ' (원)'}><input inputMode="numeric" value={s.adjustments[k]} onChange={e => change(d => ({ ...d, supplemental: { ...d.supplemental, adjustments: { ...d.supplemental.adjustments, [k]: e.target.value.replace(/[^0-9]/g, '') }, adjustments_confirmed: false } }))} /></GiftCaseField>)}</div>
        <GiftCaseCheck label="위 조정금액을 확인했습니다 (해당 없으면 0원)" checked={s.adjustments_confirmed} onChange={v => setSupplemental('adjustments_confirmed', v)} />
      </section>
      {a.relationship === '직계존속' && (a.marriageDed === 'yes' || a.childbirthDed === 'yes') && <section className="gc-card"><h3>혼인·출산 확인 자료</h3><p className="gc-help">적용 사유와 날짜, 이전 사용액을 함께 보존합니다. 체크는 사용자 확인 기록입니다.</p><div className="gc-grid">{dateField('marriage_date', '혼인일')}{dateField('childbirth_date', '출생·입양일')}<GiftCaseField title="관련 자녀 표시명"><input value={s.child_name || ''} onChange={e => setSupplemental('child_name', e.target.value || null)} /></GiftCaseField></div>
        <GiftCaseCheck label="혼인·출산 적용 요건과 기사용액을 확인했습니다" checked={s.deduction_eligibility_confirmed} onChange={v => setSupplemental('deduction_eligibility_confirmed', v)} />
      </section>}
      {a.priorGiftHas === 'yes' && <section className="gc-card"><h3>과거 증여 사실 확인</h3><p className="gc-help">현재 나이·세대생략 여부를 과거 증여에 그대로 적용하지 않도록 당시 사실을 받습니다. 개별 이력이 있으면 위 합계 입력 대신 개별 이력을 계산에 사용합니다.</p>
        {s.prior_gifts.length === 0 && <><div className="gc-grid">{GIFT_HISTORY_FLAGS.map(([k, title]) => <GiftCaseBool key={k} title={title} value={s.aggregate_history_flags[k]} onChange={v => change(d => ({ ...d, supplemental: { ...d.supplemental, aggregate_history_flags: { ...d.supplemental.aggregate_history_flags, [k]: v }, history_flags_confirmed: false } }))} />)}</div>
          <GiftCaseCheck label="위 과거 상태 세 항목을 확인했습니다" checked={s.history_flags_confirmed} onChange={v => setSupplemental('history_flags_confirmed', v)} />
          <GiftCaseCheck label="과거 공제 사용액을 확인했습니다" checked={s.prior_gift_deduction_confirmed} onChange={v => setSupplemental('prior_gift_deduction_confirmed', v)} />
          <GiftCaseCheck label="이번 계산의 합산 대상임을 확인했습니다" checked={s.history_inclusion_confirmed} onChange={v => setSupplemental('history_inclusion_confirmed', v)} /></>}
        {s.prior_gifts.map((row, i) => <div className="gc-row" key={row.local_id}><h4>과거 증여 {i + 1}</h4><div className="gc-grid">
          {[['value_krw', '과거 재산가액'], ['deduction_used_krw', '과거 공제 사용액']].map(([k, title]) => <GiftCaseField key={k} title={title + ' (원)'}><input inputMode="numeric" value={row[k] ?? ''} onChange={e => rowUpdate(i, k, e.target.value.replace(/[^0-9]/g, ''))} /></GiftCaseField>)}
          {GIFT_HISTORY_FLAGS.map(([k, title]) => <GiftCaseBool key={k} title={title} value={row[k]} onChange={v => rowUpdate(i, k, v)} />)}
          <GiftCaseField title="과거 증여 메모"><input value={row.description || ''} onChange={e => rowUpdate(i, 'description', e.target.value)} /></GiftCaseField></div>
          <GiftCaseCheck label={'과거 증여 ' + (i + 1) + ' 공제액 확인'} checked={row.deduction_origin === 'confirmed'} onChange={v => rowUpdate(i, 'deduction_origin', v ? 'confirmed' : 'unknown')} />
          <GiftCaseCheck label={'과거 증여 ' + (i + 1) + ' 상태 확인'} checked={row.history_flags_confirmed} onChange={v => rowUpdate(i, 'history_flags_confirmed', v)} />
          <GiftCaseCheck label={'과거 증여 ' + (i + 1) + ' 합산 대상 확인'} checked={row.inclusion_confirmed} onChange={v => rowUpdate(i, 'inclusion_confirmed', v)} />
          <button className="jt-btn jt-btn--ghost" onClick={() => setSupplemental('prior_gifts', s.prior_gifts.filter((_, n) => n !== i))}>이 이력 제거</button>
        </div>)}
        <button className="jt-btn jt-btn--ghost" onClick={() => setSupplemental('prior_gifts', [...s.prior_gifts, { local_id: window.crypto.randomUUID(), value_krw: null, deduction_used_krw: null, history_source: 'event', deduction_origin: 'unknown', inclusion_confirmed: false, history_flags_confirmed: false, is_generation_skip: null, is_minor: null, donor_child_deceased: null, description: '' }])}>개별 과거 증여 추가</button>
      </section>}
      {a.assetType === 'realestate' && <section className="gc-card"><h3>평가 근거 보존</h3><p className="gc-help">조회 후보액과 실제 채택액, 수동 수정 이유를 구별합니다. 아래 출처는 사용자 기록이며 외부 기관 검증 표시는 아닙니다.</p>
        {!draft.valuation_snapshot ? <button className="jt-btn jt-btn--ghost" onClick={() => change(d => ({ ...d, valuation_snapshot: { query: a.reAddress || null, result_id: null, candidate_id: null, queried_at: null, as_of_date: s.gift_date, candidate_amount: null, adopted_amount: a.giftValue || null, adopted_at: new Date().toISOString(), source: '사용자 입력', manual_override: true, override_reason: null, review_required: false } }))}>평가 근거 입력</button> : <div className="gc-grid">
          {[['source', '평가 출처'], ['as_of_date', '평가 기준일'], ['candidate_amount', '조회 후보액 (원)'], ['adopted_amount', '채택 평가액 (원)'], ['override_reason', '금액 수정 이유']].map(([k, title]) => <GiftCaseField title={title} key={k}><input type={k === 'as_of_date' ? 'date' : 'text'} onInput={k === 'as_of_date' ? e => change(d => ({ ...d, valuation_snapshot: { ...d.valuation_snapshot, [k]: e.target.value || null } })) : undefined} value={draft.valuation_snapshot[k] ?? ''} onChange={e => change(d => ({ ...d, valuation_snapshot: { ...d.valuation_snapshot, [k]: e.target.value || null, ...(k === 'adopted_amount' ? { manual_override: true } : {}) } }))} /></GiftCaseField>)}
        </div>}
      </section>}
      <section className="gc-card" aria-label="이번 증여 재산 목록"><h3>이번 증여 재산 목록</h3>
        <p className="gc-help">기본 문항의 재산 1건에 아래 재산을 더합니다. 각 금액은 전체 재산 가격이 아닌 이번에 증여하는 지분의 평가액입니다. 동일한 증여자·수증자·2026년 증여일의 일반 현금·부동산만 연결합니다. 부담부·합산배제·특례 재산 및 다른 증여일은 별도 검토가 필요합니다.</p>
        <p>첫 재산: {a.assetType==='realestate'?'부동산':a.assetType==='stock'?'비상장주식':'현금'} · {a.assetType==='realestate'?a.giftValue:a.assetType==='stock'?a.giftValueStock:a.giftValueCash}원</p>
        {(s.assets||[]).map((row,i)=><div className="gc-row" key={row.local_id}><h4>추가 재산 {i+1}</h4><div className="gc-grid">
          <GiftCaseField title="재산 종류"><select data-testid={'gift-asset-'+i+'-kind'} disabled={row.kind==='stock'} value={row.kind} onChange={e=>assetUpdate(i,'kind',e.target.value)}><option value="stock">비상장주식</option><option value="cash">현금</option><option value="realestate">부동산</option></select></GiftCaseField>
          {row.kind==='realestate'&&<><GiftCaseField title="부동산 구분"><select data-testid={'gift-asset-'+i+'-property_type'} value={row.property_type||''} onChange={e=>assetUpdate(i,'property_type',e.target.value)}><option value="">선택</option>{['공동주택','개별주택','토지','상가'].map(v=><option key={v}>{v}</option>)}</select></GiftCaseField><GiftCaseField title="부동산 주소"><input data-testid={'gift-asset-'+i+'-address_text'} value={row.address_text||''} onChange={e=>assetUpdate(i,'address_text',e.target.value)}/></GiftCaseField></>}
          <GiftCaseField title="증여 지분 가액 (원)"><input readOnly={row.kind==='stock'} data-testid={'gift-asset-'+i+'-adopted_value_krw'} inputMode="numeric" value={row.adopted_value_krw??''} onChange={e=>assetUpdate(i,'adopted_value_krw',e.target.value)}/></GiftCaseField>
          <GiftCaseField title="평가 기준일 (증여일)"><input readOnly={row.kind==='stock'} data-testid={'gift-asset-'+i+'-valuation_as_of'} type="date" value={row.valuation_as_of||''} onChange={e=>assetUpdate(i,'valuation_as_of',e.target.value||null)}/></GiftCaseField>
          <GiftCaseField title="재산 식별·가액 출처·채택 근거"><textarea readOnly={row.kind==='stock'} data-testid={'gift-asset-'+i+'-value_source'} maxLength={1000} value={row.value_source||''} onChange={e=>assetUpdate(i,'value_source',e.target.value)}/></GiftCaseField>
        </div><button data-testid={'gift-asset-'+i+'-remove'} className="jt-btn jt-btn--ghost" onClick={()=>setSupplemental('assets',s.assets.filter((_,n)=>n!==i))}>추가 재산 제거</button></div>)}
        <button data-testid="gift-asset-add" className="jt-btn jt-btn--ghost" onClick={()=>setSupplemental('assets',[...(s.assets||[]),{local_id:window.crypto.randomUUID(),kind:'cash',property_type:null,address_text:null,adopted_value_krw:null,value_source:'',valuation_as_of:s.gift_date||null}])}>이번 증여 재산 추가</button>
        <p>이번 증여 재산 합계: <output data-testid="gift-assets-total">{assetTotal}</output></p>
        {(s.assets?.length>0||a.assetType==='stock')&&<><GiftCaseField title="첫 재산 식별·가액 출처·증여일 평가 근거"><textarea data-testid="gift-primary-value-source" maxLength={1000} value={s.primary_value_source||''} onChange={e=>setSupplemental('primary_value_source',e.target.value)}/></GiftCaseField>
          <label className="gc-check"><input data-testid="gift-multiasset-confirm" type="checkbox" checked={!!s.multiasset_confirmed} onChange={e=>setSupplemental('multiasset_confirmed',e.target.checked)}/>모든 재산은 위 당사자·증여일의 일반 증여이며 채무 인수·합산배제·특례가 없고, 증여 지분 가액·평가 근거·중복 없음과 합계를 확인했습니다.</label>
          <p className="gc-help">추가 재산 출처는 사용자 확인 기록입니다. 다자산 전자신고 파일은 아직 생성하지 않습니다.</p></>}
      </section>
      </>}
    </fieldset>
    {meta?.validation?.issues?.length > 0 && <section className="gc-card" aria-label="계산 전 확인 항목"><h3>계산 전 확인 항목</h3><p className="gc-help">마지막 저장 기준입니다. 수정 후 저장하면 다시 확인합니다.</p><ul>{meta.validation.issues.map((issue, i) => <li key={i}>{giftInputIssue(issue)}</li>)}</ul></section>}
    <div className="gc-actions"><button className="jt-btn jt-btn--ghost" disabled={!token || busy || readonly} onClick={() => act(() => save())}>초안 저장</button>
      <button className="jt-btn jt-btn--primary" disabled={!token || busy || readonly} onClick={() => act(calculate)}>{busy ? '처리 중…' : '저장하고 계산'}</button>
      {meta && <button className="jt-btn jt-btn--ghost" disabled={!token || busy || meta.read_only} onClick={() => act(() => save(true))}>현재 입력을 새 사건으로 저장</button>}
      {request && <button className="jt-btn jt-btn--ghost" disabled={!token || busy} onClick={() => act(async () => adoptRun(await requestApi(request.status_url), meta.case_id))}>계산 상태 확인</button>}
    </div>
    {run && <section className="gc-card gc-result" aria-label="저장된 계산 결과"><h3>저장된 계산 결과{dirty ? ' · 수정 전 입력 기준' : ''}</h3>
      <p className="gc-help">{new Date(run.computed_at).toLocaleString('ko-KR')} · {run.version.engine}</p>
      <output aria-label="저장된 증여세">{giftExactWon(run.response_snapshot.calc['세액'])}</output>
      <table className="gc-table"><tbody>{[['과세표준', run.response_snapshot.calc['과세표준']], ['산출세액', run.response_snapshot.calc['산출세액']]].map(([k, v]) => <tr key={k}><th>{k}</th><td>{giftExactWon(v)}</td></tr>)}</tbody></table>
      <details><summary>계산 단계와 경고</summary><table className="gc-table"><tbody>{(run.response_snapshot.calc['단계별계산'] || []).map((step, i) => <tr key={i}><th>{step['항목']}<small className="gc-help" style={{ display: 'block' }}>{step['비고']}</small></th><td>{giftExactWon(step['금액'])}</td></tr>)}</tbody></table>{(run.response_snapshot.calc['경고사항'] || []).length > 0 ? <ul>{run.response_snapshot.calc['경고사항'].map((warning, i) => <li key={i}>{typeof warning === 'string' ? warning : warning.message || '계산 조건을 확인해 주세요.'}</li>)}</ul> : <p className="gc-help">저장된 경고가 없습니다.</p>}</details>
      <p className="gc-help">결과 ID: {run.run_id}<br />입력 ID: {run.revision_id}<br />규칙 버전: {run.version.tax_rates_version}</p>
      <section aria-label="저장된 보고서"><h4>이 계산 결과의 보고서</h4>
        <p className="gc-help">{dirty ? '현재 수정 중인 입력은 포함하지 않고 위에 표시된 저장 결과를 출력합니다.' : '위에 표시된 입력 버전과 계산 결과를 재계산 없이 출력합니다.'}</p>
        <div className="gc-actions"><button className="jt-btn jt-btn--primary" disabled={!token || busy} onClick={() => act(generateReport)}>DOCX·PDF 보고서 만들기</button>
          <button className="jt-btn jt-btn--ghost" disabled={!token || busy} onClick={() => act(refreshReports)}>보고서 상태 확인</button></div>
        {reports.length > 0 && <GiftCaseField title="저장된 보고서 선택"><select value={reportId} disabled={busy} onChange={e => setReportId(e.target.value)}>{reports.map((item, i) => <option key={item.report_id} value={item.report_id}>보고서 {i + 1} · {item.status === 'ready' ? '생성 완료' : item.status === 'pending' ? '생성 중' : '일부 또는 전체 실패'} · {item.report_id.slice(0, 8)}</option>)}</select></GiftCaseField>}
        {currentReport && <><ul>{currentReport.artifacts.map(item => <li key={item.format}>{item.format.toUpperCase()} · {item.status === 'ready' ? '저장 완료' : item.status === 'pending' ? '처리 중' : '생성 실패'}
          {item.status === 'ready' && <button className="jt-btn jt-btn--ghost" disabled={!token || busy} onClick={() => act(() => downloadReport(item.format))}>{item.format.toUpperCase()} 다운로드</button>}
          {item.error_code && <span className="gc-help"> · {item.error_code === 'RENDERER_UNAVAILABLE' ? '출력 환경을 확인해 주세요.' : item.error_code === 'DOCX_NOT_READY' ? 'DOCX 생성 후 다시 시도할 수 있습니다.' : '저장 결과는 유지되어 있습니다.'}</span>}</li>)}</ul>
          {currentReport.artifacts.some(item => item.retryable) && <button className="jt-btn jt-btn--ghost" disabled={!token || busy} onClick={() => act(retryReport)}>실패한 문서 다시 생성</button>}</>}
      </section>
    </section>}
    {run && <JTGiftFilings key={run.run_id} run={run} requestApi={requestApi} token={token} busy={busy} act={act} dirty={dirty} onDirty={setFilingDirty} keyFor={keyFor} />}
  </div>;
}
window.JTGiftCases = JTGiftCases;
