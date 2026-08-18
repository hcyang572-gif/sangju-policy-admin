/* 상주정책(공무원용) — 눌림 반응(파동) + 햅틱
 * ────────────────────────────────────────────────────────────────
 * 확정 디자인 시안 A「감빛 온기」의 «누르면 반응한다» 규칙을 앱에 옮긴 것이다.
 *   ① :active 축소 … style.css 가 처리(button/[role=button] 공통)
 *   ② 눌림 파동   … 여기서 .tap-ripple 클래스를 잠깐 붙였다 뗀다(CSS 애니메이션)
 *   ③ 햅틱        … navigator.vibrate(12) — 지원하는 기기에서만
 *
 * ⚠ 이 파일은 «시각 레이어» 전용이다. 어떤 업무 로직도 담지 않는다.
 *    - 이벤트를 가로채거나(preventDefault) 전파를 막지 않는다 → app.js 의 onclick 이 그대로 동작한다.
 *    - 요소를 추가·삭제하지 않는다(::after 가상요소만 쓴다).
 * ⚠ CSP(style-src 'self')가 인라인 style 속성을 막으므로 «좌표를 심는» 파동은 쓸 수 없다.
 *    대신 요소 가운데에서 퍼지는 파동을 CSS 로만 만든다(style.css .tap-ripple).
 * ⚠ 「동작 줄이기」(prefers-reduced-motion:reduce)를 켠 사용자에게는 파동을 아예 걸지 않는다.
 *    (CSS 에서도 한 번 더 막지만, 클래스 자체를 붙이지 않는 편이 확실하다)
 */
(function () {
  "use strict";

  // 누를 수 있는 것으로 볼 대상 — 실제 버튼·링크·역할이 button 인 카드
  // ⚠ .skip-link 는 제외한다. 파동을 위한 .tap-ripple{position:relative} 가
  //    .skip-link{position:absolute} 를 덮어써 «본문 바로가기» 링크가 화면 안으로 튀어나온다.
  var TAPPABLE = 'button,[role="button"],a[href]:not(.skip-link),summary';

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // 진동은 «지원 기기 + 사용자 조작» 에서만 울린다. 실패해도 조용히 넘어간다.
  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) { /* 지원하지 않는 브라우저 — 무시 */ }
  }

  function ripple(el) {
    if (!el || reduceMotion()) return;
    // 이미 파동 중이면 다시 걸어 재생을 처음부터(연타 대응)
    el.classList.remove("tap-ripple");
    // 리플로우를 한 번 일으켜야 애니메이션이 다시 시작된다
    void el.offsetWidth;
    el.classList.add("tap-ripple");
  }

  document.addEventListener(
    "pointerdown",
    function (e) {
      // 마우스는 «왼쪽 버튼»만(오른쪽 클릭 메뉴에서 파동이 튀지 않게)
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var t = e.target && e.target.closest ? e.target.closest(TAPPABLE) : null;
      if (!t) return;
      if (t.disabled) return;
      ripple(t);
      haptic();
    },
    true   // 캡처 단계 — app.js 가 클릭을 처리하기 전에 «표시»만 먼저 한다
  );

  // 애니메이션이 끝나면 클래스를 떼어 원래 상태(overflow 등)로 되돌린다
  document.addEventListener(
    "animationend",
    function (e) {
      if (e.animationName !== "tapWave") return;
      var el = e.target;
      if (el && el.classList) el.classList.remove("tap-ripple");
    },
    true
  );

  // 키보드(Enter/Space)로 눌렀을 때도 같은 반응을 준다 — 마우스 없이 쓰는 이용자 배려
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    if (e.repeat) return;
    var el = document.activeElement;
    if (!el || !el.matches || !el.matches(TAPPABLE)) return;
    if (el.disabled) return;
    ripple(el);
    haptic();
  });
})();
