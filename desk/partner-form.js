/* Only a confirmed provider response is a lead; form clicks are not leads.
 * Never pass form values, response text, or contact details to analytics.
 */
(function (root) {
  'use strict';
  function attach(form, env) {
    if (form.dataset.partnerFormBound) return;
    var type = form.dataset.partnerType;
    if (type !== 'scrivener' && type !== 'broker') return;
    if (typeof env.fetch !== 'function' || typeof env.FormData !== 'function') return;
    form.dataset.partnerFormBound = 'true';
    var button = form.querySelector('[type="submit"]');
    var status = form.querySelector('[role="status"]');
    var busy = false, completed = false;
    function message(text) { status.textContent = text; }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || completed || !form.reportValidity()) return;
      busy = true;
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      message('접수 중입니다. 잠시만 기다려 주세요.');
      var controller, timeout;
      try {
        var data = Object.fromEntries(new env.FormData(form));
        // HTML redirect is kept for browsers without JS; JSON submissions redirect here.
        delete data.redirect;
        if (!data.access_key || !data.office || !data.contact || !data.memo ||
            data['개인정보동의'] !== '동의함' || data['국외이전동의'] !== '동의함') {
          throw new Error('invalid');
        }
        controller = new env.AbortController();
        timeout = env.setTimeout(function () { controller.abort(); }, 20000);
        var response = await env.fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data), signal: controller.signal
        });
        var result = await response.json();
        if (!response.ok || !result || result.success !== true) throw new Error('unconfirmed');
      } catch (_) {
        // An interrupted response may already have reached the mailbox: never auto-resend.
        message('접수 결과를 확인하지 못했습니다. 중복 접수를 피하려면 전화(02-554-6405)나 카카오톡으로 먼저 확인해 주세요.');
        busy = false;
        button.disabled = false;
        return;
      } finally {
        env.clearTimeout(timeout);
        form.setAttribute('aria-busy', 'false');
      }
      completed = true;
      message('문의가 접수되었습니다. 잠시 후 완료 화면으로 이동합니다.');
      form.reset();
      // Track on this page so the existing session/campaign remains attached.
      // No thank-you-page event: direct visits, reloads and back navigation are not leads.
      var navigated = false;
      function finish() {
        if (navigated) return;
        navigated = true;
        env.location.assign('/desk/thanks.html');
      }
      env.setTimeout(finish, 1200);
      try {
        if (typeof env.gtag === 'function') {
          env.gtag('event', 'partner_submit', {
            send_to: 'G-ETRXTFKLFE', channel: 'form', location: 'desk_' + type,
            partner_type: type, event_callback: finish, event_timeout: 1000
          });
        } else finish();
      } catch (_) { finish(); }
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = attach;
  else root.document.querySelectorAll('form[data-partner-type]').forEach(function (form) { attach(form, root); });
})(typeof window === 'undefined' ? {} : window);
