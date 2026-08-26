/* ═══════════════════════════════════════════════════════════════════════════
   🩵 reads.js — 「아직 확인하지 않은 신청·제안」 배지의 «기억» 어댑터
   2026-08-26 · 🩵물결(realtime-architect) · 1단계(localStorage)

   ⚠⚠ 이 파일은 «PC앱(webui)·공무원앱(cloudui) 두 앱 공통»입니다 — 시민앱(모바일웹)에는
       «해당 없음»이라 일부러 넣지 않았습니다. 「세 앱 공통」이 아닙니다.
       ⓘ 왜 시민앱에는 없는가 (2026-08-26 확정)
         ① 셀 대상이 없다 — 이 어댑터는 «담당자가 아직 열어 보지 않은 접수·제안»을 셉니다.
            시민은 남의 신청·제안을 처리하지 않으므로 셀 것 자체가 없습니다.
         ② 기억할 사람이 없다 — 저장은 «그 브라우저» 단위인데, 시민앱은 로그인이 없어
            «누구의 읽음인지»를 붙들 자리가 없습니다.
         ③ 더 나은 장치가 이미 있다 — 시민에게 필요한 「새 소식」은 홈 배너
            (localStorage `sangju_seen_programs` → 「새 사업 N건」)가 이미 맡고 있습니다.
       ⛔ 「시민앱에 빠졌다」고 보고 옮겨 넣지 마세요. 빠진 것이 아니라 «안 넣은 것»입니다.
   ⚠⚠ webui/reads.js 와 cloudui/reads.js 는 «글자 단위로 같은 파일»입니다.
       한쪽만 고치지 마세요. 고쳤으면 반대쪽에 그대로 복사하고, 배포 사본
       (cloudui↔sangju-policy-admin)도 함께 맞춥니다.

   ─────────────────────────────────────────────────────────────────────────
   이 파일이 하는 일 — 딱 하나
     배지의 뜻을 「오늘 들어온 건수」에서 「아직 확인하지 않은 건수」로 바꾸려면
     «무엇까지 봤는가»를 어딘가에 적어 두어야 합니다. 그 «어딘가»를 화면에서
     감춰 주는 것이 이 파일입니다. 화면은 여섯 함수만 부르면 되고, 저장이
     브라우저인지 서버인지 알 필요가 없습니다.

   ⭐ 2단계로 갈아끼우는 자리 — 아래 «── Backend ──» 한 덩어리뿐입니다.
     지금은 LocalBackend(localStorage) 가 꽂혀 있습니다. 승인이 나면
     supabase/읽음표시_260826.sql 의 staff_reads + mark_read/set_read_baseline
     을 부르는 CloudBackend 를 같은 모양(get/putMarkRead/putBaseline)으로 만들어
     BACKEND 변수만 바꿔 끼웁니다. 이 파일 «바깥»은 한 글자도 바뀌지 않습니다.
     그래서 저장 «모양»도 지금부터 2단계와 같게 둡니다 → { baseline_at, read_ids }.

   ─────────────────────────────────────────────────────────────────────────
   신규 판정 규칙 (이 세 줄이 전부입니다)
     ① 기준선(baseline_at) 보다 «뒤에» 들어온 건만 신규 후보다.
        - 처음 쓰는 브라우저는 기준선이 «지금» 이라 도입 첫날 배지에 수백이 찍히지 않는다.
          (cloud_sync 의 「첫 바퀴는 기준 시각이 없으므로 없는 것만 추가」와 같은 결)
     ② 그중 read_ids 에 이름이 적힌 건은 «본 것» 이므로 뺀다.
     ③ 시각을 못 읽으면 «신규 아님» 으로 친다 — 없는 배지가 틀린 배지보다 낫다.

   기준선을 «분 단위로 내려» 잡는 까닭  ★ 놓치지 않기 위한 장치
     PC앱 신청 행의 「신청일시」는 'YYYY-MM-DD HH:MM' — «초가 없습니다».
     13:00:30 에 「모두 읽음」을 누르고 13:00:45 에 신청이 들어오면, 그 신청의
     시각은 13:00:00 으로 읽혀 기준선보다 앞서 버립니다 → 배지가 «영영 안 뜹니다».
     그래서 기준선은 그 분의 0초로 내리고(13:00:00), 대신 «그 분에 이미 보고 있던
     건들»의 id 를 read_ids 에 적어 둡니다. 놓치는 쪽(시민이 기다림)보다
     한 건 더 보이는 쪽(눌러 보면 사라짐)이 언제나 낫습니다.

   정리 규칙 — 목록이 무한히 커지지 않게
     · prune(kind, liveIds) : 지금 목록에 «없는» id 는 버린다(=삭제된 건).
       ⛔ liveIds 가 0건이면 아무것도 하지 않습니다. 0건은 «전부 삭제»가 아니라
          거의 언제나 «조회 실패» 입니다(이 저장소의 오래된 규칙).
     · read_ids 상한 2000 — 2단계 표의 CHECK 와 같은 숫자. 넘치면 오래된 것부터 버린다.

   테스트 모드(둘러보기) 규칙  ★ 이 판정은 «화면이 아니라 여기서» 합니다
     · 신청(application) — 배지를 아예 그리지 않습니다. 공무원앱 게스트가 보는
       신청 목록은 demo_applications() 의 «고정 예시» 라, 거기에 「새 신청 3건」을
       붙이면 그냥 거짓말입니다. count() 가 0 을, isNew() 가 false 를 돌려주므로
       화면은 «0건이면 안 그린다» 는 지금 규칙 그대로 두면 됩니다.
     · 제안(proposal) — 진짜 표를 읽으므로 그대로 기억합니다. 다만 저장 칸을
       담당자와 나누지 않도록 scope 를 'guest' 로 따로 씁니다.

   ⛔ 이 파일은 개인정보를 저장하지 않습니다 — «본 건의 id» 와 시각뿐입니다.
      신청자 이름·연락처는 어떤 칸에도 들어가지 않습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ── 상수 ──────────────────────────────────────────────────────────── */
  var PREFIX   = "sangju.reads.v1";  // 저장 칸 이름표. 규칙이 바뀌면 v2 로 올린다.
  var KINDS    = ["application", "proposal"];
  var CAP      = 99;                 // 배지에 찍히는 최대 숫자. 넘으면 "99+".
  var MAX_IDS  = 2000;               // read_ids 상한 — 2단계 표의 CHECK 와 같은 숫자.
  var MINUTE   = 60 * 1000;

  /* 둘러보기(게스트)에게 배지를 그리지 않을 종류.
     ⭐ 정책이 바뀌면 «이 줄 하나만» 고치면 두 앱이 같이 바뀝니다. */
  var GUEST_MUTED_KINDS = ["application"];

  /* ── 자잘한 도구 ──────────────────────────────────────────────────── */
  function normKind(kind) {
    var k = String(kind || "").trim();
    return KINDS.indexOf(k) >= 0 ? k : "";
  }
  function nowMs() { return Date.now(); }
  function minuteFloor(ms) { return Math.floor(ms / MINUTE) * MINUTE; }
  function toIso(ms) { try { return new Date(ms).toISOString(); } catch (e) { return ""; } }

  /* 시각 읽기 — 두 앱이 서로 다른 «모양»으로 시각을 들고 있어서 여기서 흡수한다.
       · 'Z' 나 '+09:00' 이 붙어 있으면  → 그대로 읽는다
       · 'T' 는 있는데 표준시간대가 없으면 → Supabase 가 뺀 것이므로 UTC 로 읽는다
       · 'YYYY-MM-DD HH:MM' (PC앱 「신청일시」) → 이미 KST 로 바뀐 값이므로 지역시간으로 읽는다
     못 읽으면 0 을 돌려주고, 0 은 «신규 아님» 으로 이어진다. */
  function parseTime(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v instanceof Date) { var d = v.getTime(); return isFinite(d) ? d : 0; }
    var s = String(v).trim();
    if (!s) return 0;
    var t;
    if (/(?:Z|[+\-]\d{2}:?\d{2})$/.test(s)) t = Date.parse(s);
    else if (s.indexOf("T") >= 0) t = Date.parse(s + "Z");
    else t = Date.parse(s.replace(" ", "T"));
    return isFinite(t) ? t : 0;
  }

  /* 행에서 id·시각 꺼내기 — 세 앱의 칸 이름이 다르다.
       · PC앱 신청  : _id · 「신청일시」(KST 'YYYY-MM-DD HH:MM')
       · 공무원앱 신청 : id · created_at (UTC)
       · 제안(양쪽)  : id · created_at (UTC)
     ⚠ 새 목록을 붙일 때는 «여기»에 칸 이름을 더하면 됩니다. 화면 쪽에서 따로
       꺼내 넘기지 마세요 — 두 화면이 서로 다르게 꺼내면 배지가 갈립니다. */
  function rowId(r) {
    if (!r || typeof r !== "object") return String(r || "");
    var v = r.id || r._id || r["접수번호"] || r.receipt_no || r.proposal_no || "";
    return String(v || "");
  }
  function rowTime(r) {
    if (!r || typeof r !== "object") return 0;
    return parseTime(r.created_at || r["신청일시"] || r["등록일시"] || r.inserted_at || "");
  }

  /* ── 지금 «누가» 보고 있는가 ──────────────────────────────────────────
     화면이 setContext({ user, guest }) 로 알려 주는 것이 정본입니다.
     알려 주지 않았을 때를 대비해 «둘러보기 띠»(#guestNotice) 로 스스로 살핍니다.
       — 그 띠는 webui·cloudui 둘 다 같은 id 로, 게스트일 때만 .hidden 이 벗겨집니다.
     ★ 화면이 부르는 것을 잊어도 게스트 배지가 새지 않게 하는 안전판입니다. */
  var CTX = { user: "", guest: null };

  function isGuest() {
    if (CTX.guest === true || CTX.guest === false) return CTX.guest;
    try {
      var box = global.document && global.document.getElementById("guestNotice");
      if (box) return !box.classList.contains("hidden");
    } catch (e) { /* document 가 없는 환경(시험용) — 아래로 떨어진다 */ }
    return false;
  }
  function scope() {
    if (isGuest()) return "guest";
    var u = String(CTX.user || "").trim().toLowerCase();
    return u || "local";   // PC앱은 이메일을 화면에 안 넘겨주므로 «이 기기» 한 칸으로 둔다
  }
  function keyOf(kind) { return PREFIX + "|" + scope() + "|" + kind; }

  /* 배지를 그려도 되는 종류인가 — 둘러보기 규칙이 사는 «단 한 곳». */
  function badgeEnabled(kind) {
    var k = normKind(kind);
    if (!k) return false;
    if (isGuest() && GUEST_MUTED_KINDS.indexOf(k) >= 0) return false;
    return true;
  }

  /* ── Backend ─────────────────────────────────────────────────────────
     ⭐⭐ 2단계에서 «이 덩어리만» 갈아 끼웁니다. 세 함수가 계약의 전부입니다.
        get(kind)                 → { baseline_at, read_ids } | null
        putBaseline(kind, ms, ids)→ 기준선을 세우고 남길 id 를 지정
        putMarkRead(kind, id)     → id 하나를 «더한다»(덮어쓰지 않는다)
     ⚠ putMarkRead 가 «더하기» 인 까닭 : 두 탭·두 앱에서 동시에 읽으면 통짜로
       저장하는 쪽이 앞서 읽은 것을 지웁니다. 2단계 SQL 의 mark_read() 가
       jsonb || 로 더하기만 하는 것과 같은 이유입니다. */

  // 저장이 막힌 환경(사생활 보호 창·일부 file:// )에서도 앱이 죽지 않게 하는 대체 칸.
  var MEM = {};
  function lsGet(k) {
    try { var v = global.localStorage.getItem(k); return v === null ? undefined : v; }
    catch (e) { return Object.prototype.hasOwnProperty.call(MEM, k) ? MEM[k] : undefined; }
  }
  function lsSet(k, v) {
    try { global.localStorage.setItem(k, v); }
    catch (e) { MEM[k] = v; }   // 이 세션 동안만 기억한다 — 배지가 조금 덜 정확할 뿐 앱은 산다
  }

  var LocalBackend = {
    name: "local",
    get: function (kind) {
      var raw = lsGet(keyOf(kind));
      if (raw === undefined) return null;
      var o;
      try { o = JSON.parse(raw); } catch (e) { return null; }   // 깨진 칸은 «없는 것»으로
      if (!o || typeof o !== "object") return null;
      var base = parseTime(o.baseline_at);
      if (!base) return null;
      var ids = Array.isArray(o.read_ids) ? o.read_ids.map(String) : [];
      return { baseline_at: base, read_ids: ids };
    },
    putBaseline: function (kind, baselineMs, ids) {
      var arr = trimIds(ids);
      lsSet(keyOf(kind), JSON.stringify({
        baseline_at: toIso(baselineMs),
        read_ids: arr,
        updated_at: toIso(nowMs()),
      }));
      return { baseline_at: baselineMs, read_ids: arr };
    },
    putMarkRead: function (kind, id) {
      var cur = LocalBackend.get(kind);
      if (!cur) cur = { baseline_at: minuteFloor(nowMs()), read_ids: [] };
      if (cur.read_ids.indexOf(id) < 0) cur.read_ids = trimIds(cur.read_ids.concat([id]));
      return LocalBackend.putBaseline(kind, cur.baseline_at, cur.read_ids);
    },
  };

  var BACKEND = LocalBackend;   // ← 2단계에서 여기 한 줄만 CloudBackend 로 바꿉니다.

  function trimIds(ids) {
    var out = [], seen = {};
    (ids || []).forEach(function (x) {
      var s = String(x || "");
      if (!s || seen[s]) return;
      seen[s] = 1; out.push(s);
    });
    // 상한을 넘으면 «오래된 것부터» 버린다. 오래된 건은 어차피 기준선이 덮는다.
    return out.length > MAX_IDS ? out.slice(out.length - MAX_IDS) : out;
  }

  /* ── 메모리 시렁 ──────────────────────────────────────────────────────
     isNew() 는 목록을 그리는 «한 줄마다» 불립니다. 그때마다 저장소를 읽으면
     수백 번 파싱합니다 → load() 가 한 번 읽어 여기에 얹어 둡니다. */
  var CACHE = {};                 // "scope|kind" → { baseline_at, read_ids, set }
  var LISTENERS = [];

  function cacheKey(kind) { return scope() + "|" + kind; }
  function put(kind, st) {
    var set = {};
    st.read_ids.forEach(function (x) { set[x] = 1; });
    CACHE[cacheKey(kind)] = { baseline_at: st.baseline_at, read_ids: st.read_ids, set: set };
    return CACHE[cacheKey(kind)];
  }
  function peek(kind) { return CACHE[cacheKey(kind)] || null; }
  function fire(kind) {
    LISTENERS.slice().forEach(function (fn) {
      try { fn(kind); } catch (e) { /* 듣는 쪽이 넘어져도 저장은 끝났다 */ }
    });
  }

  /* ── 바깥 계약 ────────────────────────────────────────────────────── */
  var API = {
    KINDS: KINDS.slice(),
    CAP: CAP,

    /* 지금 보고 있는 사람을 알려 준다. 로그인·로그아웃 직후 «한 번» 부르면 된다.
         SangjuReads.setContext({ user: "hong@korea.kr", guest: false });
       ⚠ 사람이 바뀌면 시렁을 비운다 — 앞 사람의 읽음이 뒷사람에게 새면 안 된다. */
    setContext: function (ctx) {
      ctx = ctx || {};
      var before = scope();
      if ("user"  in ctx) CTX.user  = String(ctx.user || "");
      if ("guest" in ctx) CTX.guest = (ctx.guest === null ? null : !!ctx.guest);
      if (scope() !== before) CACHE = {};
      return scope();
    },
    scope: scope,
    isGuest: isGuest,
    badgeEnabled: badgeEnabled,

    /* 목록을 그리기 «전에» 한 번. 처음이면 기준선을 «지금(분의 0초)» 으로 세운다. */
    load: async function (kind) {
      var k = normKind(kind);
      if (!k) return { baseline_at: 0, read_ids: [] };
      // 배지를 안 그리는 종류(둘러보기 신청)는 «저장 칸을 만들지도 않는다».
      if (!badgeEnabled(k)) {
        var empty = put(k, { baseline_at: nowMs(), read_ids: [] });
        return { baseline_at: empty.baseline_at, read_ids: [] };
      }
      var st = BACKEND.get(k);
      if (!st) st = BACKEND.putBaseline(k, minuteFloor(nowMs()), []);
      var c = put(k, st);
      return { baseline_at: c.baseline_at, read_ids: c.read_ids.slice() };
    },

    /* 이 한 건이 «아직 확인하지 않은» 것인가. load() 뒤에 쓰는 동기 함수다. */
    isNew: function (kind, id, created_at) {
      var k = normKind(kind);
      if (!k || !badgeEnabled(k)) return false;
      var c = peek(k);
      if (!c) return false;                       // 아직 안 읽어 왔으면 «신규 아님»
      var sid = String(id || "");
      if (sid && c.set[sid]) return false;         // 이미 본 건
      var t = parseTime(created_at);
      if (!t) return false;                        // 시각을 모르면 «신규 아님»
      return t >= c.baseline_at;
    },

    /* 카드를 눌러 상세를 «여는 그 순간» 부른다. 두 번 불러도 탈 없다. */
    markRead: async function (kind, id) {
      var k = normKind(kind);
      var sid = String(id || "");
      if (!k || !sid || !badgeEnabled(k)) return false;
      var c = peek(k);
      if (c && c.set[sid]) return false;           // 이미 적혀 있으면 저장하지 않는다
      var st = BACKEND.putMarkRead(k, sid);
      put(k, st);
      fire(k);
      return true;
    },

    /* 「모두 읽음」. rows 에는 «화면 필터를 걷어낸» 그 종류의 전체 목록을 넘긴다.
       ⚠ 걸러진 목록을 넘기면, 걸러져 안 보이던 건이 잠깐(같은 분 안) 신규로 남는다. */
    markAllRead: async function (kind, rows) {
      var k = normKind(kind);
      if (!k || !badgeEnabled(k)) return false;
      var base = minuteFloor(nowMs());
      var newest = 0;
      (rows || []).forEach(function (r) { var t = rowTime(r); if (t > newest) newest = t; });
      if (newest > base) base = minuteFloor(newest);   // 서버 시계가 앞서 있어도 덮이게
      // 기준선을 «분의 0초» 로 내렸으니, 그 분에 이미 보고 있던 건은 이름으로 못박는다.
      var keep = [];
      (rows || []).forEach(function (r) {
        if (rowTime(r) >= base) { var i = rowId(r); if (i) keep.push(i); }
      });
      var st = BACKEND.putBaseline(k, base, keep);
      put(k, st);
      fire(k);
      return true;
    },

    /* 지금 목록에 «없는» id 를 버린다. 목록을 새로 받아올 때마다 부르면 된다.
       ⛔ liveIds 가 0건이면 아무것도 하지 않는다 — 0건은 «전부 삭제»가 아니다. */
    prune: async function (kind, liveIds) {
      var k = normKind(kind);
      if (!k || !badgeEnabled(k)) return false;
      var live = (liveIds || []).map(function (x) {
        return typeof x === "object" ? rowId(x) : String(x || "");
      }).filter(Boolean);
      if (!live.length) return false;
      var c = peek(k) || put(k, BACKEND.get(k) || BACKEND.putBaseline(k, minuteFloor(nowMs()), []));
      var set = {};
      live.forEach(function (x) { set[x] = 1; });
      var kept = c.read_ids.filter(function (x) { return !!set[x]; });
      if (kept.length === c.read_ids.length) return false;   // 바뀐 게 없으면 저장도 안 한다
      var st = BACKEND.putBaseline(k, c.baseline_at, kept);
      put(k, st);
      fire(k);
      return true;
    },

    /* 배지에 찍을 «진짜» 건수. 둘러보기 신청이면 언제나 0 이다. */
    count: function (kind, rows) {
      var k = normKind(kind);
      if (!k || !badgeEnabled(k)) return 0;
      var n = 0;
      (rows || []).forEach(function (r) {
        if (API.isNew(k, rowId(r), rowTime(r))) n++;
      });
      return n;
    },

    /* 배지에 «찍을 글자». 0 이면 빈 글자(=그리지 않는다), 99 를 넘으면 "99+".
       ⭐ 상한 규칙이 두 앱에 흩어지지 않게 여기 한 곳에만 둔다. */
    badgeText: function (kind, rows) {
      var n = Array.isArray(rows) ? API.count(kind, rows) : Number(rows) || 0;
      if (n <= 0) return "";
      return n > CAP ? CAP + "+" : String(n);
    },

    /* 다른 탭·다른 창에서 읽음이 바뀌었을 때 다시 그리라고 알려 준다.
       ⭐ 2단계에서 «서버가 알려 주는» 자리도 여기로 들어옵니다(화면은 안 바뀝니다). */
    subscribe: function (fn) {
      if (typeof fn !== "function") return function () {};
      LISTENERS.push(fn);
      return function () {
        var i = LISTENERS.indexOf(fn);
        if (i >= 0) LISTENERS.splice(i, 1);
      };
    },

    // 시험·점검용 — 화면에서는 쓰지 않는다.
    _peek: peek,
    _parseTime: parseTime,
    _rowId: rowId,
    _rowTime: rowTime,
    _backend: function () { return BACKEND.name; },
  };

  /* 같은 브라우저의 «다른 탭»이 읽음을 적으면 시렁을 버리고 다시 읽게 한다.
     실패해도 앱은 그대로 산다 — 다음에 목록을 새로 받을 때 맞춰진다. */
  try {
    if (global.addEventListener) {
      global.addEventListener("storage", function (ev) {
        if (!ev || !ev.key || ev.key.indexOf(PREFIX + "|") !== 0) return;
        var k = ev.key.split("|").pop();
        if (!normKind(k)) return;
        delete CACHE[cacheKey(k)];
        fire(k);
      });
    }
  } catch (e) { console.warn("[읽음] 탭 사이 동기화를 켜지 못했습니다:", e && e.message); }

  global.SangjuReads = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;   // 시험용
})(typeof window !== "undefined" ? window : globalThis);
