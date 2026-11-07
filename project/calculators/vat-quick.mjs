// This markup is included only on the VAT landing page, before the filing guide.
export const vatQuick = `<section id="vat-quick" class="jt-cc-card" aria-labelledby="vat-quick-title" style="margin:20px 0;scroll-margin-top:90px">
      <h2 id="vat-quick-title" style="margin:0 0 8px">공급가액·부가세 계산</h2>
      <p id="vat-help">일반과세자의 10% 과세 거래 한 건을 계산합니다. 면세·영세율 거래는 대상이 아닙니다.</p>
      <form id="vat-quick-form" style="margin-top:16px">
        <fieldset style="border:0;padding:0;margin:0 0 12px"><legend>알고 있는 금액</legend>
          <label style="display:inline-block;padding:8px 12px 8px 0"><input type="radio" name="vat-mode" value="gross" checked> 영수증 합계금액</label>
          <label style="display:inline-block;padding:8px 0"><input type="radio" name="vat-mode" value="net"> 견적서 공급가액</label>
        </fieldset>
        <label for="vat-total"><strong id="vat-label">부가세 포함 합계금액 (원)</strong></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">
          <input id="vat-total" type="text" inputmode="numeric" autocomplete="off" aria-describedby="vat-help" placeholder="예: 110,000" style="min-width:0;width:14em;max-width:100%;padding:10px;font-size:16px;border:1px solid #777;border-radius:4px">
          <button type="submit" class="jt-btn jt-btn--primary">공급가액·부가세 계산</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0" aria-label="예시 금액">
          <button type="button" data-amount="55000">55,000원</button><button type="button" data-amount="110000">110,000원</button><button type="button" data-amount="1000000">1,000,000원</button>
        </div>
        <label for="vat-round">부가세 원 미만 처리</label>
        <select id="vat-round"><option value="round">반올림</option><option value="floor">버림</option><option value="ceil">올림</option></select>
      </form>
      <p id="vat-result" role="status" aria-live="polite" aria-atomic="true" style="margin:12px 0;font-size:16px;font-weight:600"></p>
      <button id="vat-copy" type="button" hidden>계산 결과 복사</button>
      <span id="vat-copy-status" role="status"></span>
      <h3>영수증과 견적서는 어떻게 계산하나요?</h3>
      <p><strong>영수증에 110,000원이 찍혔다면</strong> 합계의 1/11인 10,000원이 부가세이고, 이를 뺀 100,000원이 공급가액입니다.</p>
      <p><strong>견적이 100,000원에 부가세 별도라면</strong> 공급가액의 10%인 10,000원을 더해 청구할 합계는 110,000원입니다.</p>
      <p>기본값은 부가세를 원 단위로 반올림하는 방식입니다. 부가세 포함 10,000원은 공급가액 9,091원과 부가세 909원입니다. 거래명세서와 1원 차이가 나면 원 미만 처리 방식을 확인하세요.</p>
      <table style="width:100%;text-align:left;font-variant-numeric:tabular-nums"><caption>부가세 포함 100만 원을 나눌 때</caption><thead><tr><th scope="col">부가세 끝수</th><th scope="col">공급가액</th><th scope="col">부가세</th></tr></thead><tbody><tr><th scope="row">반올림·버림</th><td>909,091원</td><td>90,909원</td></tr><tr><th scope="row">올림</th><td>909,090원</td><td>90,910원</td></tr></tbody></table>
      <p>여기서는 먼저 부가세를 원 단위로 맞춘 뒤 합계에서 뺍니다. 어느 방식을 골라도 공급가액과 부가세를 더하면 입력한 합계가 됩니다. <a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2274&amp;cntntsId=7696">국세청 부가가치세 세액계산 안내</a></p>
      <noscript>직접 계산하려면 자바스크립트를 켜 주세요.</noscript>
    </section>
    <script>
      (() => {
        const field = document.getElementById('vat-total');
        const result = document.getElementById('vat-result');
        const form = document.getElementById('vat-quick-form');
        const copy = document.getElementById('vat-copy');
        const copyStatus = document.getElementById('vat-copy-status');
        let counted = false;
        function clearResult() {
          result.textContent = '';
          field.removeAttribute('aria-invalid');
          copy.hidden = true;
          copyStatus.textContent = '';
        }
        field.addEventListener('input', () => calculate(false));
        document.getElementById('vat-round').addEventListener('change', () => calculate(false));
        for (const button of form.querySelectorAll('[data-amount]')) {
          button.addEventListener('click', () => {
            field.value = Number(button.dataset.amount).toLocaleString('ko-KR');
            calculate(true);
          });
        }
        copy.addEventListener('click', async () => {
          const value = result.textContent;
          try {
            await navigator.clipboard.writeText(value);
            if (result.textContent === value) copyStatus.textContent = '복사했습니다.';
          } catch {
            if (result.textContent === value) copyStatus.textContent = '결과 문장을 선택해 복사하세요.';
          }
        });
        form.addEventListener('change', (event) => {
          if (event.target.name !== 'vat-mode') return;
          const gross = event.target.value === 'gross';
          document.getElementById('vat-label').textContent = gross ? '부가세 포함 합계금액 (원)' : '부가세 별도 공급가액 (원)';
          field.placeholder = gross ? '예: 110,000' : '예: 100,000';
          field.value = '';
          clearResult();
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          calculate(true);
        });
        function calculate(explicit) {
          clearResult();
          const raw = field.value.trim();
          const amount = Number(raw.replaceAll(',', ''));
          if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw) || amount < 1 || amount > 999999999999) {
            if (!explicit) return;
            field.setAttribute('aria-invalid','true');
            result.textContent = '1원 이상 999,999,999,999원 이하의 금액을 정수로 입력하세요.';
            field.focus(); return;
          }
          const gross = form.elements['vat-mode'].value === 'gross';
          const rounding = document.getElementById('vat-round').value;
          const vat = ({round: Math.round, floor: Math.floor, ceil: Math.ceil})[rounding](amount / (gross ? 11 : 10));
          const net = gross ? amount - vat : amount;
          const won = n => n.toLocaleString('ko-KR') + '원';
          result.textContent = '공급가액 ' + won(net) + ' · 부가세 ' + won(vat) + ' · 합계 ' + won(net + vat);
          copy.hidden = false;
          copyStatus.textContent = '';
          if (explicit && !counted && typeof window.gtag === 'function') {
            counted = true; window.gtag('event','vat_quick_calculate');
          }
        }
      })();
    </script>`;
