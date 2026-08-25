/* 상주정책(공무원용) — 「홈 화면에 추가」 안내 + 「바탕화면 아이콘 설치」 단추 (Add to Home Screen)
 * ────────────────────────────────────────────────────────────────
 * 양호창님 요청: 「브라우저 때문에 전체화면으로 보기 불편하지 않게, 일반 앱처럼」.
 * manifest.json 의 display:"standalone" 으로 «설치하면» 주소창 없이 열리므로,
 * 설치가 실제로 가능한 순간에만 설치를 권한다.
 *
 * 안내하는 곳이 «둘»이다 — 하는 일은 같고, 사라지는 규칙이 다르다.
 *   ① #a2hsBanner   — 화면 위에 떠서 «권하는» 띠. 한 번 닫으면 다시 나오지 않는다.
 *   ② #btnDeskIcon  — 푸터의 「바탕화면 아이콘 설치」 단추(2026-08-25 양호창님 지시).
 *                     PC앱 webui/index.html 의 같은 이름 단추와 자리·문구를 맞췄다.
 *                     ★ ①의 「다시 보지 않기」와 «무관하게» 보인다 — 배너를 닫아 버린
 *                       공무원에게 설치할 길을 남겨 두는 것이 이 단추의 존재 이유다.
 *                       (이 구분이 이 파일의 핵심이다. 둘을 한 규칙으로 묶지 말 것.)
 *
 * 규칙
 *   · 이미 설치해서 실행 중(standalone)이면 둘 다 띄우지 않는다.
 *   · 브라우저가 설치 가능하다고 알려 줄 때(beforeinstallprompt)만 띄운다.
 *     (사파리·인앱 웹뷰는 이 사건이 없어 둘 다 끝까지 뜨지 않는다 — 그쪽은 app.js 의 인앱 배너가 맡는다)
 *   · 설치가 끝나면(appinstalled) 즉시 감춘다.
 *
 * ⛔ 설치 확률을 높이려고 단추를 «항상» 보이게 두지 말 것 —
 *    deferred 가 없는 브라우저에서는 눌러도 아무 일이 일어나지 않는 막다른 길이 된다
 *    (「할 수 없는 일을 단추로 보여 주지 않는다」 — #btnAcct·#btnSyncLog 와 같은 규약).
 *
 * ⚠ 시각·안내 전용이다. 로그인·접수 등 업무 로직과 아무 관계가 없다.
 */
(function () {
  "use strict";

  var KEY = "sangju_admin_a2hs_dismissed";
  var deferred = null;
  var wantBtn = false;   // beforeinstallprompt 가 DOM 준비보다 먼저 올 때를 위한 예약

  function $(id) { return document.getElementById(id); }

  // 화면낭독기 통지 — app.js 의 announce() 를 쓴다.
  // ⛔ 여기서 라이브영역을 새로 만들지 말 것(#liveStatus 가 둘이 되면 중복해서 읽는다).
  function say(msg) {
    try { if (typeof announce === "function") announce(msg); } catch (e) { /* 통지 못 해도 설치는 진행된다 */ }
  }

  function installedAlready() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           window.navigator.standalone === true;
  }

  function dismissed() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  /* ⚠ 배너는 일부러 초점을 옮기지 «않는다» — 아래 hideBtn() 과 갈라지는 지점이다.
     배너는 문서 맨 위(<body> 첫 자식)에 있어, 초점을 잃어도 다음 Tab 이 바로 그 자리로
     돌아온다 — 잃는 것이 거의 없다. 반면 여기서 푸터로 초점을 던져 놓으면 페이지 맨 위에
     있던 사람을 맨 아래로 던져 버리는 꼴이 된다. «함부로 옮기는 쪽이 안 옮기는 쪽보다 나쁜»
     대표적인 경우라 그대로 둔다. 푸터 단추는 반대다 — 거기서 초점을 잃으면 페이지
     전체를 다시 Tab 해야 하므로 반드시 이웃으로 넘겨준다. */
  function hide() {
    var b = $("a2hsBanner");
    if (b) b.hidden = true;
  }

  function remember() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* 저장 못 해도 이번 화면에서는 감춘다 */ }
  }

  /* 푸터 단추 보이기/감추기 — .hidden 은 style.css 의 display:none !important 다. */
  function showBtn() {
    var b = $("btnDeskIcon");
    if (!b) { wantBtn = true; return; }   // 아직 DOM 이 없다 → DOMContentLoaded 에서 다시 시도
    b.classList.remove("hidden");
  }
  /* ⌨ 사라지는 단추에서 초점을 받아 낸다 — 이웃 푸터 단추(#btnPrivacy)로 옮긴다.
   * ──────────────────────────────────────────────────
   * 키보드로 #btnDeskIcon 에 초점을 두고 Enter 를 누르면 바로 그 단추가 display:none 이
   * 된다. 그대로 두면 초점이 <body> 로 떨어져, 설치 대화상자가 닫힌 뒤 키보드·
   * 화면낭독기 이용자는 방금 있던 푸터 자리를 잃고 문서 맨 앞부터 다시 Tab 해야 한다
   * (KWCAG 2.2 «초점 이동»).
   * ★ PC앱 webui/proposals.js 의 pCmtRefocus() 와 «같은 결»로 맞춘 것이다.
   *   ⛔ 새 방식을 발명하지 말 것 — 세 앱이 같은 규약을 쓴다.
   * ★ 그 함수의 핵심 하나를 그대로 가져왔다 — «초점이 바로 이 단추 위에 있을 때만»
   *   개입한다. 이용자가 다른 칸을 만지고 있으면 초점을 빼앗지 않는다 —
   *   초점을 함부로 옮기는 것이 안 옮기는 것보다 나쁜 때가 많다.
   * ⚠ say()와는 «별개»의 일이다 — 「무슨 일이 있었나」는 통지가, 「초점이 어디로 가나」는
   *   이 함수가 맡는다. 하나로 다른 하나를 대신할 수 없다.
   *   (통지는 #liveStatus 가 따로 읽으므로, 여기서 초점을 옮겨도 낭독이 겹치지 않는다) */
  function refocusFromDeskBtn() {
    try {
      var next = $("btnPrivacy");
      if (next && next.isConnected && typeof next.focus === "function") next.focus();
    } catch (e) { /* 초점 되돌리기는 «거들 뿐» — 실패해도 설치는 그대로 진행된다 */ }
  }

  function hideBtn() {
    var b = $("btnDeskIcon");
    if (b) {
      /* ⚠ «감추기 전»에 물어야 한다 — .hidden(display:none) 이 되는 순간 브라우저가
         초점을 <body> 로 옮겨 버려, 뒤에 물으면 언제나 거짓이 된다. */
      var hadFocus = (document.activeElement === b);
      b.classList.add("hidden");
      if (hadFocus) refocusFromDeskBtn();
    }
    wantBtn = false;
  }

  /* 설치 창을 띄우고 결과를 처리한다. 배너·푸터 단추가 «같은» 이 함수를 쓴다.
   * ★ deferred 는 «한 번 쓰면 소모»된다(prompt() 는 한 사건당 한 번). 그래서
   *   부르는 즉시 null 로 비우고 단추도 감춘다 — 남겨 두면 두 번째 클릭이
   *   아무 일도 하지 않는 «막다른 길»이 된다(가장 흔한 함정).
   *   브라우저가 다시 beforeinstallprompt 를 보내면(대개 새로고침 뒤) 그때 되살아난다.
   * @param fromBanner 배너에서 불렀는가 — 배너에서만 「다시 보지 않기」를 남긴다. */
  function runPrompt(fromBanner) {
    var d = deferred;
    deferred = null;
    hide();
    hideBtn();
    if (!d) return false;

    d.prompt();
    if (d.userChoice && d.userChoice.then) {
      d.userChoice.then(function (res) {
        if (fromBanner) remember();   // 배너는 결과와 무관하게 «권하기»를 끝낸다(다그치지 않음)
        var accepted = res && res.outcome === "accepted";
        if (accepted) {
          // 실제 완료 통지는 appinstalled 에서 한 번 더 간다. 여기서는 «접수됐다»만 알린다.
          say("설치를 시작했습니다.");
        } else {
          // 이용자가 취소했다 — 다그치지 않는다. 다만 단추가 조용히 사라진 것은 알려 준다
          // (화면낭독기 이용자가 «단추를 잃어버렸다»고 느끼지 않게 하려는 것 · KWCAG 2.2 상태 변화 통지).
          say("설치를 취소했습니다. 다시 설치하려면 화면을 새로고침한 뒤 「바탕화면 아이콘 설치」를 다시 눌러 주세요.");
        }
      });
    } else if (fromBanner) {
      remember();
    }
    return true;
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    // 브라우저 기본 설치 배너를 미루고, 우리 안내로 대신한다
    e.preventDefault();
    deferred = e;
    if (installedAlready()) return;
    // 푸터 단추는 «다시 보지 않기»와 무관하게 되살린다(설치할 길을 늘 남겨 둔다)
    showBtn();
    if (dismissed()) return;
    var b = $("a2hsBanner");
    if (b) b.hidden = false;
  });

  window.addEventListener("appinstalled", function () {
    deferred = null;
    remember();
    hide();
    hideBtn();
    say("설치했습니다. 이제 바탕화면(또는 홈 화면)의 「상주정책(공무원용)」 아이콘으로 바로 열 수 있습니다.");
  });

  document.addEventListener("DOMContentLoaded", function () {
    var btn = $("a2hsInstall"), close = $("a2hsClose"), desk = $("btnDeskIcon");

    if (btn) btn.addEventListener("click", function () { runPrompt(true); });
    if (close) close.addEventListener("click", function () { remember(); hide(); });

    if (desk) {
      desk.addEventListener("click", function () {
        // deferred 가 없으면 애초에 이 단추가 보이지 않는다. 그래도 «보였는데 소모된» 틈이
        // 있을 수 있으므로, 아무 일도 안 하고 끝내지 않고 감춘 뒤 이유를 알린다.
        if (!runPrompt(false)) {
          say("지금은 설치할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
        }
      });
      if (wantBtn) showBtn();   // beforeinstallprompt 가 DOM 보다 먼저 왔던 경우
    }
  });
})();
