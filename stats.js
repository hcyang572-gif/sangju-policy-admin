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
    /* 낭독기에는 「오늘 접수 3건, 누르면 해당 접수만 봅니다」로 읽힌다.
       ⚠ 단추에 aria-label 이 걸리면 그 «이름»이 안쪽 글자보다 앞선다 → 건수를 여기 담는다. */
    var btn = (e.closest ? e.closest("button.kpi[data-scope]") : null);
    if (btn) {
      var sd = SCOPES[btn.getAttribute("data-scope")];
      if (sd) btn.setAttribute("aria-label", sd.label + " " + n + "건, 누르면 해당 접수만 봅니다");
    }
    if (typeof window.sjCountUp === "function" && e.querySelector(".kpi-vis")) { window.sjCountUp(e, n); return; }
    e.textContent = String(n);
  }

  /* ── 📈 도넛 옆 요약 카드 — 「접수 많은 사업」·「담당팀별 접수」 ─────────────────
     ⚠ 없는 수치를 지어내지 않는다. 이미 들어와 있는 접수 목록(AALL)에서 «세기»만 한다.
     ⚠ 개인정보는 만지지 않는다 — 사업명(benefit_name)·담당팀(team) 두 칸만 본다.
     기간은 «전체»다(도넛은 이달 기준). 그래서 카드마다 «전체 접수 N건»을 글로 밝혀 둔다. */

  // 한 칸을 기준으로 묶어 센 뒤 «많은 순 → 이름 순»으로 늘어놓는다
  function tally(all, key, blank) {
    var map = Object.create(null), names = [];
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var k = (r && r[key] != null) ? String(r[key]).trim() : "";
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
      // «무엇을 센 수인지» 를 글로 밝힌다 — 도넛(이달)과 달리 이 카드는 «전체 접수» 기준이다.
      var regionN = items.length - (unknownN ? 1 : 0);
      var parts = ["전체 접수 " + total + "건",
                   "읍·면·동 " + regionN + "곳 중 " + hit + "곳에서 접수"];
      if (unknownN) parts.push("미기재 " + unknownN + "건");
      sub.textContent = parts.join(" · ");
    }

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var pct = total ? Math.round((it.n / total) * 100) : 0;
      var li = document.createElement("li");
      // 0건인 줄과 「미기재」 줄은 «글자»로 이미 구분된다. 클래스는 막대·여백 손질에만 쓴다.
      li.className = (it.n ? "" : "rank-zero") + (it.name === api.unknown ? " rank-unknown" : "");

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
    renderRank("aTopTeamList", "aTopTeamSub", tally(all, "team", "담당팀 미지정"), all.length, "담당팀", "곳");
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
    var capEl = fig.querySelector(".stats-cap");
    if (capEl) capEl.hidden = !total;
    if (!total) return;

    /* 가운데 합계 — SVG <text> 는 role="img"(title/desc) 안이라 따로 낭독되지 않는다.
       그래서 여기서는 «보이는 숫자»만 세어 올려도 낭독 정보가 어긋나지 않는다.
       도넛 조각은 style.css 의 transition(.8s)이 시계방향으로 채워 준다. */
    var numEl = $("aStatsNum"), totEl = $("aStatsTotal");
    if (totEl) totEl.textContent = String(total);
    if (numEl) countText(numEl, total);

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

  function start() { watch(); watchWidth(); draw(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
