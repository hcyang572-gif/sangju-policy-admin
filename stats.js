/* 상주정책(공무원용) — 「이달의 접수」 도넛 채우기
 * ────────────────────────────────────────────────────────────────
 * 확정 디자인 시안 A 의 도넛(승인·심사중·접수·반려 + 가운데 합계 + 건수·비율·모양 범례)을
 * 실제 «신청사업 현황» 화면의 현황 자리에 옮긴 것이다.
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
  /* 조각 색과 «모양»(범례)의 짝 — 색만으로 알리지 않기 위해 모양도 함께 쓴다(style.css .dn-mk).

     ★★ ORDER 의 «차례»는 곧 도넛을 도는 차례다 (A-04 2차 · 2026-08-24) ★★★★★★★★★★★★★
     ⛔ 함부로 바꾸지 마세요. 이 차례는 «붉은 계열 둘이 맞닿지 않게» 고른 것입니다.
        상태색을 KPI 카드와 통일하면서 접수 #B84A1C(주홍)와 반려 #A52714(붉은색)가
        생겼는데, 이 둘이 이웃하면 경계가 흐려집니다.
        예전 차례 [승인·심사중·접수·반려] 는 «접수 다음이 반려»라 한가운데서 맞닿았습니다.
        지금 차례 [승인·접수·심사중·반려] 의 네 경계는 이렇습니다 —
          승인(초록)↔접수(주홍) · 접수(주홍)↔심사중(갈금) · 심사중(갈금)↔반려(붉은) ·
          반려(붉은)↔승인(초록, «고리가 이어지는 자리»)
        ⚠ 고리라서 «마지막 조각과 첫 조각도 이웃»입니다 — 차례를 손볼 때 그 한 쌍을 잊지 마세요.
           (제안받은 [접수·승인·심사중·반려] 는 반려 다음이 다시 접수라 붉은 둘이 맞닿습니다)
     ⚠ index.html 의 범례 <li> 차례·aLgN1~4 아이디도 «이 차례»와 같아야 합니다.
        조각과 범례는 아래 for 문에서 «같은 k» 로 짝지어집니다.
     ⚠ 모양(원·각진 사각·둥근 사각·마름모)은 상태에 붙박이입니다 — 차례가 바뀌어도
        「승인은 원」 그대로여야 합니다. 그래서 범례 표식 클래스는 순번(m1)이 아니라
        상태 이름(k-ok·k-recv·k-rev·k-no)으로 되어 있습니다. */
  var ORDER = ["승인", "접수", "심사중", "반려"];
  var SHAPE = { "승인": "원", "접수": "각진 사각", "심사중": "둥근 사각", "반려": "마름모" };

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

  /* 지난달(전월) 인지 — 1월이면 «작년 12월»로 넘어간다 */
  function isPrevMonth(v) {
    if (!v) return false;
    var d = new Date(v);
    if (isNaN(d)) return false;
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth() - 1;
    if (m < 0) { m = 11; y -= 1; }
    return d.getFullYear() === y && d.getMonth() === m;
  }

  function isToday(v) {
    if (!v) return false;
    var d = new Date(v);
    if (isNaN(d)) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  }

  /* ── 📌 「오늘 처리」 의 뜻 — 숫자가 틀리면 신뢰를 잃으므로 기준을 못 박는다 ──────────
     오늘  = 기기 현지 시각(대한민국 = KST) «자정 0시 00분부터 지금까지». 24시간 전이 아니다.
             created_at·updated_at 은 UTC 로 오지만 new Date() 가 현지 시각으로 바꿔 주므로,
             위 isToday() 의 연·월·일 비교가 곧 «오늘 자정~지금» 이 된다.
     처리   = 접수된 뒤 담당자가 «실제로 저장을 눌러» 바뀐 건.
             applications.updated_at 은 서버 트리거(set_updated_at)가 UPDATE 마다 갱신한다
             (supabase/applications.sql (가)). 지어낸 수가 아니다.
     ⚠ 새로 들어온 신청은 INSERT 순간 updated_at 이 created_at 과 «같은 값»이다.
        그것까지 세면 「접수만 됐는데 처리했다」고 거짓말을 하게 된다 →
        두 시각의 차이가 1초를 넘을 때만 «손댄 것»으로 센다.
     ⚠ 이 수는 «부서 전체»가 오늘 처리한 건수다(누가 했는지는 세지 않는다 · 개인정보 아님).
        완료 체크의 「오늘 N번째」는 «이 브라우저»가 센 값이라 둘은 다를 수 있고, 그것이 정상이다. */
  function isHandledToday(r) {
    if (!r || !r.updated_at) return false;
    if (!isToday(r.updated_at)) return false;
    var u = new Date(r.updated_at);
    if (isNaN(u)) return false;
    var c = new Date(r.created_at || 0);
    if (!isNaN(c) && (u.getTime() - c.getTime()) < 1000) return false;   // 접수 직후 값 = 아직 안 손댐
    return true;
  }

  /* ── 🔎 요약 카드 «네 칸»의 뜻 — 세는 곳도, 목록을 좁히는 곳도 여기 하나뿐 ──────────
     양호창님 지시(2026-08-19): 「오늘 접수 / 심사중 / 이달 승인 / 이달 반려」를 누르면
     그 건만 목록에 남는다. 그러려면 «카드가 센 기준»과 «목록이 거르는 기준»이 같아야 한다.
     ⚠ app.js 는 이 window.sjScopes 를 그대로 가져다 쓴다 — 판정을 저쪽에 베껴 쓰지 말 것.
        (베끼면 언젠가 한쪽만 고쳐져 «3건이라 해 놓고 2건만 나오는» 앱이 된다)
     test(r) 는 접수 한 줄을 받아 그 칸에 드는지만 답한다. 개인정보는 보지 않는다
     (status·created_at 두 칸만 읽는다). */
  var SCOPES = {
    today: {
      label: "오늘 접수", note: "오늘 들어온 접수만 보는 중입니다",
      empty: "오늘 들어온 접수가 없습니다.",
      test: function (r) { return isToday(r && r.created_at); }
    },
    review: {
      label: "심사중", note: "심사중인 접수만 보는 중입니다",
      empty: "심사중인 접수가 없습니다.",
      test: function (r) { return ((r && r.status) || "접수") === "심사중"; }
    },
    okM: {
      label: "이달 승인", note: "이달 승인한 접수만 보는 중입니다",
      empty: "이달 승인한 접수가 없습니다.",
      test: function (r) { return isThisMonth(r && r.created_at) && ((r && r.status) || "접수") === "승인"; }
    },
    noM: {
      label: "이달 반려", note: "이달 반려한 접수만 보는 중입니다",
      empty: "이달 반려한 접수가 없습니다.",
      test: function (r) { return isThisMonth(r && r.created_at) && ((r && r.status) || "접수") === "반려"; }
    }
  };
  window.sjScopes = SCOPES;

  /* 요약 지표 — 규격서 §14 «숫자 카운트업».
     app.js 의 countUp(window.sjCountUp) 이 최종값을 «먼저» 보조기기용 칸(.kpi-sr)에 넣고,
     눈에 보이는 칸(.kpi-vis, aria-hidden)만 0 → 실제값으로 흐르게 한다.
     ⚠ 값이 그대로면 아무 움직임도 없다(다시 그릴 때마다 껌뻑이지 않게).
     ⚠ app.js 가 아직 안 올라왔거나 옛 마크업이면 그냥 글자만 바꾼다(안전 폴백). */
  function setNum(id, n) {
    var e = $(id);
    if (!e) return;
    /* ⛔ 2026-08-21 — 카드가 «단추»이던 시절 aria-label 을 갈아 끼우던 대목은 삭제했습니다.
       지금 카드는 <div> 라, 낭독기는 안쪽 글자(.kpi-sr 의 숫자 + 라벨)를 그대로 읽습니다. */
    if (typeof window.sjCountUp === "function" && e.querySelector(".kpi-vis")) { window.sjCountUp(e, n); return; }
    e.textContent = String(n);
  }

  /* ── 📈 도넛 옆 요약 카드 — 「접수 많은 사업」·「담당팀별 접수」 ─────────────────
     ⚠ 없는 수치를 지어내지 않는다. 이미 들어와 있는 접수 목록(AALL)에서 «세기»만 한다.
     ⚠ 개인정보는 만지지 않는다 — 사업명(benefit_name)·담당팀(team) 두 칸만 본다.
     기간은 «전체»다(도넛은 이달 기준). 그래서 카드마다 «전체 기간»임을 글로 밝혀 둔다.
     ⚠ 밝히는 말은 카드마다 조금 다르다 — 순위 카드 둘은 「전체 접수 N건」,
        읍·면·동 카드는 좁은 화면에서 제목이 3줄이 되어 「총 N건」으로 줄였다(아래 renderRegions). */

  /* 🏢 집계용 담당팀 — «지금» 담당팀으로 센다 (2026-08-25 · 🟢곳간 원인분석)
     ① 사업명으로 찾은 지금 담당팀(data.json programs) → ② 접수의 team 스냅샷 → ③ 미지정
     ⚠ ②(폴백)를 빼면 «멀쩡한 접수»가 새로 미지정이 된다 — 사업명이 바뀐 뒤 접수에만 옛 이름이
        남은 경우(「출산축하 해피박스 지원」 2건)가 실제로 그렇다.
     ⚠ 이 순위표의 용도는 「지금 어느 팀에 일이 몰려 있나」다. 접수 당시 팀으로 세면
        폐지된 팀 이름이 순위에 오르고, 한 팀이 표기 차이로 여러 줄로 갈라진다.
     ⛔ 접수 «상세보기»의 담당팀은 스냅샷 그대로 둔다(app.js) — 여기는 집계뿐이다. */
  function teamForRank(r) {
    var api = window.sjBenefits;
    var cur = "";
    try { if (api && api.ready && typeof api.teamOf === "function") cur = api.teamOf(r && r.benefit_name); }
    catch (e) { cur = ""; }
    if (cur) return cur;
    var snap = (r && r.team != null) ? String(r.team).trim() : "";
    return snap || "담당팀 미지정";
  }

  // 한 칸을 기준으로 묶어 센 뒤 «많은 순 → 이름 순»으로 늘어놓는다
  // key 는 «칸 이름»이거나 «행 하나를 받아 묶음 이름을 돌려주는 함수»다.
  function tally(all, key, blank) {
    var map = Object.create(null), names = [];
    var fn = (typeof key === "function") ? key : null;
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var k = fn ? String(fn(r) || "").trim()
                 : ((r && r[key] != null) ? String(r[key]).trim() : "");
      if (!k) k = blank;
      if (!(k in map)) { map[k] = 0; names.push(k); }
      map[k] += 1;
    }
    var arr = [];
    for (var j = 0; j < names.length; j++) arr.push({ name: names[j], n: map[names[j]] });
    arr.sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return a.name.localeCompare(b.name, "ko");
    });
    return arr;
  }

  // 좁은 화면에서는 3줄만(요약이 목록보다 길어지지 않게), 넓으면 5줄
  function topCount() {
    try { return window.matchMedia("(min-width:900px)").matches ? 5 : 3; } catch (e) { return 5; }
  }

  // unit = 무엇을 묶었는지(사업/담당팀), cw = 그 셈숱말(개/곳)
  function renderRank(listId, subId, items, total, unit, cw) {
    var ul = $(listId), sub = $(subId);
    if (!ul) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);

    if (sub) {
      sub.textContent = items.length
        ? ("전체 접수 " + total + "건 · " + unit + " " + items.length + cw)
        : "";
    }
    if (!items.length) {
      var e0 = document.createElement("li");
      e0.className = "rank-empty";
      e0.textContent = "아직 접수가 없습니다.";
      ul.appendChild(e0);
      return;
    }

    var show = Math.min(topCount(), items.length);
    if (sub && items.length > show) sub.textContent += " 중 상위 " + show;
    var max = items[0].n || 1;

    for (var i = 0; i < show; i++) {
      var it = items[i];
      var pct = total ? Math.round((it.n / total) * 100) : 0;

      var li = document.createElement("li");
      /* 🥇 1위 한 줄만 카드의 강조색으로 채운다(A-04 · 색 규칙은 style.css .rank-bar 한 곳).
         ⚠ 0건이면 «1위»가 아니다 — 아무도 신청하지 않은 사업을 색으로 세우면 거짓말이 된다.
         ⚠ 색은 «덤»이다. 순위는 이미 «위에서부터»라는 자리와 건수 글자가 말하고 있다. */
      if (i === 0 && it.n > 0) li.className = "rank-top";
      var nm = document.createElement("span");
      nm.className = "rank-nm";
      nm.textContent = it.name;
      /* 이름은 좁은 칸에서 «두 줄»에서 말줄임된다(style.css .rank-nm · 규격서 §16).
         전체 이름을 잃지 않도록 툴팁으로 남긴다 — 아래 접수 목록에도 온전히 있다.
         ⚠ title 은 «같은 글자»라 낭독기에 중복으로 읽히지 않는다(내용 = 접근명). */
      nm.title = it.name;
      var b = document.createElement("b");
      b.className = "rank-n";
      b.textContent = it.n + "건";
      var em = document.createElement("em");
      em.className = "rank-p";
      em.textContent = pct + "%";
      // 막대는 «곁들이는 그림»일 뿐 — 위 세 칸이 같은 정보를 글자로 이미 담고 있다
      var bar = document.createElement("span");
      bar.className = "rank-bar";
      bar.setAttribute("aria-hidden", "true");
      var fill = document.createElement("i");
      // ⚠ CSP(style-src 'self')가 style 속성을 막는다 → 반드시 CSSOM 으로 넣는다
      fill.style.width = Math.max(4, Math.round((it.n / max) * 100)) + "%";
      bar.appendChild(fill);

      li.appendChild(nm); li.appendChild(b); li.appendChild(em); li.appendChild(bar);
      ul.appendChild(li);
    }
  }

  /* ── 📍 읍·면·동별 신청 현황 (2026-08-20) ─────────────────────────────────────
     위 「담당팀별 접수」와 «같은 모양»(이름 + 건수 + 비율 + 막대), «같은 한 가지 색».
     ⚠ 세는 규칙을 여기서 «새로 짜지 않는다» — app.js 의 window.sjRegions.countBy() 를 그대로 쓴다.
        그 함수가 파이썬 config.count_by_region() 과 «같은 규칙»을 지키고 있고, 엑셀·한글보고서는
        그 파이썬 함수를 쓴다. 규칙을 이쪽에 베껴 두면 언젠가 화면과 보고서의 숫자가 달라진다.
     ⚠ 순서는 countBy 가 돌려준 «그대로» 그린다. 건수 순으로 다시 정렬하지 말 것 —
        가로축이 달마다 달라지면 지난달과 견줄 수 없다(그것이 이 차트의 목적이다).
     ⚠ 0건인 지역도 그대로 그린다. 다만 막대는 «정말 0» 으로 둔다(4%짜리 가짜 막대를 그리지 않는다).
     ⚠ 25개를 색으로 구분하려 하지 않는다 — 뜻은 «이름과 숫자»가 전한다.
        막대는 곁들이는 그림이라 aria-hidden(담당팀 막대와 같은 규약).
     ═══════════════════════════════════════════════════════════════════════════ */
  function renderRegions(all) {
    var ul = $("aRegionList"), sub = $("aRegionSub");
    var card = (ul && ul.closest) ? ul.closest(".region-card") : null;
    if (!ul) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);

    var api = window.sjRegions;
    if (!api || !api.ready || typeof api.countBy !== "function") {
      // 목록(data.json)을 못 받았을 때 — 이 카드만 조용히 접는다. 업무 화면은 그대로 돈다.
      if (sub) sub.textContent = "";
      if (card) card.hidden = true;
      return;
    }

    var items = api.countBy(all);
    if (!items.length) { if (sub) sub.textContent = ""; if (card) card.hidden = true; return; }
    if (card) card.hidden = false;

    var total = all.length;
    /* max  = 막대 길이의 기준(가장 많은 지역).  ⚠ 「미기재」는 지역이 아니므로 기준에서 뺀다 —
              미기재가 가장 많은 달에 실제 지역 막대가 통째로 짧아져 견주기가 어려워진다.
       hit  = «실제 읍·면·동» 가운데 접수가 있는 곳의 수. 미기재를 여기 세면
              「25곳 중 1곳에서 접수」처럼 사실과 다른 말이 된다(2026-08-20 실측에서 그랬다). */
    var max = 0, hit = 0, unknownN = 0, i;
    for (i = 0; i < items.length; i++) {
      if (items[i].name === api.unknown) { unknownN = items[i].n; continue; }
      if (items[i].n > max) max = items[i].n;
      if (items[i].n > 0) hit += 1;
    }
    if (sub) {
      /* ── 📏 요약 한 줄 — «짧게». 320px 에서 제목이 3줄이 되던 것을 2줄로 (2026-08-25 양호창님) ──
         ⛔ CSS 로 줄이지 않는다. 글자 자체를 줄인다 — 그래야 낭독기가 읽는 말도 함께 짧아진다.
         ⭐ 왜 «조금 길면» 곧바로 3줄이 되나 — .rank-sub 는 display:inline-block «덩어리»라
            제목 줄과 한 줄을 나눠 쓰지 못한다. 요약이 단추 안폭(320px 화면에서 228px)을
            «1px이라도» 넘는 순간 통째로 다음 줄로 내려가고, 그 안에서 다시 두 줄로 갈린다.
            그래서 이 문구의 «고유 폭»은 228px 를 넘지 않아야 한다.
         ✔ 실측 (헤드리스 크롬 · 320px · 단추 안폭 228px)
              종전 「전체 접수 101건 · 읍·면·동 25곳 중 25곳에서 접수 · 미기재 3건」 = 234px → 3줄
              지금 「총 101건 · 25곳 모두 · 미기재 3건」                            = 201px → 2줄
                   「총 101건 · 25곳 중 12곳 · 미기재 3건」                          = 221px → 2줄
         ⚠ 줄인 것은 «되풀이되는 말»뿐이다 — 「읍·면·동」도 「에서 접수」도 카드 제목
            (읍·면·동별 신청 현황)이 이미 말하고 있다. 센 값 넷(전체 건수 · 읍면동 수 ·
            접수가 있는 곳 수 · 미기재 건수)은 하나도 빠지지 않았다.
         ⚠ 「총」은 «전체 기간»이라는 뜻이다 — 도넛(이달 기준)과 다른 기준임을 밝히는 말이라
            반드시 남긴다. 「전체」를 한 글자로 줄인 것일 뿐 뜻은 같다.
         ⛔ 「곳 모두 / 곳 중 N곳」 뒤에 「접수」를 도로 붙이지 마세요 — 232px 가 되어 3줄로 돌아갑니다.
         ⚠ 「25곳 모두」는 «25곳 다 접수가 있다»는 뜻이다. hit 이 regionN 과 같을 때만 쓴다 —
            「25곳 중 25곳」처럼 같은 수를 두 번 적지 않는다. */
      var regionN = items.length - (unknownN ? 1 : 0);
      var parts = ["총 " + total + "건",
                   (hit === regionN ? (regionN + "곳 모두")
                                    : (regionN + "곳 중 " + hit + "곳"))];
      if (unknownN) parts.push("미기재 " + unknownN + "건");
      sub.textContent = parts.join(" · ");
    }

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var pct = total ? Math.round((it.n / total) * 100) : 0;
      var li = document.createElement("li");
      // 0건인 줄과 「미기재」 줄은 «글자»로 이미 구분된다. 클래스는 막대·여백 손질에만 쓴다.
      /* 🥇 rank-top — 접수가 «가장 많은» 읍·면·동 한 줄만 강조색(A-04).
         ⚠ 여기 순서는 «늘 같은 순서»(달마다 견주기 위함)라 첫 줄이 1위가 아니다 → 건수로 고른다.
         ⚠ 「미기재」는 지역이 아니므로 1위가 될 수 없다(max 계산에서도 이미 빠져 있다).
         ⚠ 동점이면 둘 다 세운다 — 한쪽만 고르면 «없는 순위»를 지어내는 셈이다. */
      var isTop = it.n > 0 && it.n === max && it.name !== api.unknown;
      li.className = (it.n ? "" : "rank-zero") + (it.name === api.unknown ? " rank-unknown" : "")
                   + (isTop ? " rank-top" : "");

      var nm = document.createElement("span");
      nm.className = "rank-nm";
      nm.textContent = it.name;
      nm.title = it.name;

      var b = document.createElement("b");
      b.className = "rank-n";
      b.textContent = it.n + "건";

      var em = document.createElement("em");
      em.className = "rank-p";
      em.textContent = pct + "%";

      var bar = document.createElement("span");
      bar.className = "rank-bar";
      bar.setAttribute("aria-hidden", "true");
      var fill = document.createElement("i");
      // CSP(style-src 'self')가 style 속성을 막는다 -> 반드시 CSSOM 으로 넣는다.
      // 0건은 «0%» 로 둔다 — 없는 것을 있는 것처럼 보이게 하지 않는다.
      // ⚠ 「미기재」가 가장 많은 달에는 it.n 이 max 를 넘을 수 있다 → 100% 로 묶는다(칸 밖으로 나가지 않게)
      fill.style.width = (it.n && max)
        ? (Math.min(100, Math.max(3, Math.round((it.n / max) * 100))) + "%")
        : (it.n ? "100%" : "0%");
      bar.appendChild(fill);

      li.appendChild(nm); li.appendChild(b); li.appendChild(em); li.appendChild(bar);
      ul.appendChild(li);
    }
  }

  /* 도넛 아래 두 줄.
     ① 이달 ↔ 지난달 견주기 — 늘고 줆을 «글자»로 적는다.
     ② 「오늘 처리 N건」 — ⚠ 0건이어도 «숨기지 않는다».
        숨기면 담당자가 「고장인가?」 하고 되묻게 된다. 0 은 0 이라고 정직하게 적는다. */
  function renderNote(thisM, prevM, todayDone) {
    var el = $("aStatsNote");
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);

    var d = thisM - prevM;
    var tail = d > 0 ? (d + "건 늘었습니다") : (d < 0 ? (-d + "건 줄었습니다") : "지난달과 같습니다");
    var line1 = document.createElement("span");
    line1.className = "note-line";
    line1.appendChild(document.createTextNode("지난달 " + prevM + "건 · 이달 "));
    var b = document.createElement("b");
    b.textContent = thisM + "건";
    line1.appendChild(b);
    line1.appendChild(document.createTextNode(" — " + tail));
    el.appendChild(line1);

    // ② 오늘 처리 — 기준은 위 isHandledToday() 주석에 못 박아 두었다(자정~지금 · 실제로 손댄 건).
    var line2 = document.createElement("span");
    line2.className = "note-line note-today";
    line2.appendChild(document.createTextNode("오늘 처리 "));
    var b2 = document.createElement("b");
    b2.textContent = todayDone + "건";
    line2.appendChild(b2);
    // 0 건일 때는 «아직»이라는 말을 붙여 «고장»이 아니라 «아직 없음»임을 분명히 한다.
    line2.appendChild(document.createTextNode(todayDone > 0 ? " (오늘 자정부터 지금까지)"
                                                            : " — 오늘은 아직 처리한 접수가 없습니다"));
    el.appendChild(line2);
  }

  function draw() {
    var wrap = $("aSummary"), fig = $("aStats");
    if (!wrap || !fig) return;

    var all = rows();
    if (!all) { wrap.hidden = true; return; }

    // ── 요약 지표 4개 (목업의 «오늘의 접수 요약») ──────────────────
    //    라벨에 기간(오늘/이달/전체)을 함께 적어 «무엇을 센 수인지» 오해가 없게 한다.
    /* ⚠ 세는 자리는 여기 한 곳 — 위 SCOPES 의 test 를 그대로 쓴다.
       app.js 가 목록을 거를 때도 같은 test 를 쓰므로 «숫자 = 목록 건수»가 보장된다. */
    var kn = { today: 0, review: 0, okM: 0, noM: 0 };
    for (var q = 0; q < all.length; q++) {
      var rr = all[q];
      for (var kk in kn) if (SCOPES[kk].test(rr)) kn[kk] += 1;
    }
    setNum("kpiToday", kn.today); setNum("kpiReview", kn.review);
    setNum("kpiOk", kn.okM); setNum("kpiNo", kn.noM);

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

    // 접수가 한 건도 없으면 요약 전체를 숨긴다(0건짜리 도넛은 오히려 헷갈린다)
    if (!all.length) { wrap.hidden = true; return; }
    wrap.hidden = false;

    /* 도넛 옆 요약 카드 두 장 — «전체 접수» 기준. 이달 접수가 0건이어도 그려 둔다
       (도넛만 감추고 옆자리가 비면 예전 결함으로 되돌아간다). */
    renderRank("aTopBizList", "aTopBizSub", tally(all, "benefit_name", "(사업명 없음)"), all.length, "사업", "개");
    renderRank("aTopTeamList", "aTopTeamSub", tally(all, teamForRank, "담당팀 미지정"), all.length, "담당팀", "곳");
    renderRegions(all);          // 📍 읍·면·동별 신청 현황(같은 자리·같은 모양)

    // 이달 ↔ 지난달 견주기 + 오늘 처리 건수
    var prevM = 0, todayDone = 0;
    for (var p = 0; p < all.length; p++) {
      if (isPrevMonth(all[p] && all[p].created_at)) prevM += 1;
      if (isHandledToday(all[p])) todayDone += 1;
    }
    renderNote(total, prevM, todayDone);

    /* 이번 달 접수가 0건이면 «그림(도넛)만» 감추고 카드는 남긴다.
       ★ 2026-08-20 교정 — 예전에는 fig(카드 전체)를 감춰서, 이달 접수가 없는 날에는
         바로 아래 「오늘 처리 N건」 줄까지 통째로 사라졌다. 지난달 접수를 오늘 처리하는 일은
         늘 있으므로, 그 날 「오늘 처리」가 안 보이면 «고장»으로 읽힌다.
         (이 파일 위쪽 주석의 «지표는 두고 도넛만 감춘다» 가 원래 뜻이었다) */
    var wrapEl = fig.querySelector(".donut-wrap");
    fig.hidden = false;
    if (wrapEl) wrapEl.hidden = !total;
    /* ★ 2026-08-24 — 이달 접수가 0건이어도 제목(.stats-cap)은 «감추지 않는다».
       제목 줄이 곧 «접기 단추»가 되었기 때문이다 — 감추면 접었다 펴는 손잡이까지 사라진다.
       (예전에는 제목만 감췄다. 그때도 아래 「오늘 처리 N건」 줄은 남아 있었으므로,
        제목이 없는 채로 글만 떠 있는 것보다 「이달의 접수 0건 · 상태별」이 오히려 분명하다) */
    var totEl0 = $("aStatsTotal");
    if (totEl0) totEl0.textContent = String(total);     // 0건일 때도 «0» 이라고 정직하게 적는다
    if (!total) return;

    /* 가운데 합계 — SVG <text> 는 role="img"(title/desc) 안이라 따로 낭독되지 않는다.
       그래서 여기서는 «보이는 숫자»만 세어 올려도 낭독 정보가 어긋나지 않는다.
       도넛 조각은 style.css 의 transition(.8s)이 시계방향으로 채워 준다. */
    var numEl = $("aStatsNum");        // 제목의 총계(#aStatsTotal)는 위에서 이미 넣었다
    if (numEl) countText(numEl, total);

    // 조각 그리기 — stroke-dasharray 로 «칠할 길이 / 남길 길이», dashoffset 으로 시작 위치
    /* ── 조각 사이 틈 (A-04 · 2026-08-24) ────────────────────────────────────────
       조각 색을 KPI 카드와 «같은 상태색»으로 맞추면서 접수 #B84A1C 와 반려 #A52714 가
       이웃하게 됐다. 둘 다 붉은 계열이라 맞닿으면 경계가 흐리다 →
       칠하는 길이만 GAP 만큼 줄여 그 사이로 트랙(--line, 크림빛)이 비쳐 보이게 한다.
       ⚠ 시작 위치(used)는 «줄이기 전» 길이로 누적한다 — 안 그러면 조각이 조금씩 앞으로 밀려
          한 바퀴를 다 돌지 못한다.
       ⚠ 조각이 하나뿐이면(한 상태만 있는 달) 틈을 두지 않는다 — 다 찬 고리에 난 «흠집»으로 보인다.
       ⚠ 아주 작은 조각(1건)이 틈에 먹혀 «사라지지» 않도록 최소 1.5 는 남긴다. */
    var GAP = 2;                                   // 둘레 339.3 중 2 ≈ 0.6% — 눈에는 «가는 흰 선»
    var filled = 0;
    for (var g = 0; g < ORDER.length; g++) if (cnt[ORDER[g]] > 0) filled += 1;
    var gap = filled > 1 ? GAP : 0;

    var svg = fig.querySelector(".donut");
    var segs = svg ? svg.querySelectorAll(".dn-seg circle") : [];
    var used = 0;                 // 여기까지 칠한 길이(누적)
    var descParts = [];
    for (var k = 0; k < ORDER.length; k++) {
      var name = ORDER[k];
      var n = cnt[name];
      var pct = Math.round((n / total) * 100);
      var len = total ? (C * n) / total : 0;
      var draw = n > 0 ? Math.max(1.5, len - gap) : 0;

      if (segs[k]) {
        segs[k].setAttribute("stroke-dasharray", draw.toFixed(1) + " " + (C - draw).toFixed(1));
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

  // 도넛 가운데 숫자만 0 → 총계로 흐르게 한다(.9s). 저감 모션이면 곧바로 최종값.
  var _numRaf = null, _numShown = null;
  function countText(el, target) {
    if (_numShown === target) return;                  // 같은 값 → 조용히 둔다
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    // 보이지 않는 탭에서는 rAF 가 돌지 않으므로 곧바로 최종값을 넣는다(0 으로 남지 않게)
    if (reduce || !window.requestAnimationFrame || document.visibilityState !== "visible") {
      el.textContent = String(target); _numShown = target; return;
    }
    var from = Number(el.textContent) || 0, t0 = null, DUR = 900;
    if (_numRaf) cancelAnimationFrame(_numRaf);
    var step = function (t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / DUR);
      var e2 = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (target - from) * e2));
      if (k < 1) _numRaf = requestAnimationFrame(step);
      else { _numRaf = null; el.textContent = String(target); }
    };
    _numShown = target;
    _numRaf = requestAnimationFrame(step);
  }

  // 목록 카드가 한 장씩 추가될 때마다 알림이 오므로, 한 프레임에 한 번만 다시 그린다.
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    var run = function () { queued = false; draw(); };
    // ⚠ 보이지 않는 탭에서는 requestAnimationFrame 이 멈춘다 — 그러면 요약·도넛이 영영
    //   갱신되지 않으므로(0 건으로 보임) 그때는 타이머로 돌린다.
    if (window.requestAnimationFrame && document.visibilityState === "visible") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  // app.js 가 목록을 다시 그릴 때마다(불러오기·검색·실시간 반영) 도넛도 따라 갱신한다.
  function watch() {
    var list = document.getElementById("aList");
    if (!list) return;
    try {
      new MutationObserver(schedule).observe(list, { childList: true, subtree: false });
    } catch (e) { /* 아주 오래된 브라우저 — 초기 1회 표시만 하고 넘어간다 */ }
  }

  /* 900px 경계를 넘나들면 순위 카드 줄 수(3 ↔ 5)가 달라진다 → 그때만 다시 그린다.
     (resize 마다 그리면 창을 끌 때 헛일이 잦다) */
  function watchWidth() {
    try {
      var mq = window.matchMedia("(min-width:900px)");
      if (mq.addEventListener) mq.addEventListener("change", schedule);
      else if (mq.addListener) mq.addListener(schedule);
    } catch (e) { /* 아주 오래된 브라우저 — 첫 그림 그대로 둔다 */ }
  }

  /* ── ▾ 접기 «한 벌» (2026-08-24 · 양호창님 지시) ──────────────────────────────
     요약 패널의 네 구역 — 이달의 접수 · 접수 많은 사업 · 담당팀별 접수 · 읍·면·동별 신청 현황.
     ⛔ 구역마다 접기를 따로 만들지 마세요. 여기 한 곳이 넷을 모두 맡습니다.
        다섯 번째 구역이 생겨도 index.html 에 «단추 + .fold-body» 두 줄만 흉내 내면
        이 코드가 알아서 이어 줍니다(선택자가 .fold-btn[aria-controls] 하나뿐이라서).

     ❓ 왜 <details>/<summary> 를 쓰지 않았나 (그랬다면 JS 가 없어도 됐다)
       ① 어차피 JS 가 필요하다 — 「접어 둔 것을 다음에도 접힌 채로」(localStorage) 는
          details 로도 toggle 이벤트를 받아 저장해야 한다. 공짜로 얻는 것은 키보드·펼침상태뿐이다.
       ② 「이달의 접수」는 <figure>+<figcaption> 이다. 그 사이에 <details><summary> 를 끼우면
          그림(도넛)과 그 설명글의 짝이 끊어진다 — 낭독기에서 도넛의 캡션이 사라진다.
       ③ 제목 앞 «색 표식»과 오른쪽 ▾ 표를 브라우저마다 다른 ::marker /
          ::-webkit-details-marker 와 겹치지 않게 다루기가 까다롭다(사파리·크롬이 다르다).
       그래서 단추로 만들되, details 가 공짜로 주던 것을 «손으로 전부» 갖췄다 —
       <button> 이라 Tab·Enter·Space 가 기본으로 동작하고, aria-expanded 로 펼침 상태를 알리며,
       접힌 알맹이는 [hidden] 이라 낭독기·Tab 순서에서도 함께 빠진다.

     ⚠ 다시 그리기(실시간 반영 포함)와 부딪히지 않는다 —
       draw() 는 .fold-body «안쪽»의 <li>·도넛만 갈아 끼울 뿐 .fold-body 의 hidden 을 만지지 않는다.
       (도넛의 .donut-wrap 은 .fold-body «안»에 있어 서로 겹치지 않는다)
       그래서 실시간 신호로 목록이 다시 그려져도 접어 둔 카드는 접힌 채로 남는다.

     ❓ 왜 상태를 기억하나(localStorage) — 공무원은 하루에도 몇 번씩 이 화면을 새로 연다
       (실시간 반영·재로그인·탭 이동). 「읍·면·동은 접어 둔다」고 정한 사람이 그때마다 다시
       접어야 하면 접기 기능이 오히려 짐이 된다. 공용 PC 에서 «남의 설정»이 남을 수는 있으나
       ① 저장된 값이 없으면 «펼침»이 기본이고 ② 접혀 있어도 제목 줄에 요약(전체 접수 N건 · 총 N건 …)이
       그대로 보이며 ③ 접기 단추가 늘 같은 자리에 있어, 잃는 것보다 얻는 것이 큽니다.
     ⚠ 키 이름은 다른 앱과 섞이지 않게 앱 고유 접두사 sangju_admin_ 를 쓴다(app.js 의 다른 키들과 같다). */
  var FOLD_KEY = "sangju_admin_fold";

  function foldRead() {
    try {
      var o = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }        // 못 읽어도 «기본 펼침»은 지킨다
  }
  function foldWrite(map) {
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(map)); } catch (e) { /* 못 기억해도 그만 */ }
  }

  // 한 구역의 펼침/접힘을 «한 곳»에서 맞춘다 — 단추(aria-expanded) · 알맹이(hidden) · 기억.
  function setFold(btn, open, remember) {
    var body = document.getElementById(btn.getAttribute("aria-controls"));
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (body) body.hidden = !open;
    /* ⚠ 접힌 카드가 «옆 카드 높이만큼 늘어나던» 결함 (2026-08-24 실측에서 잡음).
       요약 패널(.sum-row)은 align-items:stretch 라 한 줄에 선 카드들이 «같은 키»가 된다.
       그래서 세 장이 한 줄에 서는 1024px 이상에서 한 장만 접으면, 접힌 카드가 그대로
       287px 짜리 «빈 흰 상자»로 남았다. 접힌 카드만 위로 붙여 제 키만 쓰게 한다.
       ⚠ .fold-body 의 부모가 곧 그 카드다(figure#aStats / section.rank-card) — 네 구역 모두.
       ⚠ :has() 선택자로도 되지만, 켜고 끄는 자리를 이 함수 «한 곳»으로 모으려고 클래스를 쓴다. */
    /* ⚠ .fold-collapsed 는 «요약 카드»(figure#aStats · section.rank-card)에만 쓸모가 있다.
       분야 칩의 .fold-body 부모는 탭 <section> 이라 align-self 가 아무 일도 하지 않지만,
       엉뚱한 곳에 클래스가 붙어 있으면 다음 사람이 «왜 붙었지?» 하고 헤맨다 → 카드일 때만 붙인다. */
    if (body && body.parentElement && /(^|\s)(rank-card|stats-card|region-card)(\s|$)/.test(body.parentElement.className || "")
        || (body && body.parentElement && body.parentElement.tagName === "FIGURE")) {
      if (open) body.parentElement.classList.remove("fold-collapsed");
      else body.parentElement.classList.add("fold-collapsed");
    }
    /* ⭐⭐ 2026-08-25 — 「접었더니 격자에 구멍이 생긴다」 (양호창님 「접기가 이상하게 안 된다」)
       요약 패널(.sum-row)에 «접힌 카드가 하나라도 있는가»를 줄 자체에 표시해 둔다.
       그래야 style.css 가 「접힌 카드는 제 줄을 통째로 쓴다 + 도넛도 남는 자리를 채운다」를
       걸 수 있다(그 블록의 긴 주석 참고).
       ⚠ :has() 대신 클래스를 쓰는 까닭 — 접기 상태를 다루는 자리를 이 함수 «한 곳»으로 모으고,
          :has() 를 모르는 브라우저에서 구멍이 조용히 되살아나지 않게 하기 위해서다.
       ⚠ 어느 카드 하나가 아니라 «줄 전체»를 보고 판단한다 — 넷 중 무엇을 접든 같은 결과가 나온다. */
    syncRowGaps();
    /* ♿ 접는 «순간» 초점이 알맹이 안에 있으면(칩을 Tab 으로 훑다가 접기를 누른 경우 등)
       그 초점이 «사라진 요소»에 남아 body 로 튕긴다 — 키보드 사용자는 화면 맨 처음으로 돌아간다.
       → 접기 단추로 옮겨 준다. 방금 누른 그 단추라 «내가 있던 자리»가 그대로 유지된다.
       ⚠ remember 가 true 일 때(=사람이 눌렀을 때)만 옮긴다. 첫 그림에서 옮기면 초점을 훔친다. */
    if (!open && remember && body && document.activeElement && body.contains(document.activeElement)) {
      try { btn.focus(); } catch (e) { /* 무시 */ }
    }
    if (remember) {
      var map = foldRead();
      // 펼침(기본)은 굳이 적어 두지 않는다 — 저장값이 지저분해지지 않게
      if (open) delete map[body ? body.id : ""]; else map[body ? body.id : ""] = 1;
      foldWrite(map);
    }
  }

  /* 접힌 카드가 하나라도 있으면 요약 줄에 .has-collapsed 를 건다(구멍 막기 · 위 setFold 주석).
     ⚠ 요약 패널이 아직 없거나(hidden) 접기가 없는 화면에서도 조용히 아무 일도 하지 않는다. */
  function syncRowGaps() {
    var row = document.getElementById("aSummary");
    if (!row) return;
    var any = !!row.querySelector(".fold-collapsed");
    if (any) row.classList.add("has-collapsed");
    else row.classList.remove("has-collapsed");
  }

  function initFolds() {
    var btns = document.querySelectorAll(".fold-btn[aria-controls]");
    if (!btns.length) return;
    var saved = foldRead();
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var id = btn.getAttribute("aria-controls");
        /* ★★ 기본은 «모두 펼침» — 저장된 값이 «없으면 예외 없이» 펼친다(2026-08-25 양호창님 확정).
           ⛔ 「자리를 아끼자」며 처음부터 접힌 채로 두지 말 것.
           ★ 기억하는 것은 «사람이 손으로 접은 것»뿐이다 — 펴면 저장값을 지운다(setFold 참조). */
        setFold(btn, !saved[id], false);
        btn.addEventListener("click", function () {
          setFold(btn, btn.getAttribute("aria-expanded") !== "true", true);
        });
      })(btns[i]);
    }
  }

  function start() { initFolds(); watch(); watchWidth(); draw(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
