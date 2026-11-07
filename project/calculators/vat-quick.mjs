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
      </form>
      <p id="vat-result" role="status" aria-live="polite" aria-atomic="true" style="margin:12px 0;font-size:16px;font-weight:600"></p>
      <button id="vat-copy" type="button" hidden>계산 결과 복사</button>
      <span id="vat-copy-status" role="status"></span>
      <h3>영수증과 견적서는 어떻게 계산하나요?</h3>
      <p><strong>영수증에 110,000원이 찍혔다면</strong> 합계의 1/11인 10,000원이 부가세이고, 이를 뺀 100,000원이 공급가액입니다.</p>
      <p><strong>견적이 100,000원에 부가세 별도라면</strong> 공급가액의 10%인 10,000원을 더해 청구할 합계는 110,000원입니다.</p>
      <p>이 계산기는 부가세를 원 단위로 반올림합니다. 예를 들어 부가세 포함 10,000원은 공급가액 9,091원과 부가세 909원으로 나뉩니다. <a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2274&amp;cntntsId=7696">국세청 부가가치세 세액계산 안내</a></p>
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
        field.addEventListener('input', clearResult);
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
          clearResult();
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const raw = field.value.trim();
          const amount = Number(raw.replaceAll(',', ''));
          if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw) || amount < 1 || amount > 999999999999) {
            field.setAttribute('aria-invalid','true');
            result.textContent = '1원 이상 999,999,999,999원 이하의 금액을 정수로 입력하세요.';
            field.focus(); return;
          }
          const gross = form.elements['vat-mode'].value === 'gross';
          const vat = Math.round(amount / (gross ? 11 : 10));
          const net = gross ? amount - vat : amount;
          const won = n => n.toLocaleString('ko-KR') + '원';
          result.textContent = '공급가액 ' + won(net) + ' · 부가세 ' + won(vat) + ' · 합계 ' + won(net + vat);
          copy.hidden = false;
          copyStatus.textContent = '';
          if (!counted && typeof window.gtag === 'function') {
            counted = true; window.gtag('event','vat_quick_calculate');
          }
        });
      })();
    </script>`;
