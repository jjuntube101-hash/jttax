// This markup is included only on the VAT landing page, before the filing guide.
export const vatQuick = `<section id="vat-quick" class="jt-cc-card" aria-labelledby="vat-quick-title" style="margin:20px 0;scroll-margin-top:90px">
      <h2 id="vat-quick-title" style="margin:0 0 8px">합계금액에서 부가세 나누기</h2>
      <p id="vat-help">부가세 10%가 포함된 한 건의 거래금액을 입력하세요. 면세·영세율 거래는 대상이 아닙니다.</p>
      <form id="vat-quick-form" style="margin-top:16px">
        <label for="vat-total"><strong>부가세 포함 합계금액 (원)</strong></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">
          <input id="vat-total" type="text" inputmode="numeric" autocomplete="off" aria-describedby="vat-help" placeholder="예: 110,000" style="min-width:0;width:14em;max-width:100%;padding:10px;font-size:16px;border:1px solid #777;border-radius:4px">
          <button type="submit" class="jt-btn jt-btn--primary">공급가액·부가세 계산</button>
        </div>
      </form>
      <p id="vat-result" role="status" aria-live="polite" aria-atomic="true" style="margin:12px 0;font-size:16px;font-weight:600"></p>
      <p>예: 110,000원 = 공급가액 100,000원 + 부가세 10,000원. 부가세는 합계의 1/11을 원 단위로 반올림하고 나머지를 공급가액으로 표시합니다.</p>
      <noscript>직접 계산하려면 자바스크립트를 켜 주세요.</noscript>
    </section>
    <script>
      (() => {
        const field = document.getElementById('vat-total');
        const result = document.getElementById('vat-result');
        let counted = false;
        field.addEventListener('input', () => { result.textContent = ''; field.removeAttribute('aria-invalid'); });
        document.getElementById('vat-quick-form').addEventListener('submit', (event) => {
          event.preventDefault();
          const raw = field.value.trim();
          const total = Number(raw.replaceAll(',', ''));
          if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw) || total < 1 || total > 999999999999) {
            field.setAttribute('aria-invalid','true');
            result.textContent = '1원 이상 999,999,999,999원 이하의 합계금액을 정수로 입력하세요.';
            field.focus(); return;
          }
          const vat = Math.round(total / 11);
          const won = n => n.toLocaleString('ko-KR') + '원';
          result.textContent = '공급가액 ' + won(total - vat) + ' · 부가세 ' + won(vat) + ' · 합계 ' + won(total);
          if (!counted && typeof window.gtag === 'function') {
            counted = true; window.gtag('event','vat_quick_calculate');
          }
        });
      })();
    </script>`;
