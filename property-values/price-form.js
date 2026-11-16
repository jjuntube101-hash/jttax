/* 공시가격·기준시가 검토 요청 양식 — desk/partner-form.js 와 같은 계약.
 * Only a confirmed provider response is a lead; form clicks are not leads.
 * Never pass form values, response text, or contact details to analytics.
 * 마감(2026-12-02 KST) 뒤에는 첫 화면 띠·리드 문구를 «재산정 신청» 안내로 바꾼다.
 */
(function (root) {
  'use strict';
  // 2026-12-03 00:00 KST = 2026-12-02 15:00 UTC. 의견제출 마감(12.2.) 다음 날부터 마감 문구.
  var DEADLINE_END_UTC = Date.UTC(2026, 11, 2, 15, 0, 0);

  function deadlineState(now) {
    return now >= DEADLINE_END_UTC ? 'closed' : 'open';
  }

  // 마감일까지 남은 날 수 — 한국 시간(KST) 달력 날짜의 차이. 12월 2일 당일은 0.
  var DEADLINE_KST_DAY = Date.UTC(2026, 11, 2) / 86400000;
  function daysLeft(now) {
    return DEADLINE_KST_DAY - Math.floor((now + 9 * 3600000) / 86400000);
  }

  function applyDeadline(doc, now) {
    var badge = doc.getElementById('pr-deadline');
    var lede = doc.getElementById('pr-lede');
    if (!badge) return deadlineState(now);
    if (deadlineState(now) !== 'closed') {
      var d = daysLeft(now);
      badge.textContent = '국세청 · 2027년 기준시가(안) 의견제출 · 12월 2일(수) 마감 · ' + (d > 0 ? 'D-' + d : '오늘 마감');
      return 'open';
    }
    badge.dataset.state = 'closed';
    // 마감 전에만 맞는 문장(직접 제출 안내·«마감 전에 제출» 약속)은 숨기고 재산정 신청 문장을 보인다.
    if (typeof doc.querySelectorAll === 'function') {
      Array.prototype.forEach.call(doc.querySelectorAll('[data-open-only]'), function (el) { el.hidden = true; });
      Array.prototype.forEach.call(doc.querySelectorAll('[data-closed-only]'), function (el) { el.hidden = false; });
    }
    badge.textContent = '2027년 기준시가(안) 의견제출은 12월 2일에 끝났습니다';
    if (lede) lede.textContent = '기준시가가 고시된 뒤에도 고시일부터 30일 안에 서면으로 재산정을 신청할 수 있습니다. 상속·증여나 양도를 앞두고 계시다면 세무사와 함께 확인해 보세요.';
    return 'closed';
  }

  function attach(form, env) {
    if (form.dataset.priceFormBound) return;
    if (form.dataset.priceForm !== 'price') return;
    if (typeof env.fetch !== 'function' || typeof env.FormData !== 'function') return;
    form.dataset.priceFormBound = 'true';
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
        if (!data.access_key || !data.contact || !data.kind || !data.area || !data.plan ||
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
      message('검토 요청이 접수되었습니다. 잠시 후 완료 화면으로 이동합니다.');
      form.reset();
      var navigated = false;
      function finish() {
        if (navigated) return;
        navigated = true;
        env.location.assign('/property-values/thanks.html');
      }
      env.setTimeout(finish, 1200);
      try {
        if (typeof env.gtag === 'function') {
          env.gtag('event', 'property_values_submit', {
            send_to: 'G-ETRXTFKLFE', channel: 'form', location: 'property_values',
            event_callback: finish, event_timeout: 1000
          });
        } else finish();
      } catch (_) { finish(); }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { attach: attach, applyDeadline: applyDeadline, deadlineState: deadlineState, daysLeft: daysLeft, DEADLINE_END_UTC: DEADLINE_END_UTC };
  } else {
    applyDeadline(root.document, Date.now());
    // 마감 전에 열어 둔 탭도 자정(KST)을 넘기면 전환한다 — 예약 1회 + 탭이 다시 보일 때 재판정 (Codex TASK-261116-010 R2-F1)
    var left = DEADLINE_END_UTC - Date.now();
    if (left > 0) setTimeout(function () { applyDeadline(root.document, Date.now()); }, Math.min(left + 1000, 2147483647));
    root.document.addEventListener('visibilitychange', function () {
      if (!root.document.hidden) applyDeadline(root.document, Date.now());
    });
    root.document.querySelectorAll('form[data-price-form]').forEach(function (form) { attach(form, root); });
  }
})(typeof window === 'undefined' ? {} : window);
