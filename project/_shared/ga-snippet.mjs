// project/_shared/ga-snippet.mjs
//
// 정적 페이지(계산기·인사이트) 공용 GA4 로더 + 상담 CTA 통일 계측 스니펫.
// 루트 index.html(SPA)의 GA4 설정과 동일한 속성(G-ETRXTFKLFE)·동일한 이벤트 스키마를 쓴다.
//
//   jtTrackCta(channel, location)
//     channel : 'call' | 'kakao' | 'booking' | 'email'
//     location: 'calc_top' | 'calc_bottom' | 'calc_index' | 'insight' ...
//
// SPA 쪽 동일 헬퍼는 project/src/Chrome.jsx 의 window.jtTrackCta — 이벤트 스키마(cta_click)를
// 바꿀 때는 두 곳을 함께 맞춘다.

export const GA_ID = 'G-ETRXTFKLFE';

export const GA_HEAD_SNIPPET = `  <!-- Google Analytics 4 (GA4) + 상담 CTA 통일 계측(cta_click) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}', { anonymize_ip: true });
    window.gtag = gtag;
    // 상담 CTA 표준 이벤트 — gtag 미로드 환경에서도 에러 없이 무시
    window.jtTrackCta = function (channel, location, extra) {
      try {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'cta_click', Object.assign({ channel: channel, location: location }, extra || {}));
        }
      } catch (_e) {}
    };
  </script>`;
