/* 상주정책(공무원용) — 「홈 화면에 추가」 안내 (Add to Home Screen)
 * ────────────────────────────────────────────────────────────────
 * 양호창님 요청: 「브라우저 때문에 전체화면으로 보기 불편하지 않게, 일반 앱처럼」.
 * manifest.json 의 display:"standalone" 으로 «설치하면» 주소창 없이 열리므로,
 * 설치가 실제로 가능한 순간에만 설치를 권한다.
 *
 * 규칙
 *   · 이미 설치해서 실행 중(standalone)이면 띄우지 않는다.
 *   · 브라우저가 설치 가능하다고 알려 줄 때(beforeinstallprompt)만 띄운다.
 *     (사파리·인앱 웹뷰는 이 사건이 없어 안내가 뜨지 않는다 — 그쪽은 app.js 의 인앱 배너가 맡는다)
 *   · 한 번 닫으면 localStorage 에 남겨 «다시 나오지 않는다».
 *   · 설치가 끝나면(appinstalled) 즉시 감춘다.
 *
 * ⚠ 시각·안내 전용이다. 로그인·접수 등 업무 로직과 아무 관계가 없다.
 */
(function () {
  "use strict";

  var KEY = "sangju_admin_a2hs_dismissed";
  var deferred = null;

  function $(id) { return document.getElementById(id); }

  function installedAlready() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           window.navigator.standalone === true;
  }

  function dismissed() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  function hide() {
    var b = $("a2hsBanner");
    if (b) b.hidden = true;
  }

  function remember() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* 저장 못 해도 이번 화면에서는 감춘다 */ }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    // 브라우저 기본 설치 배너를 미루고, 우리 안내로 대신한다
    e.preventDefault();
    deferred = e;
    if (installedAlready() || dismissed()) return;
    var b = $("a2hsBanner");
    if (b) b.hidden = false;
  });

  window.addEventListener("appinstalled", function () { remember(); hide(); });

  document.addEventListener("DOMContentLoaded", function () {
    var btn = $("a2hsInstall"), close = $("a2hsClose");
    if (btn) {
      btn.addEventListener("click", function () {
        if (!deferred) { hide(); return; }
        hide();
        deferred.prompt();
        // 사용자가 취소해도 다시 조르지 않는다(설치 여부와 무관하게 안내는 여기서 끝)
        var d = deferred;
        deferred = null;
        if (d.userChoice && d.userChoice.then) d.userChoice.then(function () { remember(); });
        else remember();
      });
    }
    if (close) close.addEventListener("click", function () { remember(); hide(); });
  });
})();
