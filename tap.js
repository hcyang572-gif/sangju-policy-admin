/* 상주정책(공무원용) — 눌림 되먹임(햅틱)
 * ────────────────────────────────────────────────────────────────
 * 확정 디자인 시안 A「감빛 온기」의 «누르면 반응한다» 규칙 가운데 둘이 남아 있다.
 *   ① :active 축소 … style.css 가 처리한다(button/[role=button] 공통). 이 파일 밖이다.
 *   ③ 햅틱        … navigator.vibrate(12) — 지원하는 기기에서만. ← 이 파일이 하는 일
 *
 * ⛔ ② «눌림 파동»(.tap-ripple — 물방울처럼 퍼지던 효과)은 2026-08-20 양호창님 지시로
 *    세 앱에서 «영구 제거»했습니다. 되살리지 마세요.
 *      함께 걷어낸 것 — 이 파일의 ripple() 과 animationend 처리,
 *      style.css 의 .tap-ripple / .tap-ripple::after / @keyframes tapWave,
 *      그리고 prefers-reduced-motion 블록 안의 .tap-ripple::after{display:none}.
 *    ★ 파동을 담으려고 잠깐 걸던 .tap-ripple{position:relative;overflow:hidden} 이 사라지면서,
 *      누르는 «순간»에 초점 링(outline-offset:2px)이 잘리던 부작용도 함께 없어졌습니다.
 *
 * ⚠ 이 파일은 «시각·촉각 레이어» 전용이다. 어떤 업무 로직도 담지 않는다.
 *    - 이벤트를 가로채거나(preventDefault) 전파를 막지 않는다 → app.js 의 onclick 이 그대로 동작한다.
 *    - 요소를 추가·삭제하지 않고, 클래스도 붙이지 않는다.
 *
 * ※ 파일을 남겨 둔 이유(2026-08-20 판단) — 남은 일이 햅틱뿐이라 app.js 로 옮길 수도 있었지만,
 *   ① «무엇을 누를 수 있는 것으로 보는가»(TAPPABLE)를 한 곳에 두는 값이 그대로이고,
 *   ② index.html 의 <script> 와 sw.js 의 프리캐시 목록(ESSENTIAL)을 건드리지 않아
 *      시연 직전에 «캐시 목록과 실제 파일이 어긋나는» 위험을 만들지 않으며,
 *   ③ 시민앱·PC앱도 같은 이름의 tap.js 를 두고 있어 세 앱의 짜임새가 어긋나지 않는다.
 */
(function () {
  "use strict";

  // 누를 수 있는 것으로 볼 대상 — 실제 버튼·링크·역할이 button 인 카드
  // ※ 예전에는 .skip-link 를 제외했다. 파동용 .tap-ripple{position:relative} 가
  //   .skip-link{position:absolute} 를 덮어써 «본문 바로가기»가 화면 안으로 튀어나왔기 때문이다.
  //   파동을 없앤 지금은 클래스를 붙이지 않으므로 그 이유가 사라졌다 → 제외하지 않는다.
  var TAPPABLE = 'button,[role="button"],a[href],summary';

  // 진동은 «지원 기기 + 사용자 조작» 에서만 울린다. 실패해도 조용히 넘어간다.
  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) { /* 지원하지 않는 브라우저 — 무시 */ }
  }

  document.addEventListener(
    "pointerdown",
    function (e) {
      // 마우스는 «왼쪽 버튼»만(오른쪽 클릭 메뉴에서 진동이 튀지 않게)
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var t = e.target && e.target.closest ? e.target.closest(TAPPABLE) : null;
      if (!t || t.disabled) return;
      haptic();
    },
    true   // 캡처 단계 — app.js 가 클릭을 처리하기 전에 «되먹임»만 먼저 준다
  );

  // 키보드(Enter/Space)로 눌렀을 때도 같은 반응을 준다 — 마우스 없이 쓰는 이용자 배려
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    if (e.repeat) return;
    var el = document.activeElement;
    if (!el || !el.matches || !el.matches(TAPPABLE) || el.disabled) return;
    haptic();
  });
})();
