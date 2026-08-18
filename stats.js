/* 상주정책(공무원용) — 「이달의 접수」 도넛 채우기
 * ────────────────────────────────────────────────────────────────
 * 확정 디자인 시안 A 의 도넛(승인·심사중·접수·반려 + 가운데 합계 + 건수·비율·모양 범례)을
 * 실제 «신청 접수» 화면의 현황 자리에 옮긴 것이다.
 *
 * ⚠ 업무 로직(app.js·apply_client.js)은 «한 줄도» 건드리지 않는다.
 *    이 파일은 app.js 가 이미 불러온 접수 목록(AALL)을 «읽기만» 하고, 다시 그릴 시점은
 *    app.js 가 목록(#aList)을 갈아 끼우는 순간을 MutationObserver 로 «지켜보아» 잡는다.
 *    (app.js 안에 호출을 심으면 그쪽 로직을 고치는 셈이 되므로 일부러 이렇게 했다)
 *
 * ⚠ 개인정보는 읽지 않는다 — 상태값과 접수일시(created_at)만 센다.
 *
 * 데이터 범위: «이번 달»(로컬/KST 기준 1일 00:00 ~ 말일). created_at 은 UTC 라
 *             new Date() 로 현지 시각으로 바꾼 뒤 연·월을 비교한다.
 * 상태값 4종: 접수 / 심사중 / 승인 / 반려 (PC config.APPLICATION_STATUSES 와 동일).
 *             도넛 조각 순서는 시안 A 와 같게 승인 → 심사중 → 접수 → 반려.
 */
(function () {
  "use strict";

  var R = 54;                       // 도넛 반지름(index.html 의 <circle r>)
  var C = 2 * Math.PI * R;          // 둘레 ≈ 339.292
  // 조각 색과 «모양»(범례)의 짝 — 색만으로 알리지 않기 위해 모양도 함께 쓴다(style.css .dn-mk)
  var ORDER = ["승인", "심사중", "접수", "반려"];
  var SHAPE = { "승인": "원", "심사중": "둥근 사각", "접수": "각진 사각", "반려": "마름모" };

  function $(id) { return document.getElementById(id); }

  // app.js 가 최상위 let 으로 선언한 접수 목록. 아직 없거나(로그인 전) 준비 안 됐으면 null.
  function rows() {
    try {
      /* eslint-disable-next-line no-undef */
      return (typeof AALL !== "undefined" && Array.isArray(AALL)) ? AALL : null;
    } catch (e) { return null; }   // 초기화 전(TDZ) 접근 — 조용히 건너뛴다
  }

  function isThisMonth(v) {
    if (!v) return false;
    var d = new Date(v);
    if (isNaN(d)) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  function draw() {
    var fig = $("aStats");
    if (!fig) return;

    var all = rows();
    if (!all) { fig.hidden = true; return; }

    // 이번 달 접수만 상태별로 센다
    var cnt = { "승인": 0, "심사중": 0, "접수": 0, "반려": 0 };
    var total = 0;
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      if (!isThisMonth(r && r.created_at)) continue;
      var st = (r && r.status) || "접수";
      if (!(st in cnt)) continue;          // 알 수 없는 상태값은 세지 않는다
      cnt[st] += 1;
      total += 1;
    }

    // 이번 달 접수가 없으면 «0건짜리 도넛»을 보여 주지 않고 통째로 숨긴다
    if (!total) { fig.hidden = true; return; }
    fig.hidden = false;

    var numEl = $("aStatsNum"), totEl = $("aStatsTotal");
    if (numEl) numEl.textContent = String(total);
    if (totEl) totEl.textContent = String(total);

    // 조각 그리기 — stroke-dasharray 로 «칠할 길이 / 남길 길이», dashoffset 으로 시작 위치
    var svg = fig.querySelector(".donut");
    var segs = svg ? svg.querySelectorAll(".dn-seg circle") : [];
    var used = 0;                 // 여기까지 칠한 길이(누적)
    var descParts = [];
    for (var k = 0; k < ORDER.length; k++) {
      var name = ORDER[k];
      var n = cnt[name];
      var pct = Math.round((n / total) * 100);
      var len = total ? (C * n) / total : 0;

      if (segs[k]) {
        segs[k].setAttribute("stroke-dasharray", len.toFixed(1) + " " + (C - len).toFixed(1));
        segs[k].setAttribute("stroke-dashoffset", (-used).toFixed(1));
      }
      used += len;

      var nEl = $("aLgN" + (k + 1)), pEl = $("aLgP" + (k + 1));
      if (nEl) nEl.textContent = String(n);
      if (pEl) pEl.textContent = pct + "%";
      descParts.push(name + " " + n + "건 " + pct + "퍼센트(" + SHAPE[name] + ")");
    }

    // 낭독기에도 그림과 «같은» 정보를 글로 준다
    var t = $("aStatsT"), d = $("aStatsD");
    var ym = new Date();
    var label = ym.getFullYear() + "년 " + (ym.getMonth() + 1) + "월 접수 " + total + "건 상태별 비중";
    if (t) t.textContent = label;
    if (d) d.textContent = descParts.join(", ") + ".";
  }

  // 목록 카드가 한 장씩 추가될 때마다 알림이 오므로, 한 프레임에 한 번만 다시 그린다.
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    var run = function () { queued = false; draw(); };
    if (window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 16);
  }

  // app.js 가 목록을 다시 그릴 때마다(불러오기·검색·실시간 반영) 도넛도 따라 갱신한다.
  function watch() {
    var list = document.getElementById("aList");
    if (!list) return;
    try {
      new MutationObserver(schedule).observe(list, { childList: true, subtree: false });
    } catch (e) { /* 아주 오래된 브라우저 — 초기 1회 표시만 하고 넘어간다 */ }
  }

  function start() { watch(); draw(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
