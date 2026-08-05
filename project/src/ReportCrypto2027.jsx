/* @jsx React.createElement */
/* ──────────────────────────────────────────────────────────────────────────
   가상자산(코인) 소득세 계산기 — 2027.1.1 시행 대비
     JTReportCrypto : 2026년 매도(비과세) vs 2027년 이후 매도(과세) 비교

   ★ 시행 근거 (1차 소스 · jt-law-mcp 직접 조회 260805)
   소득세법 부칙(법률 17757, 2020.12.29 공포 / 2024.12.31 최종개정) 제5조:
     「제21조제1항제27호, 제37조제1항제3호 및 같은 조 제5항·제6항, 제64조의3제2항,
      제70조제2항, 제84조제3호 및 제164조의4의 개정규정은 **2027년 1월 1일 이후
      가상자산을 양도·대여하는 분부터 적용**한다.」
   → 세 차례 유예(2022→2023→2025→2027)를 거쳐 현재 2027.1.1 시행 «예정».
     법 자체는 이미 공포·게재돼 있고 적용시기만 부칙이 정한다.

   ★ 계산 근거 조문 (전부 원문 확인)
   - §21①27호  : 가상자산 양도·대여 소득 = 기타소득
   - §37①3호   : 필요경비 = 실제 취득가액 + 취득·양도·대여 부대비용
   - §37⑤      : 「2027년 1월 1일 전에 이미 보유하고 있던 가상자산의 취득가액은
                  2026년 12월 31일 당시의 시가와 그 가상자산의 취득가액 중에서
                  큰 금액으로 한다」  ← 의제취득가액
   - §37⑥      : (2024.12.31 신설) '27.1.1 이후 취득분 중 실제 취득가액 확인이
                  곤란한 경우 총양도가액 × 「100분의 50 이하의 범위에서 대통령령으로
                  정하는 비율」을 필요경비로 할 수 있다. **이 경우 부대비용 불산입.**
                  → 구체적 비율은 시행령 위임, 현재 미제정 [확인 필요]
   - §64의3②   : 「가상자산소득금액에서 250만원을 뺀 금액에 100분의 20을 곱하여」
   - §84 3호   : 「**해당 과세기간의** 가상자산소득금액이 250만원 이하인 경우」 과세 제외
                  → 건별이 아니라 «연간 합산» 기준
   - §70②      : 종합소득과세표준 확정신고 (다음 해 5월)

   ⚠️ 이 계산기는 «시행 예정» 제도를 다룬다. 국회에서 추가 유예·폐지 논의가
      반복돼 온 영역이므로 화면에 그 사실을 반드시 고지한다.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useCrState } = React;

const crNum = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };
const crWon = (n) => (window.formatWon ? window.formatWon(Math.round(n)) : (Math.round(n).toLocaleString('ko-KR') + '원'));
const CR_EOK = 100000000;
const crEok = (n) => {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return v.toLocaleString('ko-KR') + '원';
  if (Math.abs(v) < CR_EOK) return Math.round(v / 10000).toLocaleString('ko-KR') + '만원';
  return (Math.round(v / CR_EOK * 100) / 100).toLocaleString('ko-KR') + '억원';
};

/* ══════════ SSOT — 법령 값 (개정 시 여기만 고친다) ══════════ */
window.JT_CRYPTO_2027 = {
  effectiveFrom: '2027-01-01',
  deemedBaseDate: '2026-12-31',
  basicDeduct: 2500000,      // §64의3② · §84 3호 (연간)
  rate: 0.20,                // §64의3② 100분의 20
  localRateOfTax: 0.10,      // 지방소득세 = 소득세의 10% → 실효 22%
  articles: {
    income: '소득세법 §21①27호', expense: '소득세법 §37①3호',
    deemed: '소득세법 §37⑤', estimate: '소득세법 §37⑥',
    tax: '소득세법 §64조의3②', minimum: '소득세법 §84 3호',
    filing: '소득세법 §70②', addendum: '소득세법 부칙(법률 17757) §5',
  },
};

/* ══════════ 계산 엔진 ══════════ */
function crCalc(input) {
  const C = window.JT_CRYPTO_2027;
  const sale = crNum(input.salePrice);          // 매도(양도) 금액
  const acq = crNum(input.acqPrice);            // 실제 취득가액
  const mkt2026 = crNum(input.marketAt2026);    // 2026.12.31 시가
  const fee = crNum(input.fee);                 // 부대비용(수수료)
  /* ⚠️ 종전엔 «그 해 전체 합계»를 받으면서 otherLoss 를 또 뺐다 → 손실 이중 차감.
     (이익 2,000만/취득 1,000만 + 손실 100만/취득 400만 을 안내대로 합쳐 넣으면
      실제 소득 700만인데 400만으로 계산돼 세액이 66만원 과소 — 260805 Codex R2 P1)
     → 손실 거래도 매도액·취득가액 «합계»에 포함하는 것으로 일원화하고 별도 항목은 없앤다. */
  const loss = 0;
  const heldBefore = input.heldBefore !== 'no'; // 2026년 말 이전부터 보유 중인가

  /* ① 필요경비 — §37①3호 + §37⑤(의제취득가액) */
  const deemedApplies = heldBefore && mkt2026 > acq;
  const baseCost = heldBefore ? Math.max(acq, mkt2026) : acq;
  const expense = baseCost + fee;

  /* ② 가상자산소득금액 (연간 통산 — §84 3호가 «해당 과세기간의» 소득금액을 기준으로 함) */
  const rawIncome = sale - expense;
  const income = rawIncome - loss;

  /* ③ 과세최저한 §84 3호 — 연간 소득금액 250만원 이하면 과세 안 함 */
  const belowMinimum = income <= C.basicDeduct;

  /* ④ 결정세액 §64의3② — (소득금액 − 250만원) × 20% */
  const taxBase = Math.max(0, income - C.basicDeduct);
  const tax = Math.floor(taxBase * C.rate / 10) * 10;
  const local = Math.floor(Math.round(tax * C.localRateOfTax) / 10) * 10;
  const total = belowMinimum ? 0 : tax + local;

  /* 의제취득가액 덕분에 «과세되지 않고 넘어가는» 2026년 말까지의 상승분 */
  const shielded = deemedApplies ? (mkt2026 - acq) : 0;

  return {
    sale, acq, mkt2026, fee, loss, heldBefore, deemedApplies, baseCost, expense,
    rawIncome, income, belowMinimum, taxBase,
    tax: belowMinimum ? 0 : tax, local: belowMinimum ? 0 : local, total, shielded,
    effRate: sale > 0 ? total / sale : 0,
    gainIfSoldIn2026: sale - acq - fee,     // 2026년에 팔았다면 (전액 비과세)
  };
}
window.jtCrCalc = crCalc;

/* ══════════ 문항 ══════════ */
const CR_QS = [
  { id: 'heldBefore', section: '보유 시점', q: '이 코인을 2026년 12월 31일 이전부터 갖고 계신가요?',
    sub: '★ 이게 세금을 가장 크게 가릅니다. 2027년 시행 전부터 갖고 있던 코인은 「2026년 12월 31일 시가」를 취득가액으로 쳐 주기 때문에(소득세법 §37⑤), 그날까지 오른 부분에는 세금이 붙지 않습니다.',
    opts: [['yes', '예 — 2026년 말 이전부터 보유', '2026년 말 시가를 취득가액으로 인정(의제취득가액)'],
           ['no', '아니오 — 2027년 이후에 살 예정', '실제 산 가격이 취득가액']] },
  { id: 'salePrice', section: '매도 금액', q: '얼마에 파실 예정인가요? (원)', money: true, placeholder: '예: 50,000,000',
    sub: '1년 동안 판 금액을 «모두» 더해 넣으세요 — 이익 본 거래도, 손해 본 거래도 전부 포함합니다. 가상자산 세금은 건별이 아니라 «그 해 전체»를 합산해 계산하므로(소득세법 §84 3호), 손실은 아래 취득가액과 함께 자동으로 상계됩니다.' },
  { id: 'acqPrice', section: '실제 취득가액', q: '실제로 얼마에 사셨나요? (원)', money: true, placeholder: '예: 10,000,000',
    sub: '위에 넣은 «그 해에 판 코인 전부»의 취득가액 합계입니다. 손해 보고 판 코인의 취득가액도 반드시 포함하세요 — 그래야 손실이 이익과 상계됩니다. 여러 번 나눠 샀다면 모두 더합니다. 채굴·에어드랍 등으로 취득가액을 알기 어려운 경우는 별도 규정이 있습니다(아래 안내 참조).' },
  { id: 'marketAt2026', section: '2026년 말 시가', q: '2026년 12월 31일 기준 시가는 얼마였나요? (원)', money: true, placeholder: '예: 40,000,000',
    showIf: (a) => a.heldBefore !== 'no',
    sub: '그날 그 코인의 시세로 환산한 «내 보유분 전체» 금액입니다. 아직 2026년이 끝나지 않았다면 예상 금액을 넣어 보세요. 실제 시가 산정 방법은 시행령에서 정합니다.' },
  { id: 'fee', section: '거래 수수료', q: '살 때·팔 때 낸 수수료를 모두 더하면 얼마인가요? (원)', money: true, placeholder: '예: 250,000',
    sub: '거래소 매매수수료·출금수수료 등 취득·양도에 든 부대비용은 필요경비로 빼 줍니다(소득세법 §37①3호). 모르면 비워 두세요(세금이 조금 높게 나옵니다).' },
];

/* ══════════ 화면 ══════════ */
function CrNotice() {
  return (
    <div className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '13px 17px', borderRadius: 8, marginBottom: 18 }}>
      <strong style={{ display: 'block', marginBottom: 5 }}>⚠️ 2027년 1월 1일 «시행 예정» 제도입니다</strong>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
        가상자산 과세는 법에 이미 들어가 있고, 적용 시기만 부칙이 정합니다(소득세법 부칙 §5). 다만 시행일이 <strong>2022년 → 2023년 → 2025년 → 2027년으로 세 차례 미뤄졌고</strong>, 추가 유예·폐지 논의가 계속되고 있습니다. 최종 시행 여부는 국회 결정에 달려 있습니다.
      </p>
    </div>
  );
}

function CrQuestion({ q, value, onChange }) {
  return (
    <div className="jt-report-q">
      <div className="jt-report-q__section">{q.section}</div>
      <h2 style={{ fontSize: 20, lineHeight: 1.45, margin: '6px 0 8px' }}>{q.q}</h2>
      {q.sub && <p className="jt-report-q__sub" style={{ fontSize: 13.5, lineHeight: 1.7, color: '#7b756b', marginBottom: 14 }}>{q.sub}</p>}
      {q.opts ? (
        <div className="jt-report-q__opts" style={{ display: 'grid', gap: 9 }}>
          {q.opts.map(([v, label, hint]) => (
            <button key={v} onClick={() => onChange(q.id, v)} style={{
              textAlign: 'left', border: value === v ? '2px solid #2a3038' : '1px solid #dcd8d0',
              background: value === v ? '#f7f5f0' : '#fff', borderRadius: 9, padding: '12px 15px',
              cursor: 'pointer', font: 'inherit',
            }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
              {hint && <div style={{ fontSize: 12.5, color: '#7b756b', marginTop: 3 }}>{hint}</div>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <input className="jt-report-q__input" type="text" inputMode="numeric"
            value={value ? Number(String(value).replace(/[^0-9]/g, '') || 0).toLocaleString('ko-KR') : (value || '')}
            placeholder={q.placeholder || ''}
            onChange={(e) => onChange(q.id, String(e.target.value).replace(/[^0-9]/g, ''))}
            style={{ width: '100%', padding: '13px 15px', fontSize: 17, border: '1px solid #dcd8d0', borderRadius: 9, fontWeight: 700 }} />
          {crNum(value) > 0 && <div style={{ fontSize: 13, color: '#7b756b', marginTop: 7 }}>= {crEok(crNum(value))}</div>}
        </>
      )}
    </div>
  );
}

function JTReportCrypto({ setRoute, setSubRoute, onBack }) {
  const [answers, setAnswers] = useCrState({ heldBefore: 'yes' });
  const [result, setResult] = useCrState(null);
  const onChange = (id, v) => setAnswers((p) => ({ ...p, [id]: v }));
  const C = window.JT_CRYPTO_2027;

  let invalid = null;
  if (!crNum(answers.salePrice)) invalid = '매도 예정 금액을 넣어 주세요.';
  else if (answers.acqPrice == null || answers.acqPrice === '') invalid = '실제 취득가액을 넣어 주세요.';
  else if (answers.heldBefore !== 'no' && (answers.marketAt2026 == null || answers.marketAt2026 === ''))
    invalid = '2026년 12월 31일 기준 시가를 넣어 주세요. 이 값이 세금을 크게 좌우합니다.';

  const run = () => {
    setResult(crCalc(answers));
    try { window.jtTrackCta && window.jtTrackCta('calc_run', 'crypto_2027'); } catch (e) {}
    setTimeout(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} }, 30);
  };

  if (!result) {
    return (
      <JTReportShell tag="2027 시행 예정" stepIdx={0} stepTotal={2} onBack={onBack}
        title="코인 세금, 2027년부터 얼마나 낼까요?"
        subtitle="2026년 안에 팔면 0원, 2027년부터는 과세됩니다 — 내 경우 얼마인지 바로 계산합니다.">
        <div className="jt-container">
          <CrNotice />
          <div className="jt-report-calc">
            {CR_QS.filter((q) => !q.showIf || q.showIf(answers)).map((q) => (
              <div key={q.id} style={{ marginBottom: 26, paddingBottom: 22, borderBottom: '1px solid #efece6' }}>
                <CrQuestion q={q} value={answers[q.id]} onChange={onChange} />
              </div>
            ))}
            {invalid && <p style={{ color: '#b3261e', fontSize: 13.5, marginBottom: 12 }}>{invalid}</p>}
            <button className="jt-btn jt-btn--primary" onClick={run} disabled={!!invalid} style={{
              width: '100%', padding: '16px 20px', fontSize: 17, fontWeight: 800, borderRadius: 10,
              opacity: invalid ? 0.45 : 1, cursor: invalid ? 'not-allowed' : 'pointer',
            }}>내 코인 세금 계산하기 <span className="jt-arrow">→</span></button>
          </div>
        </div>
      </JTReportShell>
    );
  }

  const r = result;
  return (
    <JTReportShell tag="2027 시행 예정" stepIdx={2} stepTotal={2} onBack={onBack}
      title="가상자산 소득세 계산 결과" subtitle="2027년 1월 1일 이후 양도한다고 가정한 세액입니다.">
      <div className="jt-container">
        <CrNotice />

        {/* 언제 파느냐 비교 */}
        <section className="jt-report-result__section" style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>언제 팔면 얼마인가</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ border: '1px solid #dcd8d0', background: '#f0f7f3', borderRadius: 10, padding: '15px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1e6b45', marginBottom: 7 }}>2026년 12월 31일까지</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>0원</div>
              <div style={{ fontSize: 12.5, color: '#7b756b', lineHeight: 1.55 }}>
                아직 과세 규정이 적용되지 않아 세금이 없습니다{r.gainIfSoldIn2026 > 0 ? ` (차익 ${crEok(r.gainIfSoldIn2026)} 전액 비과세)` : ''}.
              </div>
            </div>
            <div style={{ border: '2px solid #2a3038', background: '#f7f5f0', borderRadius: 10, padding: '15px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2a3038', marginBottom: 7 }}>2027년 1월 1일 이후</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{crEok(r.total)}</div>
              <div style={{ fontSize: 12.5, color: '#7b756b' }}>{crWon(r.total)}</div>
            </div>
          </div>
        </section>

        {/* 한 줄 결론 */}
        <div className="jt-report-result__section" style={{ background: r.belowMinimum ? '#f0f7f3' : '#f7f5f0', borderLeft: `4px solid ${r.belowMinimum ? '#2a6d4f' : '#2a3038'}`, padding: '15px 18px', borderRadius: 8, marginBottom: 20 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>한 줄 결론</strong>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
            {r.belowMinimum
              ? <>그 해 가상자산 소득금액이 <strong>{crEok(r.income)}</strong>으로 과세최저한(연 250만원) 이하라 <strong>세금이 없습니다</strong>(소득세법 §84 3호). 다만 같은 해에 다른 코인을 더 팔아 합산 소득이 250만원을 넘으면 과세됩니다.</>
              : <>2027년 이후 매도 시 <strong>{crWon(r.total)}</strong>을 내게 됩니다 — 소득금액 {crEok(r.income)}에서 250만원을 뺀 {crEok(r.taxBase)}에 20%(지방소득세 포함 22%)를 적용한 금액입니다.</>}
            {r.deemedApplies && <> 2026년 말까지 오른 <strong>{crEok(r.shielded)}</strong>은 의제취득가액 덕분에 <strong>과세 대상에서 빠집니다</strong>(소득세법 §37⑤).</>}
            {!r.heldBefore && ' 2027년 이후에 사실 예정이라 의제취득가액은 적용되지 않고, 실제 산 가격이 그대로 취득가액이 됩니다.'}
          </p>
        </div>

        {/* 단계별 계산 */}
        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>단계별 계산</h3>
          <div style={{ border: '1px solid #e5e1d9', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { k: 'Step 1. 양도가액 (그 해 매도 합계)', v: r.sale, note: window.JT_CRYPTO_2027.articles.income },
              { k: 'Step 2. 취득가액', v: -r.baseCost, note: r.deemedApplies
                  ? `2026.12.31 시가 ${crWon(r.mkt2026)} > 실제 취득가액 ${crWon(r.acq)} → 큰 금액 적용 (${C.articles.deemed})`
                  : (r.heldBefore ? `실제 취득가액이 2026년 말 시가보다 커서 실제 취득가액 적용 (${C.articles.deemed})` : `실제 취득가액 (${C.articles.expense})`) },
              { k: 'Step 3. 부대비용 (수수료)', v: -r.fee, note: C.articles.expense },
              { k: '가상자산소득금액', v: r.income, note: '양도가액 − 필요경비 (그 해 전체 합산 — 손실 거래 포함)' },
              { k: '기본공제', v: -Math.min(C.basicDeduct, Math.max(0, r.income)), note: `연 250만원 (${C.articles.tax})` },
              { k: '과세표준', v: r.taxBase, note: r.belowMinimum ? `250만원 이하 → 과세 제외 (${C.articles.minimum})` : '' },
              { k: `소득세 (${(C.rate * 100).toFixed(0)}%)`, v: r.tax, note: C.articles.tax },
              { k: '지방소득세 (소득세의 10%)', v: r.local, note: '실효세율 합계 22%' },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start',
                padding: '11px 15px', borderTop: i ? '1px solid #efece6' : 'none', background: i % 2 ? '#fbfaf8' : '#fff',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.k}</div>
                  {s.note && <div style={{ fontSize: 12.5, color: '#7b756b', marginTop: 3, lineHeight: 1.55 }}>{s.note}</div>}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14.5, whiteSpace: 'nowrap', color: s.v < 0 ? '#1e6b45' : '#2a3038' }}>
                  {s.v < 0 ? '−' : ''}{crWon(Math.abs(s.v))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 핵심 정리 */}
        <section className="jt-report-result__section" style={{ background: '#f7f5f0', padding: '15px 18px', borderRadius: 8 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 8 }}>알아 두실 것</h3>
          <ul style={{ margin: 0, paddingLeft: 19, fontSize: 14, lineHeight: 1.85 }}>
            <li><strong>2026년 말까지의 상승분은 과세되지 않습니다.</strong> 2027년 전부터 갖고 있던 코인은 「2026년 12월 31일 시가」와 「실제 산 가격」 중 <strong>큰 금액</strong>을 취득가액으로 인정합니다(§37⑤). 지금 크게 올라 있다면 그만큼이 과세 대상에서 빠집니다.</li>
            <li><strong>연 250만원까지는 세금이 없습니다.</strong> 건별이 아니라 <strong>그 해 전체를 합산</strong>한 소득금액 기준입니다(§84 3호).</li>
            <li><strong>세율은 20%, 지방소득세를 더하면 22%</strong>입니다(§64조의3②). 다른 소득과 합치지 않는 분리과세입니다.</li>
            <li><strong>신고는 본인이 해야 합니다.</strong> 소득이 생긴 다음 해 5월 종합소득세 신고기간에 직접 신고·납부합니다(§70②). 거래소가 대신 떼어 주지 않습니다.</li>
            <li><strong>같은 해 손실은 상계되지만, 다음 해로 이월하는 규정은 없습니다.</strong> 손해 본 거래도 매도액·취득가액에 함께 넣으면 자동으로 상계됩니다. 손익이 큰 해에는 실현 시점 관리가 중요합니다.</li>
            <li><strong>상속·증여는 지금도 과세됩니다.</strong> 양도 과세 시행과 무관하게, 가상자산을 물려주거나 받으면 현행 상속세및증여세법에 따라 평가·과세됩니다.</li>
          </ul>
        </section>

        <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 17px', borderRadius: 8 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>이 계산에 반영하지 않은 것</strong>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            취득가액 확인이 곤란한 경우의 <strong>추계 필요경비</strong>(§37⑥ — 총양도가액의 50% 이하 범위에서 시행령이 정하는 비율, <strong>시행령 미제정</strong>), 2026.12.31 시가의 구체적 산정 방법, 여러 번 나눠 산 경우의 취득가액 산정 순서(선입선출 등 시행령 위임 사항), 대여(스테이킹·렌딩) 소득, 해외 거래소·개인지갑 보유분, 채굴·에어드랍·하드포크로 취득한 코인, NFT 해당 여부는 반영하지 않았습니다.
            시행령이 아직 정비되지 않은 부분이 있어 실제 시행 시 세부 계산이 달라질 수 있습니다.
          </p>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 6px' }}>
          <button className="jt-btn jt-btn--ghost" onClick={() => setResult(null)}>← 조건 바꿔서 다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => setSubRoute && setSubRoute('reform-cgt')}>2026 세제개편안 양도세는? →</button>
        </div>

        <JTReportCta setRoute={setRoute} />
        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>다른 세금도 계산해 보세요</h3>
          <p style={{ fontSize: 13.5, color: '#7b756b', margin: '0 0 12px' }}>모두 무료 · 로그인 불필요 · 입력값은 저장하지 않습니다.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 10 }}>
            {[
              { sub: 'reform-cgt', kr: '2026 세제개편안 양도세 계산기', d: '장특공제 거주 전환 — 연도별 비교' },
              { sub: 'reform-cre', kr: '2026 종부세 개편안 계산기', d: '거주 14억 vs 비거주 9억' },
              { sub: 'gift', kr: '증여세 계산기', d: '코인을 자녀에게 넘길 때' },
              { sub: 'inheritance', kr: '상속세 계산기', d: '가상자산도 상속재산입니다' },
              { sub: 'income', kr: '종합소득세 계산기', d: '사업·프리랜서 소득까지 합산' },
              { sub: 'cgt', kr: '양도소득세 계산기', d: '부동산을 팔 때' },
            ].map((x) => (
              <button key={x.sub} onClick={() => setSubRoute && setSubRoute(x.sub)} style={{
                textAlign: 'left', border: '1px solid #dcd8d0', borderRadius: 9, padding: '13px 15px',
                background: '#fff', cursor: 'pointer', font: 'inherit',
              }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>{x.kr} <span style={{ color: '#b0a89b' }}>→</span></div>
                <div style={{ fontSize: 12.5, color: '#7b756b', lineHeight: 1.5 }}>{x.d}</div>
              </button>
            ))}
          </div>
        </section>
        <JTReportDisclaimer variant="inline" />
      </div>
    </JTReportShell>
  );
}

window.JTReportCrypto = JTReportCrypto;
