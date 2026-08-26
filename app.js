// 상주시 정책 플랫폼 — 클라우드(Supabase) 사업 관리
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// 📎 서식 스토리지 공용 헬퍼(forms.js)가 같은 클라이언트를 쓰도록 넘겨준다(중복 생성 방지).
if (window.SangjuForms) SangjuForms.useClient(sb);
// 📥 신청 접수 공용 헬퍼(apply_client.js)도 같은 클라이언트를 쓰도록 넘겨준다.
if (window.SangjuApply) SangjuApply.useClient(sb);
const $ = (s) => document.querySelector(s);

// ⚠ sortKey 기본값 "default" — 시민앱 C-11 과 «같은 값»이다(A-11 · 2026-08-24).
//    예전 값은 "seq" 였다. 어디에서도 문자열 "seq" 를 비교하지 않고 «else 기본»으로만
//    쓰이던 값이라, 이름만 맞췄을 뿐 정렬 동작은 한 줄도 바뀌지 않았다.
let ALL = [], CATS = [], SELCATS = new Set(), sortKey = "default", page = 0;
const PAGE = 12;
/* 🧪 «로그인 없이 둘러보기»(IS_GUEST)는 2026-08-25 에 «되살아났습니다».
   ⚠ 예전 이 자리에는 「2026-08-04 영구 제거 — 되살리지 마세요」 라고 적혀 있었으나,
      코드와 어긋난 주석이었습니다(선언은 1300행 부근에 살아 있습니다).
      지금 규약은 이렇습니다 —
        · 스위치는 config.js 의 TEST_MODE_ALLOW_GUEST «한 곳»뿐이다(기본 꺼짐).
        · 게스트는 시민 개인정보(applications)를 «읽지 않는다» — demo_applications() 예시만 본다.
        · 쓰기는 화면(paintGuestLocks)·헬퍼(installGuestReadOnlyGuard)·서버(RLS) 세 겹으로 막는다.
      자세한 사연은 아래 「🧪 테스트 모드」 덩어리 머리말에 있습니다. */
let LOGGING_OUT = false;   // 로그아웃 진행 중(onAuthStateChange 중복 처리 방지)
/* 🔁 showApp() 재진입 방어 (B-7 · 2026-08-25)
   getSession() 이 늦게 풀리는 동안 로그인이 성공하면 진입 관문과 login() 이 «둘 다»
   showApp() 을 불러, addEventListener 가 겹치고 실시간 채널 3개가 중복 구독된다
   (알림 띠가 한 건에 2씩 오르던 증상). bindRtRecovery() 의 _rtRecoveryBound 와 같은 규약.
   ⚠ 로그아웃·「로그인 화면으로」는 location.reload() 라 이 값이 저절로 false 로 돌아온다. */
let APP_STARTED = false;
// 🔑 비밀번호 변경 진행 중. 이 동안에는 «본인 확인용 재로그인»과 «비밀번호 저장» 때문에
//    세션이 잠깐 갈릴 수 있어, 세션 만료 안내(showSessionExpired)가 끼어들지 않도록 막는다.
//    (LOGGING_OUT 과 같은 자리에서 선언 — onAuthStateChange 콜백이 먼저 실행돼도 TDZ 오류가 없도록)
let PW_CHANGING = false;

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
// HTML 로 꽂기 전에 반드시 거치는 이스케이프.
// ⚠ 홑따옴표(')도 함께 막는다 — 지금은 모든 속성을 쌍따옴표로 감싸지만, 나중에 누가
//    한 곳이라도 title='…' 처럼 쓰면 시민이 적은 이름·문의로 속성을 빠져나갈 수 있다.
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
/* 링크로 쓸 수 있는 주소인지 — http(s) 와 같은 출처 상대경로만 통과시킨다.
   왜: 서식 목록의 href 는 DB(benefit_forms.public_url)에서 온 값이다. 그 값이
   "javascript:…" 로 바뀌면 «로그인 세션을 가진 공무원 화면»에서 그대로 실행된다.
   통과하지 못하면 링크 대신 «글자»로만 보여 준다(파일명은 그대로 읽힌다). */
function safeHref(u) {
  const s = String(u == null ? "" : u).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[./]/.test(s) && !/^\/\//.test(s)) return s;   // 같은 출처 상대경로
  return "";
}
function el(t, c) { const e = document.createElement(t); if (c) e.className = c; return e; }

/* ── 담당팀 색 구분 (시민앱과 동일 팔레트·해시 → 같은 팀 = 양앱 같은 색) ──
   팀명을 결정적 해시로 팔레트에 매핑. 연한 배경+진한 글자(대비 4.5:1↑).
   null이면 색 미지정(기존 중립 배지 유지). 팀 수>14면 색 겹침 가능. */
const TEAM_PALETTE = [
  { bg: '#E8F0FE', fg: '#1A4480' }, { bg: '#E6F4EA', fg: '#1E6B33' }, { bg: '#FCE8E6', fg: '#A52714' },
  { bg: '#FEF7E0', fg: '#7A5900' }, { bg: '#F3E8FD', fg: '#6A1B9A' }, { bg: '#E0F7FA', fg: '#00695C' },
  { bg: '#FCE4EC', fg: '#AD1457' }, { bg: '#EFEBE9', fg: '#4E342E' }, { bg: '#E8EAF6', fg: '#283593' },
  { bg: '#F1F8E9', fg: '#33691E' }, { bg: '#FFF3E0', fg: '#B33C00' }, { bg: '#ECEFF1', fg: '#37474F' },
  { bg: '#E0F2F1', fg: '#00796B' }, { bg: '#FFEBEE', fg: '#C2185B' }
];
function teamColor(name) {
  const s = (name || '').trim();
  if (!s || s === '담당팀 확인 필요' || s === '-') return null;
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return TEAM_PALETTE[h % TEAM_PALETTE.length];
}

/* ── 📌 고정 헤더 높이 재기 (★ 2026-08-24) ─────────────────────────────
   헤더(.topdock)가 position:sticky 로 화면 맨 위에 «얹혀» 있으므로, 그 아래로
   파고드는 것들(목록 머리행 .list-head 의 sticky, 건너뛰기 링크의 scroll-margin)이
   헤더 높이를 알아야 한다. 그 값을 CSS 변수 --topdock-h 로 알려 준다.

   왜 CSS 에 숫자를 박지 않았나 — 헤더 높이는 «고정»이 아니다.
     · 노치 기기 안전영역(env(safe-area-inset-top))이 더해진다
     · 브라우저·OS 글자 확대(rem 기준)로 커진다
     · 좁은 폰에서 배지(공무원용)가 제목 아랫줄로 접히면 한 줄이 늘어난다
   시민앱(모바일웹)에서 «58px 고정»으로 뒀다가 폰에서 검색창이 헤더에 물린 사고가 있었다.
   같은 실수를 되풀이하지 않으려고 처음부터 «재서» 쓴다.
   ⚠ 재는 값(offsetHeight)에는 안전영역 padding 이 «이미 들어 있다» → 여기서 다시 더하지 말 것.
   ⚠ ResizeObserver 가 없는 구형 브라우저는 최초 1회 + 창 크기 변경 때만 갱신한다(그래도 충분). */
function syncTopdockH() {
  const dock = document.querySelector(".topdock");
  if (!dock) return;                       // 로그인 화면 등 헤더가 없는 상태 — 기본값(82px)을 그대로 둔다
  const h = Math.round(dock.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty("--topdock-h", h + "px");
}
(function watchTopdockH() {
  const run = () => syncTopdockH();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  try {
    const dock = document.querySelector(".topdock");
    if (dock && "ResizeObserver" in window) new ResizeObserver(run).observe(dock);
    else if ("ResizeObserver" in window) {
      // 아직 DOM 이 없으면 붙을 때를 기다렸다가 건다
      document.addEventListener("DOMContentLoaded", () => {
        const d = document.querySelector(".topdock");
        if (d) new ResizeObserver(run).observe(d);
      });
    }
  } catch (e) { /* 못 걸어도 위 resize 로 따라간다 — 앱을 멈추지 않는다 */ }
})();

/* ── 접근성 헬퍼 (KWCAG 2.2) ───────────────────────────────── */
// C7: 스크린리더에 결과/오류를 알림(시각 alert와 별개로 보조기기 통지)
function announce(msg) {
  const box = document.getElementById("liveStatus");
  if (!box) return;
  box.textContent = "";
  // 같은 문구 연속 시에도 다시 읽도록 다음 프레임에 주입
  setTimeout(() => { box.textContent = String(msg || ""); }, 30);
}

// C2: 모달 포커스 트랩 — 열 때 첫 포커스, Tab 순환, Esc/닫기 시 복귀.
// 모달별로 한 번만 등록(중복 keydown 방지). open/close는 헬퍼로 통일.
const FOCUS_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _lastFocus = null;          // 모달 열기 전 포커스 복귀용
let _activeModal = null;        // 현재 열린 모달 엘리먼트
// 확인 창(#askModal)이 열려 있는 동안의 resolve. 닫힐 때 반드시 비운다(askDone).
// ⚠ _trapKeydown 보다 «먼저» 선언한다 — 뒤에 두면 첫 키 입력에서 TDZ 오류가 난다.
let ASK_RESOLVE = null;
let ASK_LASTFOCUS = null;       // 확인 창 열기 전 초점(닫으면 여기로 되돌린다)

function _trapKeydown(e) {
  // ⓪-0 한글 입력 중(IME 조합)에는 키를 가로채지 않는다.
  //   조합 중의 Esc 는 «조합 취소», Tab 은 «후보 선택»이다. 여기서 가로채면 처리메모·안내문을
  //   쓰다 말고 모달이 닫히거나 초점이 튄다(브라우저는 조합 중 keydown 을 229 로 보낸다).
  if (e.isComposing || e.keyCode === 229) return;
  // ⓪ 확인 창(#askModal)이 떠 있으면 «그것이» 키보드의 주인이다 — 뒤 모달은 건드리지 않는다.
  //    Esc = «취소»(안전한 쪽). 창만 닫히고 뒤 모달은 그대로 남는다.
  //    ⚠ 여기서 requestCloseModal 로 흘려보내면 창은 닫히는데 기다리던 약속이 안 풀려 «먹통»이 된다.
  if (ASK_RESOLVE) {
    const ask = document.getElementById("askModal");
    if (e.key === "Escape") { e.preventDefault(); askDone(false); return; }
    if (e.key !== "Tab" || !ask) return;
    const af = [...ask.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
    if (!af.length) { e.preventDefault(); return; }
    const af0 = af[0], afN = af[af.length - 1];
    if (e.shiftKey && document.activeElement === af0) { e.preventDefault(); afN.focus(); }
    else if (!e.shiftKey && document.activeElement === afN) { e.preventDefault(); af0.focus(); }
    else if (!ask.contains(document.activeElement)) { e.preventDefault(); af0.focus(); }
    return;
  }
  if (!_activeModal) return;
  if (e.key === "Escape") { requestCloseModal(_activeModal); return; }
  if (e.key !== "Tab") return;
  const f = [..._activeModal.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
  if (!f.length) { e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
// 트랩 keydown은 문서에 단 한 번만 등록(모달 전환돼도 _activeModal만 갱신)
document.addEventListener("keydown", _trapKeydown);

/* 🔒 모달이 열려 있는 동안 «뒤 본문»의 스크롤을 잠근다 (2026-08-19).
   왜: 덮개(.modal-backdrop)는 position:fixed 라 스스로 스크롤하지 않는다. 그래서 덮개 위에서
   굴린 휠·손가락이 문서로 흘러 뒤 목록이 밀렸고, 모달을 닫으면 보던 자리를 잃었다.
   ⚠ 스크롤막대가 사라지며 화면이 옆으로 튀지 않도록 그 폭만큼 body 오른쪽 여백으로 메운다.
      CSP(style-src 'self')는 «마크업의 style= 속성»을 막을 뿐 CSSOM 지정은 막지 않는다
      (stats.js 의 막대 폭 지정과 같은 방식). */
function lockBodyScroll(on) {
  const b = document.body;
  if (!b) return;
  if (on) {
    if (b.classList.contains("modal-open")) return;      // 이미 잠겨 있으면 여백을 두 번 주지 않는다
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) b.style.paddingRight = gap + "px";
    b.classList.add("modal-open");
  } else {
    b.classList.remove("modal-open");
    b.style.paddingRight = "";
  }
}

/* ══════════════════════════════════════════════════════════════════════
   🚧 BgInert — 모달이 열려 있는 동안 «뒤 본문»을 통째로 비활성으로 만든다 (2026-08-20)
   ────────────────────────────────────────────────────────────────────
   왜 필요한가 — Tab 가둠만으로는 부족하다. 화면낭독기의 «스와이프 탐색»(가상 커서)은
     Tab 순서를 따르지 않아서, 모달이 떠 있어도 뒤쪽 목록·버튼을 계속 읽어 준다.
     브라우저 기본 alert() 은 이것을 자동으로 막아 줬지만, 자체 모달은 직접 해야
     같은 수준이 된다(KWCAG 2.2 «초점 이동» 취지 — 지금 조작할 수 있는 것만 읽히게).
   무엇을 하나 — <body> 의 «형제 덩어리» 중 지금 «맨 위» 모달을 뺀 나머지에
     inert 와 aria-hidden="true" 를 «함께» 건다.
       · inert       = 초점·클릭·낭독을 모두 막는다(요즘 브라우저)
       · aria-hidden = inert 를 모르는 옛 브라우저에서도 «낭독»만은 막는다(병행 이유)
   ⚠ 낭독 전용 알림칸(role="status"/"alert"/"log"·aria-live)은 건드리지 않는다 —
     가려 버리면 「저장했습니다」 같은 안내가 영영 안 읽힌다.
   ⚠ 되돌릴 때는 반드시 «원래 값»으로 되돌린다. 원래 aria-hidden="true" 였던
     장식 요소(곶감 무대 등)의 값을 지워 버리면 그 뒤로 낭독기에 노출된다.
   ⚠ 모달이 겹치면 «맨 위» 것만 살아 있어야 한다 → 새 모달을 열 때·닫을 때마다
     apply(맨위요소) 를 다시 부르면 아래 모달도 배경으로 취급돼 자동으로 잠긴다.
   ⚠ 닫을 때는 «먼저 풀고 나서» 호출 버튼으로 초점을 돌려준다. 순서를 바꾸면
     아직 inert 안에 있는 버튼이라 focus() 가 먹지 않아 초점이 body 로 떨어진다.
   ══════════════════════════════════════════════════════════════════════ */
const BgInert = (function () {
  const marked = new Map();     // 요소 → 원래 aria-hidden 값(원래 없었으면 null)
  const SKIP_TAG = { SCRIPT: 1, LINK: 1, STYLE: 1, TEMPLATE: 1, META: 1, NOSCRIPT: 1 };

  // 낭독 전용 알림칸인가(= 가리면 안 되는 것)
  function isLive(el) {
    if (el.hasAttribute("aria-live")) return true;
    const r = (el.getAttribute("role") || "").toLowerCase();
    return r === "status" || r === "alert" || r === "log";
  }
  function mark(el) {
    if (marked.has(el)) return;                    // 이미 잠갔으면 원래 값을 덮어쓰지 않는다
    marked.set(el, el.hasAttribute("aria-hidden") ? el.getAttribute("aria-hidden") : null);
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("inert", "");
  }
  function unmark(el) {
    if (!marked.has(el)) return;
    const prev = marked.get(el);
    marked.delete(el);
    if (prev === null) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", prev);
    el.removeAttribute("inert");
  }
  function clear() {                               // 잠갔던 것을 «전부» 원래대로
    Array.from(marked.keys()).forEach(unmark);     // ⚠ 순회 중 지우므로 키 목록을 먼저 복사한다
  }
  // top = 살아 있어야 할 «맨 위» 모달 요소.
  // ⚠ top 이 없으면(= 모달이 다 닫힘) «전부 푼다». 이 갈래를 빠뜨리면 아래 반복문이
  //   모든 형제를 배경으로 보고 도리어 화면 전체를 잠가 버린다(브라우저 확인에서 잡힌 결함).
  function apply(top) {
    const body = document.body;
    if (!body) return;
    if (!top) { clear(); return; }
    Array.prototype.forEach.call(body.children, function (el) {
      if (el === top || el.contains(top) || SKIP_TAG[el.tagName] || isLive(el)) { unmark(el); return; }
      mark(el);
    });
  }
  return { apply: apply, clear: clear };
})();

/* 지금 «맨 위» 모달을 기준으로 배경 비활성(inert)을 다시 건다.
   이 앱의 모달은 «한 번에 하나»(_activeModal) + 그 위에 겹칠 수 있는 «확인·알림 창»(#askModal)
   두 층뿐이다. 그래서 맨 위는 askModal 이 떠 있으면 그것, 아니면 _activeModal 이다.
   여는 곳·닫는 곳 네 군데(openModal·closeModal·askConfirm·askDone)에서만 부른다. */
function _bgInertSync() {
  const ask = document.getElementById("askModal");
  const top = (ask && !ask.classList.contains("hidden")) ? ask : _activeModal;
  BgInert.apply(top || null);
}

function openModal(modal) {
  if (!modal) return;
  _lastFocus = document.activeElement;
  _activeModal = modal;
  modal.classList.remove("hidden");
  // ✍ 작성 중 이탈 보호 — 연 «그 순간»의 입력값을 기억해 두고, 닫을 때 달라졌으면 한 번 묻는다.
  //   (수정 모달은 기존 값이 미리 채워져 있으므로 «값이 있음»이 아니라 «값이 달라짐»으로 판정한다)
  modal._sjSnap = formSnapshot(modal);
  // ⬅ 브라우저·안드로이드 뒤로가기 = 모달만 닫기. 모달 열기를 히스토리 «한 칸»으로 만든다.
  navPush({ type: "modal", id: modal.id, tab: pCurrentTab });
  // ⚠ 히스토리를 «실제로 쌓았을 때만» 표시를 남긴다. NAV_READY 가 거짓이면 navPush 가
  //    아무 일도 하지 않으므로, 그때 true 로 두면 닫을 때 남의 히스토리를 한 칸 되돌리게 된다.
  modal._sjNav = NAV_READY;
  lockBodyScroll(true);
  // 🚧 배경 비활성 — 낭독기 스와이프 탐색이 뒤 본문으로 새지 않게. 첫 포커스 «전»에 건다.
  _bgInertSync();
  /* 첫 포커스 ────────────────────────────────────────────────────────────
     ① [data-first-focus] 가 있으면 «그것»을 먼저 잡는다.
        ⚠ 2026-08-25 — 접수 처리·정책제안 모달에서 「📋 복사」 단추를 없앴다.
           그 단추가 두 모달의 «첫 초점 대상»이었던 터라, 없애자 초점이
           신청자 전화번호 링크(tel:)·댓글 목록 같은 엉뚱한 곳으로 떨어졌다.
           → 두 모달은 제목(#amTitle·#pmTitle, tabindex="-1")을 첫 초점으로 잡아
             낭독기가 «무엇이 열렸는지»부터 읽게 한다. Tab 을 누르면 닫기 → 본문
             순서로 그대로 이어진다(tabindex="-1" 은 FOCUS_SEL 밖이라 트랩도 그대로).
        ⛔ 상태 <select> 를 첫 초점으로 삼지 말 것 — 초점이 든 select 는 ↑↓ 만으로
           값이 바뀌어, 읽으려던 사람이 모르는 사이에 처리 상태를 고치게 된다.
     ② 없으면 예전대로 «닫기 버튼이 아닌 첫 입력요소» → 첫 포커스 대상 순서.
        (비밀번호 변경 모달의 «현재 비밀번호» 칸이 이 규약으로 잡힌다) */
  const firstMark = modal.querySelector("[data-first-focus]");
  const focusables = [...modal.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
  const target = (firstMark && firstMark.offsetParent !== null)
    ? firstMark
    : (focusables.find((n) => !n.classList.contains("modal-close")) || focusables[0]);
  if (target) setTimeout(() => target.focus(), 30);
  // 💬 댓글 실시간 — 「제안 검토」 모달이면 여기서 열린다(closeModal 과 한 쌍).
  try { syncPCommentSub(); } catch (e) { /* 실시간이 실패해도 화면은 멀쩡해야 한다 */ }
}
// closeModal(modal) — «실제로 닫는다». 저장·삭제 성공 뒤처럼 «물을 필요가 없는» 경로가 부른다.
//   (호출 계약 유지: 인자 하나로 부르던 기존 코드는 그대로 동작한다)
//   opts.fromHistory=true 면 이미 히스토리가 한 칸 물러난 상태라 history.back()을 부르지 않는다.
function closeModal(modal, opts) {
  if (!modal) return;
  const fromHistory = !!(opts && opts.fromHistory);
  modal.classList.add("hidden");
  modal._sjSnap = null;
  // 🔑 닫을 때 비밀번호 칸은 반드시 비운다. (Esc·바깥클릭·✕ 어느 경로로 닫아도 동일하게 동작하도록
  //    닫기 «한 곳»에서 처리한다. 현재 type="password" 입력칸은 비밀번호 변경 모달에만 있다)
  try { modal.querySelectorAll('input[type="password"]').forEach((n) => { n.value = ""; }); } catch (e) {}
  if (_activeModal === modal) _activeModal = null;
  if (!_activeModal) lockBodyScroll(false);      // 남은 모달이 없을 때만 뒤 본문 스크롤을 푼다
  // 🚧 배경 비활성 다시 계산 — ⚠ 반드시 초점 복귀 «전». 뒤에 두면 아직 inert 안이라 focus() 가 먹지 않는다.
  _bgInertSync();
  if (_lastFocus && typeof _lastFocus.focus === "function") { try { _lastFocus.focus(); } catch (e) {} }
  _lastFocus = null;
  // ★ 모달이 열려 있는 동안 도착한 알림은 rtBusy() 때문에 띠가 «숨겨진 채» 카운트만 쌓인다.
  //   닫을 때 다시 계산해 주지 않으면 다음 실시간 이벤트가 올 때까지 알림이 영영 안 뜬다.
  try { syncRtBanners(); } catch (e) { /* 초기화 전이면 무시 */ }
  // 💬 댓글 실시간 — 어떤 경로로 닫혔든 여기서 닫힌다(openModal 과 한 쌍).
  try { syncPCommentSub(); } catch (e) { /* 초기화 전이면 무시 */ }
  // ⬅ ✕·바깥클릭·Esc·저장완료 로 닫았으면 히스토리도 한 칸 되돌린다.
  //   (안 그러면 «죽은 뒤로가기» 한 번이 남아 사용자가 눌러도 아무 일도 안 일어난다)
  if (modal._sjNav && !fromHistory) { modal._sjNav = false; navBack(); }
  else { modal._sjNav = false; }
}

/* ══════════════════════════════════════════════════════════════════════
   ✍ 작성 중 이탈 보호 (2026-08-19)
   ────────────────────────────────────────────────────────────────────
   사업 추가·수정 폼, 접수 처리메모·시민 안내문, 정책제안 답변을 쓰다가
   ✕·바깥클릭·Esc·탭 이동·뒤로가기로 나가면 «확인 없이» 사라지던 문제를 막는다.
   판정은 «연 순간의 값과 달라졌는가» — 아무것도 손대지 않았으면 묻지 않는다.
   ⚠ 저장·삭제가 «성공한 뒤»의 closeModal 은 묻지 않는다(이미 반영됐으므로).
   ⚠ 비밀번호 칸·파일 선택칸은 비교에서 뺀다(아래 fieldSnapValue 머리말 참조).
   ══════════════════════════════════════════════════════════════════════ */
const DIRTY_GUARD_IDS = new Set(["modal", "aModal", "pModal"]);   // 읽기 전용 모달(방침·버전)은 제외
// 🔑 비밀번호 모달은 제외 — 닫을 때 비밀번호 칸을 «반드시» 비우는 보안 규약이 있어 되물을 게 없다.

/* 칸 하나를 «기준선에 적을 글자»로 바꾼다.
   ⛔ 이 규칙을 formSnapshot 과 rebaseModalField 두 곳에 나눠 적지 마세요 —
      갈라지는 순간 기준선과 비교값이 서로 다른 자를 쓰게 됩니다. */
function fieldSnapValue(n) {
  /* ⚠ 파일 선택칸은 «비교에서 뺀다» — 2026-08-26 실측으로 두 번째 「양치기 소년」을 잡았다.
     서식은 「서식 등록」 단추로 «즉시» 올라가는 값이라 저장 대상이 아닌데, 고르고 나면
     input.value 에 "C:akepath\신청서식.hwp" 가 남아 «아무것도 안 고쳤는데» 창을 닫을 때
     「작성 중인 내용이 있습니다」가 떴다(사업 추가·수정 창 #modal · #formsFile).
     ★ PC앱 webui/app.js 의 formSnapshot 은 이미 file 을 빼고 있었다 — 그쪽에 맞춘 것이다. */
  if (n.type === "password" || n.type === "file") return "";
  if (n.type === "checkbox" || n.type === "radio") return n.checked ? "1" : "0";
  return String(n.value == null ? "" : n.value);
}

function formSnapshot(modal) {
  if (!modal || !DIRTY_GUARD_IDS.has(modal.id)) return null;
  const out = [];
  modal.querySelectorAll("input, textarea, select").forEach((n) => { out.push(fieldSnapValue(n)); });
  return JSON.stringify(out);   // 칸 경계가 섞이지 않도록 배열 그대로 직렬화
}

/* ⭐⭐ 2026-08-26 «양치기 소년» 결함 수정 — 아무것도 안 고치고 닫아도 경고가 떴다
   ────────────────────────────────────────────────────────────────────────────
   ⓘ 무엇이 잘못됐나 (실제 브라우저로 재현·확정)
     기준선(_sjSnap)은 openModal() 이 «창을 여는 그 순간» 잡는다. 그런데 정책제안
     검토창의 «처리메모»(#pmMemo)는 목록에 없는 값이라, openProposal() 이
     loadProposalMemo() 를 «기다리지 않고» 띄운다(그래야 창이 곧바로 열린다).
     그 조회가 창이 열린 «뒤»에 도착해 칸을 채우므로, 담당자는 손 하나 안 댔는데
     기준선("")과 지금 값("담당 배정 전. 분야 확인 필요.")이 달라진다 → 「작성 중」.
     실측 — 칸 4개(pmStatus·pmMemo·pmReply·pmHidden) 중 «pmMemo 한 칸만» 어긋났다.
   ⓘ 왜 그냥 두면 안 되나 — 처리메모가 적힌 제안은 «열었다 닫기만 해도» 매번 경고가
     뜬다. 경고를 읽지 않고 넘기는 버릇이 들면, 정작 답변을 쓰다 나가는 날 그 경고가
     아무 일도 못 한다(양치기 소년).
   ⓘ 어떻게 고쳤나 — 창을 늦게 열지 않는다(그러면 조회를 기다리게 된다).
     대신 «프로그램이 채워 넣은 그 칸 하나만» 기준선에 반영한다.
   ⛔ formSnapshot(modal) 로 «통째로» 다시 잡지 마세요 — 그 사이 담당자가 답변·메모를
      이미 쓰고 있었다면 그 «진짜 작성 중»까지 함께 지워집니다(경고를 죽이는 셈).
   ⚠ 이 함수는 «사람이 친 값»에는 절대 쓰지 않는다 — 오직 «화면이 스스로 채운 칸»에만.
   ⚠ 칸 개수가 달라졌으면(창 안에 입력칸이 새로 생겼다면) 자리가 어긋나므로 통째로
     다시 잡는다 — 그때는 어차피 자리 대조 자체가 뜻을 잃는다. */
function rebaseModalField(modal, node) {
  if (!modal || !node || modal._sjSnap == null) return;
  const list = [...modal.querySelectorAll("input, textarea, select")];
  const i = list.indexOf(node);
  if (i < 0) return;
  let snap = null;
  try { snap = JSON.parse(modal._sjSnap); } catch (e) { snap = null; }
  if (!Array.isArray(snap) || snap.length !== list.length) {
    modal._sjSnap = formSnapshot(modal);
    return;
  }
  snap[i] = fieldSnapValue(node);
  modal._sjSnap = JSON.stringify(snap);
}

function isModalDirty(modal) {
  if (!modal || modal._sjSnap == null) return false;
  return formSnapshot(modal) !== modal._sjSnap;
}

/* ══════════════════════════════════════════════════════════════════════
   ❓ askConfirm — 브라우저 confirm() 을 대신하는 «앱 안» 확인 창 (2026-08-19)
   ────────────────────────────────────────────────────────────────────
   왜 바꿨나 — 기본 confirm() 은 제목에 «…의 메시지»와 주소가 뜬다. 공무원에게는
     낯선 문구이고, 앱 디자인과도 따로 논다. Esc 동작도 앱 규약(= «취소»)과 어긋났다.
   계약 — askConfirm(opts) 는 «Promise<boolean>» 을 돌려준다.
     · true  = 위험한 쪽(«확인»/«삭제»/«공개») 을 눌렀다
     · false = 안전한 쪽(«취소»)·Esc·바깥클릭
   ★ 초점은 열릴 때 «취소» 에 둔다 — 엔터 연타로 삭제되는 사고를 막는 것이 목적이다.
   ⚠ 다른 모달과 달리 openModal/navPush 를 쓰지 않는다. 이 앱의 모달 관리는
     «한 번에 하나»(_activeModal) + «열기 = 히스토리 한 칸» 이라, 확인 창을 그 위에
     겹쳐 열면 뒤 모달의 _activeModal 이 덮이고 히스토리도 어긋난다.
     대신 초점 트랩은 _trapKeydown 맨 위에서 ASK_RESOLVE 로 가로챈다.
   ⚠ confirm() 은 동기였고 이것은 «비동기»다 — 부르는 쪽은 반드시 await 해야 한다.
     await 를 빠뜨리면 Promise 객체가 언제나 참이라 «묻지도 않고 실행»된다.
   ══════════════════════════════════════════════════════════════════════ */
function askConfirm(opts) {
  opts = opts || {};
  const alertOnly = !!opts.alert;   // 🔔 알림 모드 — 단추가 «확인» 하나뿐 (askAlert 참조)
  const m = document.getElementById("askModal");
  // 안전망 — 마크업이 없는(캐시된 구버전 HTML) 화면에서도 «알리기·묻기»는 살아 있어야 한다.
  if (!m) {
    const msg = (opts.title || "") + "\n\n" + (opts.body || "");
    if (alertOnly) { window.alert(msg); return Promise.resolve(true); }
    return Promise.resolve(window.confirm(msg));
  }
  if (ASK_RESOLVE) return Promise.resolve(false);   // 이미 떠 있으면 중복으로 열지 않는다
  const t = $("#askTitle").querySelector("span") || $("#askTitle");
  t.textContent = opts.title || (alertOnly ? "알림" : "확인");
  $("#askBody").textContent = opts.body || "";
  $("#askKeep").textContent = opts.cancelText || "취소";
  $("#askKeep").hidden = alertOnly;                 // 알림에는 «취소»가 없다
  $("#askGo").textContent = opts.okText || "확인";
  // 확인 창의 «확인»은 되돌릴 수 없는 쪽이라 빨강(danger), 알림 창의 «확인»은 그냥 닫기라 기본색.
  $("#askGo").classList.toggle("danger", !alertOnly);
  $("#askGo").classList.toggle("solid", alertOnly);
  ASK_LASTFOCUS = document.activeElement;
  m.classList.remove("hidden");
  lockBodyScroll(true);            // 모달 위에 겹쳐 떠도 뒤 본문은 잠긴 채로 둔다(이미 잠겼으면 무동작)
  // 🚧 겹쳐 떴을 때 «안쪽(확인 창)»만 살린다 — 아래 모달도 배경으로 취급돼 함께 잠긴다.
  _bgInertSync();
  return new Promise((resolve) => {
    ASK_RESOLVE = resolve;
    // 초점 — 확인 창은 «안전한 쪽»(취소), 알림 창은 하나뿐인 «확인»
    setTimeout(() => { const b = alertOnly ? $("#askGo") : $("#askKeep"); if (b) b.focus(); }, 30);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   🔔 askAlert — 브라우저 alert() 을 대신하는 «앱 안» 알림 창 (2026-08-20 양호창님 지시)
   ────────────────────────────────────────────────────────────────────
   왜 바꿨나 — alert() 은 창 맨 윗줄에 「hcyang572-gif.github.io 내용:」 같은
     «출처 표기»를 강제로 붙인다(JS 로 못 지운다). 게다가 자바스크립트를 통째로 멈춰
     「저장 중…」 같은 버튼 상태가 풀리지 않은 것처럼 보인다.
   위 askConfirm 과 «같은» #askModal·같은 CSS 를 쓰고, «취소» 단추만 감춘다 — 새 디자인이 아니다.
   계약 — askAlert(본문[, {title, okText}]) → Promise<true> (닫히면 풀린다)
     · 알리기만 할 때는 그냥 부르면 된다. 닫힌 «뒤»에 이어서 할 일이 있으면 await 한다.
   ⛔ 앞으로 alert() 을 새로 쓰지 말 것 — 한 곳만 남아도 거기서 출처 표기가 뜬다.
     (시민앱 모바일웹의 appAlert/appConfirm 과 같은 규약이다)
   ══════════════════════════════════════════════════════════════════════ */
function askAlert(body, opts) {
  opts = opts || {};
  return askConfirm({
    alert: true,
    title: opts.title || "알림",
    body: body == null ? "" : String(body),
    okText: opts.okText || "확인",
  });
}
// 확인 창을 닫으며 결과를 넘긴다. Esc·바깥클릭·두 단추가 모두 여기로 모인다.
function askDone(v) {
  const r = ASK_RESOLVE;
  ASK_RESOLVE = null;
  const m = document.getElementById("askModal");
  if (m) m.classList.add("hidden");
  if (!_activeModal) lockBodyScroll(false);   // 뒤에 남은 모달이 없을 때만 본문 스크롤을 푼다
  // 🚧 아래 모달이 남아 있으면 그것을 다시 살린다. ⚠ 초점 복귀 «전»이어야 한다.
  _bgInertSync();
  const back = ASK_LASTFOCUS; ASK_LASTFOCUS = null;
  if (back && typeof back.focus === "function") { try { back.focus(); } catch (e) {} }
  if (r) r(v);
}
{
  const _ask = document.getElementById("askModal");
  if (_ask) {
    $("#askKeep").addEventListener("click", () => askDone(false));
    $("#askGo").addEventListener("click", () => askDone(true));
    _ask.addEventListener("click", (e) => { if (e.target.id === "askModal") askDone(false); });
  }
}

// 사용자가 «나가려고» 할 때 부른다. 나가도 되면 true. ⚠ 비동기 — 반드시 await.
async function confirmLeaveModal(modal) {
  if (!isModalDirty(modal)) return true;
  return await askConfirm({
    title: "작성 중인 내용이 있습니다",
    body: "저장하지 않고 닫으면 지금까지 쓴 내용이 사라집니다.",
    cancelText: "계속 작성",
    okText: "닫기"
  });
}

// requestCloseModal(modal) — «사용자가 닫으려 한다». ✕·바깥클릭·Esc·뒤로가기가 부른다.
//   작성 중이면 한 번 묻고, 확인했을 때만 실제로 닫는다.
//   ⚠ 비동기가 됐지만 «반환값을 쓰는 호출부는 한 곳도 없다»(전수 확인 2026-08-19) —
//     ✕·바깥클릭·Esc 는 모두 결과를 보지 않으므로 흐름이 깨지지 않는다.
async function requestCloseModal(modal, opts) {
  if (!modal) return false;
  if (!(await confirmLeaveModal(modal))) return false;
  closeModal(modal, opts);
  return true;
}

/* ══════════════════════════════════════════════════════════════════════
   ⬅ 브라우저·OS 뒤로가기 연동 (2026-08-19)
   ────────────────────────────────────────────────────────────────────
   공무원앱은 PWA(standalone)로 설치해 쓰므로 주소창이 없다. 히스토리를 쓰지
   않으면 안드로이드 «물리 뒤로가기» 한 번에 앱이 통째로 종료돼 작성 중이던
   처리메모가 함께 사라졌다.
     · 탭 전환  → 히스토리 한 칸 push
     · 모달 열기 → 히스토리 한 칸 push  (뒤로가기 = «모달만» 닫힘)
     · 첫 탭(루트)에서 뒤로가기 → 앱 종료(정상)
   히스토리 state 에 «어느 화면인가»를 통째로 담아 두므로 앞으로가기도 어긋나지 않는다.
   ⚠ 세션 만료 배너는 히스토리를 쓰지 않으므로 이 구조와 충돌하지 않는다.
   ══════════════════════════════════════════════════════════════════════ */
let NAV_READY = false;    // showApp() 이후에만 동작(로그인 화면에서는 히스토리를 건드리지 않는다)
let NAV_CUR = null;       // 지금 서 있는 히스토리 항목
let NAV_SEQ = 0;

function navView(view) { return { sj: true, i: NAV_SEQ, view }; }

function navReset(view) {
  NAV_SEQ = 0;
  NAV_CUR = navView(view);
  try { history.replaceState(NAV_CUR, ""); } catch (e) { /* 파일 프로토콜 등 */ }
  NAV_READY = true;
}

function navPush(view) {
  if (!NAV_READY) return;
  NAV_SEQ++;
  NAV_CUR = navView(view);
  try { history.pushState(NAV_CUR, ""); } catch (e) {}
}

// 화면 전환 슬라이드 방향 — NAV_SEQ(i)는 «단조 증가»라, 목적지 i 가 작으면 뒤로 간 것이다.
//   (규격서 §14: 앞으로 = 왼쪽으로 밀림, 뒤로 = 오른쪽으로 — «히스토리 방향과 일치»)
function navDir(prev, next) {
  const a = prev && typeof prev.i === "number" ? prev.i : 0;
  const b = next && typeof next.i === "number" ? next.i : 0;
  return b < a ? "back" : "fwd";
}

function navBack() {
  if (!NAV_READY) return;
  try { history.back(); } catch (e) {}
}

window.addEventListener("popstate", (e) => {
  if (!NAV_READY) return;
  const prev = NAV_CUR;
  const st = (e.state && e.state.sj) ? e.state : null;
  // 우리 항목이 아니면(맨 처음 진입 지점) 루트 탭으로 본다
  const view = st ? st.view : { type: "tab", tab: "applications" };

  // ⓪ 확인 창이 떠 있는 동안의 뒤로가기 = «취소»로 본다.
  //    확인 창은 히스토리를 쌓지 않으므로, 물러난 한 칸을 되돌려 놓고 끝낸다.
  if (ASK_RESOLVE) {
    askDone(false);
    NAV_CUR = prev;
    try { history.pushState(prev, ""); } catch (err) {}
    return;
  }

  // ① 모달이 열려 있으면 «모달만» 닫는다 — 앱 밖으로 나가지 않는다
  if (_activeModal) {
    const sameModal = view.type === "modal" && view.id === _activeModal.id;
    if (!sameModal) {
      // ✍ 작성 중이면 «먼저» 히스토리를 원위치로 되돌린 뒤 확인 창으로 묻는다.
      //    확인 창은 비동기라, 되돌리기를 나중으로 미루면 그 사이 다른 popstate 가 끼어들어
      //    히스토리가 어긋난다. «확인»을 누르면 그때 closeModal 이 스스로 한 칸 물러난다(navBack).
      if (isModalDirty(_activeModal)) {
        const m = _activeModal;
        NAV_CUR = prev;
        try { history.pushState(prev, ""); } catch (err) {}
        confirmLeaveModal(m).then((ok) => { if (ok) closeModal(m); });
        return;
      }
      closeModal(_activeModal, { fromHistory: true });
      NAV_CUR = st;
      if (view.type === "tab" && view.tab && view.tab !== pCurrentTab) switchTab(view.tab, { fromHistory: true, dir: navDir(prev, st) });
      return;
    }
    NAV_CUR = st;
    return;
  }

  // ② 탭 되돌리기 (앞으로가기로 «모달» 항목에 닿아도 내용은 되살릴 수 없으므로 탭만 맞춘다)
  NAV_CUR = st;
  if (view.tab && view.tab !== pCurrentTab) switchTab(view.tab, { fromHistory: true, dir: navDir(prev, st) });
});

/* ══════════════════════════════════════════════════════════════════════
   🎞 움직임(애니메이션) 공용 헬퍼 — 규격서 §14 (2026-08-19)
   ────────────────────────────────────────────────────────────────────
   시간·이징 값은 style.css 의 --dur-* / --ease-move 한 곳에서만 정한다.
   ⚠ 공통 규칙: 저감 모션이면 «전부» 끈다 · 정보를 움직임에만 담지 않는다 ·
      자동 반복·깜빡임 없다 · 일하는 화면(접수 처리 중)은 조용하게.
   ══════════════════════════════════════════════════════════════════════ */
function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

/* 숫자 카운트업 — 0 에서 실제값까지 .9s.
   ★ 최종값은 «먼저» .kpi-sr(보조기기 전용)에 넣는다. 눈에 보이는 .kpi-vis 는 aria-hidden 이라
     올라가는 도중 값이 낭독되지 않는다(규격서 §14: 스크린리더가 최종값을 읽게 할 것).
   ★ 값이 그대로면 애니메이션하지 않는다(캐시로 즉시 표시될 때 굳이 움직이지 않는다). */
function countUp(box, value) {
  if (!box) return;
  const target = Number(value) || 0;
  const sr = box.querySelector(".kpi-sr");
  const vis = box.querySelector(".kpi-vis");
  if (!sr || !vis) { box.textContent = String(target); return; }   // 옛 마크업 대비
  if (Number(sr.textContent) === target) return;                   // 같은 값 → 조용히 둔다
  sr.textContent = String(target);                                 // ① 최종값을 DOM 에 먼저
  // ⚠ 화면이 «보이지 않는» 탭에서는 requestAnimationFrame 이 아예 돌지 않는다.
  //   그대로 두면 다시 켰을 때 숫자가 0 인 채로 남는다 → 곧바로 최종값을 넣는다.
  if (prefersReducedMotion() || document.visibilityState !== "visible") {
    vis.textContent = String(target); return;
  }
  const from = Number(vis.textContent) || 0;
  const t0 = performance.now(), DUR = 900;
  if (box._cntRaf) cancelAnimationFrame(box._cntRaf);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / DUR);
    const e = 1 - Math.pow(1 - k, 3);                              // ease-out (이징 곡선과 같은 결)
    vis.textContent = String(Math.round(from + (target - from) * e));
    if (k < 1) box._cntRaf = requestAnimationFrame(step);
    else { box._cntRaf = null; vis.textContent = String(target); }
  };
  box._cntRaf = requestAnimationFrame(step);
}
window.sjCountUp = countUp;      // stats.js(도넛·지표)도 같은 함수를 쓴다

/* 스켈레톤 — «불러오는 중»을 회색 블록으로. 반짝임 없이 1.2s 순환(style.css).
   ★ 이미 자료가 있으면 넣지 않는다(다시 불러올 때 화면이 껌뻑이지 않게).
   ★ 움직임만으로 알리지 않도록 «불러오는 중» 글자를 보조기기용으로 함께 둔다. */
function showSkeleton(sel, rows) {
  const box = $(sel);
  if (!box || box.children.length) return;                          // 이미 내용이 있으면 그대로
  const n = rows || 4;
  let html = '<div class="skel-wrap" role="status" aria-live="polite"><span class="sr-only">불러오는 중입니다.</span>';
  for (let i = 0; i < n; i++) {
    html += '<div class="skel-row" aria-hidden="true">' +
            '<div class="skel-bar w30"></div><div class="skel-bar w80"></div><div class="skel-bar w55"></div></div>';
  }
  box.innerHTML = html + "</div>";
}

/* ── 🔒 연타(중복 제출) 방어 — 2026-08-20, 🔵손길 시연 전 점검 ──────────────────────
   왜 필요한가 — 저장·삭제는 «await» 하는 사이 화면이 그대로라, 반응이 늦으면 담당자가
   한 번 더 누른다. 그러면 같은 update 가 두 번 나가고(감사기록도 두 줄),
   삭제는 두 번째 호출이 «이미 없는 행»에 대해 실패해 모달이 닫힌 뒤 오류 alert 가 뜬다.
   시민 안내문 공개 확인창(askConfirm)은 «두 번» 열려 담당자가 같은 글을 두 번 확인해야 했다.
   ⛔ 이미 방어가 있던 곳(#loginBtn·#pwSave·#mSave·서식 업로드/삭제)은 건드리지 않는다.
   ★ 규약 — 처리 중에는 «눌리지 않게»(disabled) 두고, 끝나면 반드시 되돌린다(finally).
     모달이 이미 닫혔어도 되돌려 둔다 — 모달 본문은 열 때마다 새로 그려지므로 부작용이 없다. */
function bindOnce(btn, handler) {
  if (!btn) return;
  btn.onclick = async () => {
    if (btn.disabled) return;          // 이미 처리 중 — 두 번째 누름은 «없던 일»로
    btn.disabled = true;
    try { await handler(); }
    finally { btn.disabled = false; }
  };
}

/* 카드 순차 등장 — 위에서부터 40ms 간격. 최대 8장까지만 지연(긴 목록에서 답답해지지 않게). */
function staggerCards(listEl) {
  if (!listEl || prefersReducedMotion()) return;
  const kids = listEl.children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].classList.add("card-in");
    kids[i].style.setProperty("--i", String(Math.min(i, 8)));
  }
}

/* 방금 처리한 행 강조 — 상태를 바꾼 «그 줄»이 1.2s 은은히 밝아졌다 돌아온다.
   ★ 색만으로 알리지 않는다 — 같은 카드 안에 «방금 변경» 글자 배지를 함께 붙인다.
     (배지는 저감 모션에서도 그대로 보인다 — 정보가 움직임에만 담기지 않게) */
let JUST_CHANGED_ID = null;
function markJustChanged(id) { JUST_CHANGED_ID = id == null ? null : String(id); }
function applyJustChanged(card, id) {
  if (JUST_CHANGED_ID == null || String(id) !== JUST_CHANGED_ID) return;
  card.classList.add("just-changed");
  const top = card.querySelector(".pcard-top");
  if (top) {
    const tag = el("span", "just-tag");
    tag.textContent = "방금 변경";
    top.appendChild(tag);
  }
  JUST_CHANGED_ID = null;                       // 한 번만
}

/* 완료 체크 — 저장·상태변경이 «성공했을 때만» 1회. 원(.4s) → 체크(.25s).
   ★ 같은 내용을 announce() 가 글로도 알리므로, 못 본 사람도 결과를 안다.
   ★ 저감 모션이면 아예 띄우지 않는다(글 안내만 남는다). */
function showDoneCheck(text) {
  if (prefersReducedMotion()) return;
  const old = document.getElementById("doneCheck");
  if (old) old.remove();
  const box = el("div", "done-check");
  box.id = "doneCheck";
  box.setAttribute("aria-hidden", "true");      // 낭독은 announce() 가 담당(중복 방지)
  box.innerHTML =
    '<svg viewBox="0 0 56 56" focusable="false"><circle class="dc-ring" cx="28" cy="28" r="24"/>' +
    '<path class="dc-tick" d="M17 29l7.5 7.5L39 22"/></svg>' +
    '<span class="dc-text"></span>';
  box.querySelector(".dc-text").textContent = text || "저장했습니다";
  document.body.appendChild(box);
  setTimeout(() => { if (box.parentNode) box.remove(); }, 1500);
}

/* ══════════════════════════════════════════════════════════════════════
   🎉 «오늘 몇 번째» — 저장이 성공할 때마다 1 씩 오른다 (규격서 §14② 기분 좋은 순간)
   ────────────────────────────────────────────────────────────────────
   무엇을 세는가 — «이 브라우저에서 오늘 성공한 저장 횟수». 서버에 묻지 않는다.
     그래서 부서 전체가 아니라 «지금 이 사람이 오늘 한 일»에 가깝다(동기부여의 목적).
     날짜가 바뀌면 저절로 0 부터 다시 센다(자정 기준, 기기 현지 시각).
   ⚠ 개인정보를 담지 않는다 — 날짜와 «횟수» 숫자 하나뿐이다.
   ⚠ 못 세더라도(사생활 보호 모드·저장소 차단) 저장 자체는 그대로 된다 → 0 을 돌려주고,
      부르는 쪽은 0 이면 «번째» 문구를 아예 붙이지 않는다.
   ⚠ 화면이 «늘어나지 않는다» — 이미 있는 완료 체크 문구 뒤에 한 토막만 덧붙인다(규격서 §0).
   ══════════════════════════════════════════════════════════════════════ */
const DONE_COUNT_KEY = "sangju_admin_done_count";
function localDayKey(d) {
  const t = d || new Date();
  return t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate();
}
function bumpDoneCount() {
  try {
    const today = localDayKey();
    let o = null;
    try { o = JSON.parse(localStorage.getItem(DONE_COUNT_KEY) || "null"); } catch (e) { o = null; }
    if (!o || o.d !== today || typeof o.n !== "number") o = { d: today, n: 0 };
    o.n += 1;
    localStorage.setItem(DONE_COUNT_KEY, JSON.stringify(o));
    return o.n;
  } catch (e) { return 0; }
}
/* 「저장했습니다」 → 「저장했습니다 · 오늘 3번째」.
   ★ 완료 체크(움직임)와 announce(글) 가 «같은 문구»를 쓰도록 여기서 한 번만 만든다 —
     움직임을 끈 이용자도 똑같은 정보를 받는다(규격서 §14 «정보를 움직임에만 담지 않는다»). */
function doneText(base) {
  const n = bumpDoneCount();
  return n > 0 ? `${base} · 오늘 ${n}번째` : base;
}

/* ══════════════════════════════════════════════════════════════════════
   📋 글자 복사 — «눈으로 옮겨 적던» 값을 한 번에 집어 준다.
   ⚠ 2026-08-25 현재 쓰는 곳은 «현재 주소 복사»(행정망 안내) 한 곳뿐이다 —
      접수번호 복사 단추는 양호창님 지시로 없앴다(공무원앱·PC앱 동시).
   클립보드 API 가 막힌 환경(구형·비보안 컨텍스트)에서는 임시 textarea 로 물러난다.
   ⚠ 성공·실패를 «글자»로 알린다(announce). 색·아이콘만으로 알리지 않는다.
   ⚠ style 속성이 아니라 CSSOM 으로 넣는다 — CSP style-src 'self' 가 인라인 style 을 막는다.
   ══════════════════════════════════════════════════════════════════════ */
async function copyText(text, okMsg) {
  const t = String(text == null ? "" : text);
  if (!t) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
    } else { throw new Error("no clipboard api"); }
    announce(okMsg || "복사했습니다.");
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.pointerEvents = "none";
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    announce(ok ? (okMsg || "복사했습니다.")
                : "복사하지 못했습니다. 글자를 끌어 선택한 뒤 Ctrl+C 로 복사해 주세요.");
    return ok;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ⏳ 처리 기한 경과 — 접수된 지 OVERDUE_DAYS 일이 지나도록 아직 «접수·심사중» 인 건.
   ────────────────────────────────────────────────────────────────────
   왜 두는가 — 지금까지는 «밀린 건»을 담당자가 목록을 훑어 스스로 찾아야 했다.
     이미 있는 자료(created_at·status)만으로 셀 수 있으므로 지어낸 값이 없다.
   ⚠ 승인·반려는 이미 «끝난» 건이라 세지 않는다.
   ⚠ 색만으로 알리지 않는다 — 「N일 경과」 라는 글자가 곧 정보이고, 카드 접근명에도 넣는다.
   ★ 기준일을 바꾸려면 이 상수 한 곳만 고치면 된다.
   ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   📍 읍·면·동 — 목록·정규화·집계 (2026-08-20)
   ────────────────────────────────────────────────────────────────────
   ⛔ 25개 지역 이름을 여기에 «베껴 적지 마세요». 목록은 data.json 한 곳에서만 옵니다
      (모바일웹/build_data.py 196행 규약: «브라우저는 이 data.json 을 통해서만 그 목록을 받는다»).
      베끼는 순간 엑셀·시민앱·공무원앱 셋의 지역 목록이 언젠가 조용히 어긋납니다.
      ⚠ 공무원앱용 data.json 도 build_data.py 가 «같은 내용»으로 함께 씁니다(cloudui/data.json).

   ⚠⚠ 집계 규칙은 «파이썬 config.count_by_region() 과 같아야» 합니다 ⚠⚠
      엑셀·한글보고서는 그 파이썬 함수를 쓰고, 이 화면은 JS 라 그대로 쓸 수 없습니다.
      그래서 «규칙»을 맞춥니다 — 이 셋 중 하나라도 어기면 화면과 보고서의 숫자가 달라집니다.
        ① 차트 축 순서 = regions 배열 순서 그대로 (읍 → 면 → 동 → 기타 → 미기재)
        ② 0건인 지역도 «반드시» 넣는다 — 빼면 가로축이 매번 달라져 달마다 견줄 수 없다
        ③ 알아볼 수 없는 값·빈 값은 「미기재」로 «맨 뒤»에 (숨기면 합계가 안 맞아 보인다)

   ⚠ 이름 알아보기(normalize)의 «범위 차이»를 분명히 적어 둡니다.
      파이썬 normalize_region() 은 별칭표(사벌면→사벌국면)·법정동표(낙양동→남원동)까지 봅니다.
      그 두 표는 data.json 에 «없어서» 여기서는 볼 수 없습니다. 여기서 하는 것은
        정식이름 · 앞뒤 공백 · 상위주소 접두어(경북/상주시…) · 뒤에 붙은 하위주소 ·
        「읍/면/동」 이 빠진 이름 · 「타지역/관외」 류 → 기타·타지역
      까지입니다. 시민앱이 «고르게» 해서 보내는 새 신청은 늘 정식 이름이라 문제가 없고,
      옛 자유입력 값 중 별칭·법정동만 「미기재」로 갑니다.
      → 🟢곳간에게: 별칭·법정동 표도 data.json 에 실어 주시면 여기서 그대로 맞출 수 있습니다.
   ══════════════════════════════════════════════════════════════════════ */
const REGION_UNKNOWN = "미기재";                     // 파이썬 config.REGION_UNKNOWN 과 같은 글자
let SJ_REGIONS = [];          // 표준 순서 25개 (data.json regions)
let SJ_REGION_GROUPS = [];    // [["읍",[...]], ["면",[...]], ...]
let SJ_REGION_ETC = "";       // "기타·타지역"
let SJ_REGION_ETC_WORDS = []; // 「관외」·「타지역」 류 (data.json region_etc_words · 11개)
let SJ_REGION_ALIASES = {};   // 옛 이름·오타 → 정식  (data.json region_aliases · 4개)
let SJ_LEGAL_DONG = {};       // 법정동 → 행정동      (data.json region_legal_dong · 36개)
let REGION_READY = false;     // data.json 을 받았는가(못 받아도 앱은 그대로 돈다)
/* 🏢 사업명 → «지금» 담당팀 (data.json programs 의 사업명·팀명) — 2026-08-25
   ⚠ 무엇에 쓰는가 : «집계»에만 쓴다(도넛 옆 「담당팀별 접수」 순위표).
      접수 행의 team 은 «신청 시점 스냅샷»(supabase/applications.sql:74)이라,
      부서가 개편되면 폐지된 팀 이름이 순위에 오른다. 실제로 「건강증진과 출산장려팀 3건 ·
      출산지원팀 3건 · (출산장려팀) 11건」처럼 한 팀이 세 갈래로 갈라져 있었다.
   ⛔ «상세보기»의 담당팀(app.js 접수 상세)에는 절대 쓰지 말 것 — 그 칸은 «그때의 기록»이고,
      기록을 지금 값으로 덮으면 되돌릴 수 없다.
   ⚠ 표를 못 받으면 통째로 비운다(아래 catch) — 반쯤 채워진 표는 «어떤 사업은 통일되고
      어떤 사업은 안 되는» 어정쩡한 순위표를 만든다. 그때는 스냅샷만으로 예전처럼 센다. */
let SJ_PROGRAM_TEAM = Object.create(null);
let PROGRAM_TEAM_READY = false;
/* 사업명 대조용 정규화 — 띄어쓰기·괄호·가운뎃점·붙임표만 털어 낸다(글자는 그대로 둔다).
   ⚠ 여기서 «말»을 바꾸지 않는다(예: 「지원」 떼기). 그렇게 하면 다른 사업끼리 붙어 버린다. */
function normBenefitName(v) {
  return String(v == null ? "" : v).replace(/[\s()（）\[\]{}·ㆍ,./\-–—~]/g, "");
}
/* 🏷 분야 «이름» 목록 — data.json categories (= config.POLICY_CATEGORIES 의 키 차례 그대로).
   ⛔ 여기에 분야 이름을 베껴 적지 마세요. 아래 loadRegionMeta() 가 채웁니다.
   ⚠ 못 받으면 빈 배열로 남고, categoryKeys() 가 비상용 사본으로 떨어집니다(앱은 그대로 돕니다). */
let SJ_CATEGORIES = [];

/* 비교용으로 «군더더기»를 턴다 — 파이썬 _region_fold() 와 «글자 그대로» 같은 정규식.
   한글·영문·숫자만 남긴다(공백·가운뎃점·괄호 제거). */
function regionFold(s) {
  return String(s == null ? "" : s).replace(/[^가-힣A-Za-z0-9]/g, "");
}

/* ══════════════════════════════════════════════════════════════════════
   사람이 적어 낸 값 → 정식 읍·면·동 이름. 못 알아보면 "" (부르는 쪽이 「미기재」로 센다).
   ────────────────────────────────────────────────────────────────────
   ⚠⚠ 이 함수는 파이썬 config.normalize_region() «의 번역»입니다. 엑셀·한글보고서는 그
      파이썬 함수를 쓰고 이 화면은 이 JS 를 씁니다 — 둘이 갈리면 «보고서와 화면의 숫자»가
      달라집니다. 고칠 일이 생기면 «양쪽을 함께» 고치고, 아래 순서를 절대 흐트러뜨리지 마세요.
      (2026-08-20 곳간이 50개 사례로 대조해 15건이 어긋난 것을 잡았습니다 — 그 재발 방지)

   ★ 판정 순서 — 같은 표를 써도 «순서»가 다르면 결과가 갈립니다
      1. 앞뒤 공백 제거. 비면 → ""
      2. regions 에 «그대로» 있으면 → 그 값                    ← ⚠ 접기(fold) «전»에 먼저!
         (이걸 빠뜨리면 「기타·타지역」이 4번 etc_words 에 먼저 걸려 버립니다)
      3. 접기: 한글·영숫자만 남긴다
      4. region_etc_words 중 하나라도 «포함»되면 → region_etc
      5. 앞머리 제거: 경상북도 → 경북 → 상주시 → 상주 (남는 게 있을 때만·break 없이 차례로)
      6. region_aliases 에 있으면 → 그 값
      7. regions 에 있으면 → 그 값
      8. region_legal_dong 에 있으면 → 그 값
      9. regions / region_legal_dong / region_aliases 로 startsWith → 그 값
     10. 접미사 보완: 읍·면·동을 각각 붙여 후보를 모아
         «서로 다른 결과가 정확히 1개일 때만» 채택          ← 2개 이상이면 포기
     11. 그 밖 → ""   (= 미기재)

   ⚠ 10번에 «이름이 읍/면/동으로 끝나면 건너뛴다» 는 조건을 «다시 넣지 마세요».
      그 조건이 「낙동·중동·화동·모동」 네 면을 통째로 미기재로 떨어뜨렸습니다
      (이름 자체가 「동」으로 끝나는 탓). 이 자리까지 왔다는 것은 위 2·6·7·8·9번이
      «모두 빗나갔다»는 뜻이라, 완성된 이름에 접미사를 덧붙일 위험이 구조적으로 없습니다.

   ⚠ 10번의 «1개일 때만» 도 빼지 마세요. 나중에 행정구역이 바뀌어 「○○면」과 「○○동」이
      둘 다 생기면, 조용히 한쪽으로 몰아넣는 대신 «모른다»로 두는 편이 낫습니다.

   ⚠ 「중앙동」처럼 폐지된 동은 표(region_aliases)에 적힌 대로만 옮깁니다. 표에 없는 이름을
      임의로 아무 동에 넣지 않습니다 — 통계가 조용히 틀어집니다. 사람이 고치게 남깁니다.
   ══════════════════════════════════════════════════════════════════════ */
function normalizeRegion(value) {
  // 1. 앞뒤 공백 제거
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (!SJ_REGIONS.length) return "";              // 목록을 아직 못 받았으면 «판정하지 않는다»

  // 2. 정식 이름 그대로 — ⚠ 반드시 접기 «전»에
  if (SJ_REGIONS.indexOf(raw) >= 0) return raw;

  // 3. 접기
  let f = regionFold(raw);
  if (!f) return "";

  // 4. 「타지역」·「관외」 류 → 기타·타지역 (포함 여부로 본다)
  for (let i = 0; i < SJ_REGION_ETC_WORDS.length; i++) {
    if (f.indexOf(SJ_REGION_ETC_WORDS[i]) >= 0) return SJ_REGION_ETC || "";
  }

  // 5. 앞에 붙은 상위 주소 떼기 — ⚠ break 없이 «차례로»(「경북 상주시 함창읍」)
  const PRE = ["경상북도", "경북", "상주시", "상주"];
  for (let i = 0; i < PRE.length; i++) {
    if (f.indexOf(PRE[i]) === 0 && f.length > PRE[i].length) f = f.slice(PRE[i].length);
  }

  // 6·7·8. 옛 이름·오타 → 정식 이름 → 법정동
  if (Object.prototype.hasOwnProperty.call(SJ_REGION_ALIASES, f)) return SJ_REGION_ALIASES[f];
  if (SJ_REGIONS.indexOf(f) >= 0) return f;
  if (Object.prototype.hasOwnProperty.call(SJ_LEGAL_DONG, f)) return SJ_LEGAL_DONG[f];

  // 9. 뒤에 하위 주소가 붙은 경우 — 「함창읍 교촌리」 → 「함창읍」
  for (let i = 0; i < SJ_REGIONS.length; i++) {
    const name = SJ_REGIONS[i];
    if (name !== SJ_REGION_ETC && f.indexOf(name) === 0) return name;
  }
  const legalKeys = Object.keys(SJ_LEGAL_DONG);
  for (let i = 0; i < legalKeys.length; i++) {
    if (f.indexOf(legalKeys[i]) === 0) return SJ_LEGAL_DONG[legalKeys[i]];
  }
  const aliasKeys = Object.keys(SJ_REGION_ALIASES);
  for (let i = 0; i < aliasKeys.length; i++) {
    if (f.indexOf(aliasKeys[i]) === 0) return SJ_REGION_ALIASES[aliasKeys[i]];
  }

  // 10. 접미사 보완 — «서로 다른 결과가 정확히 1개일 때만» 채택
  const found = [];
  ["읍", "면", "동"].forEach((suf) => {
    const cand = f + suf;
    if (SJ_REGIONS.indexOf(cand) >= 0) found.push(cand);
    else if (Object.prototype.hasOwnProperty.call(SJ_LEGAL_DONG, cand)) found.push(SJ_LEGAL_DONG[cand]);
    else if (Object.prototype.hasOwnProperty.call(SJ_REGION_ALIASES, cand)) found.push(SJ_REGION_ALIASES[cand]);
  });
  const uniq = found.filter((v, i) => found.indexOf(v) === i);   // 같은 결과로 모이면 한 개로 본다
  if (uniq.length === 1) return uniq[0];

  // 11. 그 밖 → 모른다
  return "";
}

/* 읍·면·동별 건수 — 파이썬 count_by_region(include_zero=True, include_unknown=True) 와 같은 규칙.
   반환: [{name, n}, ...] «순서가 있는 목록». 이 순서가 곧 차트 축 순서다.
   ⚠ dict 로 바꾸지 말 것 — 순서를 잃으면 ①번 규칙이 깨진다. */
function countByRegion(rows) {
  if (!SJ_REGIONS.length) return [];
  const counts = Object.create(null);
  SJ_REGIONS.forEach((r) => { counts[r] = 0; });
  let unknown = 0;
  (rows || []).forEach((r) => {
    const name = normalizeRegion(r && r.region);
    if (name && name in counts) counts[name] += 1; else unknown += 1;
  });
  const out = SJ_REGIONS.map((r) => ({ name: r, n: counts[r] }));   // ② 0건도 그대로 넣는다
  // ③ 「미기재」는 «있을 때만» 맨 뒤에 (0건이면 굳이 칸을 만들지 않는다 — 파이썬과 같다)
  if (unknown) out.push({ name: REGION_UNKNOWN, n: unknown });
  return out;
}

/* 화면에 보여 줄 이름 — 정식 이름으로 바로잡아 보여 준다(목록·상세·차트가 같은 말을 쓰게).
   알아볼 수 없으면 «원문 그대로» 보여 준다(담당자가 무엇이 잘못 들어왔는지 알아야 고칠 수 있다).
   값 자체가 비어 있을 때만 「미기재」. */
function regionLabel(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return REGION_UNKNOWN;
  return normalizeRegion(raw) || raw;
}

/* data.json 에서 지역 목록을 받아 둔다.
   ⚠ 못 받아도 앱은 그대로 돈다 — 차트만 「목록을 불러오지 못했습니다」로 남고,
      목록·상세의 읍·면·동은 «원문 그대로» 보인다. 업무가 멈추지 않는 것이 우선이다. */
async function loadRegionMeta() {
  try {
    const v = window.APP_VERSION ? ("?v=" + window.APP_VERSION) : "";
    let d = null;
    try {
      const res = await fetch("data.json" + v, { credentials: "same-origin" });
      if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "?"));
      d = await res.json();
    } catch (e1) {
      /* 행정망(업무망) 폴백 (2026-08-21) — 업무망 프록시가 «.json 요청»만 걸러 내는 사례가 있다.
         build_data.py 가 data.json 과 «같은 순간·같은 내용»으로 써 둔 data.js 를 <script> 로
         끼워 넣어 window.__SANGJU_DATA__ 에서 읽는다. 단일 출처는 여전히 data.json 이다. */
      console.warn("[읍·면·동] data.json 을 읽지 못했습니다 — data.js 사본으로 재시도:", e1);
      d = await new Promise((resolve) => {
        try {
          if (window.__SANGJU_DATA__) return resolve(window.__SANGJU_DATA__);
          const s = document.createElement("script");
          s.src = "data.js" + (v || "?") + (v ? "&" : "") + "nc=" + Date.now();
          s.async = true;
          s.onload = () => resolve(window.__SANGJU_DATA__ || null);
          s.onerror = () => resolve(null);
          (document.head || document.documentElement).appendChild(s);
        } catch (e2) { resolve(null); }
      });
      if (!d) throw e1;
    }
    /* 🏷 분야 이름 — 이 한 줄이 «단일 출처»의 전부다(2026-08-24).
       예전에는 app.js 안 POLICY_CATEGORIES 의 키를 썼는데, config.py 가 25개로 바뀐 뒤에도
       사본이 24개로 남아 «없어진 분야가 뜨고 새 분야 둘이 안 뜨는» 결함이 있었다.
       ⚠ 차례는 «가나다순»이다(config.py 의 생애주기 차례가 아니다).
          build_data.py 가 sort_key 로 정렬해 싣기 때문이고, 시민앱 분야 칩도 같은 차례라
          두 앱의 칩이 같은 순서로 늘어선다 — 담당자가 두 화면을 오갈 때 눈이 헤매지 않는다.
       ⚠⚠ 이 목록은 «실제로 쓰이는 분야 + ALWAYS_SHOW_CATEGORIES» 다(build_data.py 344~354행).
          곧, 사업이 «0건»인 분야는 여기 안 실린다. 지금은 25개가 모두 실려 있어 문제가 없지만,
          어떤 분야의 사업이 0건이 되면 그 분야가 칩에서 사라져 «새 사업에 붙일 수도 없게» 된다
          (그러면 영영 0건 — 스스로 굳어지는 결함). 그런 분야가 생기면 config.py 의
          ALWAYS_SHOW_CATEGORIES 에 넣으면 build_data.py 가 다시 실어 준다. */
    SJ_PROGRAM_TEAM = Object.create(null);
    if (Array.isArray(d.programs)) {
      for (let pi = 0; pi < d.programs.length; pi++) {
        const pg = d.programs[pi];
        const nm = normBenefitName(pg && pg["사업명"]);
        const tm = String((pg && pg["팀명"]) || "").trim();
        if (nm && tm && !(nm in SJ_PROGRAM_TEAM)) SJ_PROGRAM_TEAM[nm] = tm;
      }
    }
    PROGRAM_TEAM_READY = Object.keys(SJ_PROGRAM_TEAM).length > 0;
    SJ_CATEGORIES = Array.isArray(d.categories) ? d.categories.filter(Boolean) : [];
    SJ_REGIONS = Array.isArray(d.regions) ? d.regions.slice() : [];
    SJ_REGION_GROUPS = Array.isArray(d.region_groups) ? d.region_groups : [];
    SJ_REGION_ETC = String(d.region_etc || "");
    /* 🟢곳간이 2026-08-20 에 data.json 으로 실어 준 «판정용 표» 세 가지.
       ⛔ 이 표들을 JS 에 베껴 적지 마세요 — 파이썬 config.py 와 갈리는 순간
          엑셀·보고서와 화면의 숫자가 달라집니다. 반드시 여기서 받아 씁니다.
       ⚠ 옛 data.json(표가 없는 판본)을 물어도 앱이 죽지 않게 빈 값으로 떨어뜨린다.
          그때는 「낙동」·「낙양동」 같은 값만 미기재로 가고 나머지는 그대로 돈다. */
    SJ_REGION_ETC_WORDS = Array.isArray(d.region_etc_words) ? d.region_etc_words.slice() : [];
    SJ_REGION_ALIASES = (d.region_aliases && typeof d.region_aliases === "object") ? d.region_aliases : {};
    SJ_LEGAL_DONG = (d.region_legal_dong && typeof d.region_legal_dong === "object") ? d.region_legal_dong : {};
    REGION_READY = SJ_REGIONS.length > 0;
  } catch (e) {
    console.warn("[읍·면·동] 목록을 불러오지 못했습니다(차트만 생략):", e);
    // 반쯤 채워진 상태로 남겨 두면 «어떤 값은 알아보고 어떤 값은 못 알아보는» 어정쩡한
    // 집계가 된다 → 통째로 비워 «판정하지 않는다»를 분명히 한다.
    SJ_REGIONS = []; SJ_REGION_GROUPS = []; SJ_REGION_ETC = "";
    SJ_REGION_ETC_WORDS = []; SJ_REGION_ALIASES = {}; SJ_LEGAL_DONG = {};
    /* 🏷 분야도 비운다 → categoryKeys() 가 비상용 사본(25개)으로 떨어진다.
       ⚠ 반쯤 채워진 목록을 남기지 않는다 — 위 읍·면·동과 같은 원칙이다. */
    SJ_CATEGORIES = [];
    REGION_READY = false;
    /* 사업명→담당팀 표도 «통째로» 비운다 — 위 읍·면·동과 같은 원칙(반쯤 채우지 않는다).
       그러면 stats.js 가 예전처럼 «접수 스냅샷»만으로 센다(집계가 멈추지는 않는다). */
    SJ_PROGRAM_TEAM = Object.create(null);
    PROGRAM_TEAM_READY = false;
  }
  // stats.js(차트)와 화면이 «같은 규칙»을 쓰도록 한 곳에서만 내보낸다 — window.sjScopes 와 같은 방식.
  window.sjRegions = {
    ready: REGION_READY, list: SJ_REGIONS, groups: SJ_REGION_GROUPS,
    etc: SJ_REGION_ETC, unknown: REGION_UNKNOWN,
    etcWords: SJ_REGION_ETC_WORDS, aliases: SJ_REGION_ALIASES, legalDong: SJ_LEGAL_DONG,
    normalize: normalizeRegion, countBy: countByRegion, label: regionLabel,
  };
  /* 🏢 집계 전용 «지금 담당팀» 조회 — stats.js 의 담당팀 순위표만 쓴다.
     ⛔ 화면의 «접수 상세»에서 부르지 말 것(그 칸은 신청 시점 스냅샷이어야 한다). */
  window.sjBenefits = {
    ready: PROGRAM_TEAM_READY,
    n: Object.keys(SJ_PROGRAM_TEAM).length,
    teamOf(name) {
      const k = normBenefitName(name);
      return (k && SJ_PROGRAM_TEAM[k]) || "";
    },
  };
  if (A_LOADED) renderApplications();      // 이미 목록이 떠 있으면 정식 이름으로 다시 그린다
  return REGION_READY;
}

/* ══════════════════════════════════════════════════════════════════════
   💬 시민 안내문 «자주 쓰는 문장»(상용구)
   ────────────────────────────────────────────────────────────────────
   ★★ 문구를 고치는 곳은 «여기 한 곳»뿐입니다. ★★
      상주시가 공식 문안을 확정하면 아래 label(단추에 보이는 짧은 이름)과
      text(칸에 들어갈 문장)만 바꿔 주세요. 화면·검증 코드는 손댈 필요가 없습니다.
   ⚠ 개수는 «3개»가 상한입니다(규격서 §0 — 늘리면 안내문 칸 위가 복잡해집니다).
   ⚠ 여기 문장은 «시민이 그대로 읽는 글»입니다. 내부 판단·개인정보를 넣지 마세요.
   ⚠ 상용구를 넣어도 저장 시 «공개 확인 창»은 그대로 뜹니다(검토를 건너뛰지 않습니다).
   ⚠ 한 문장이 300자를 넘지 않게 하세요(칸의 상한이 300자입니다).
   ══════════════════════════════════════════════════════════════════════ */
const CITIZEN_REPLY_PRESETS = [
  { label: "접수 확인",
    text: "신청이 정상적으로 접수되었습니다. 담당자가 순서대로 검토한 뒤 결과를 안내드리겠습니다." },
  { label: "서류 보완",
    text: "제출하신 서류 가운데 확인이 필요한 부분이 있어 담당자가 연락드릴 예정입니다. 연락을 받으시면 보완 서류를 제출해 주세요." },
  { label: "심사 진행",
    text: "서류 확인이 끝나 심사가 진행 중입니다. 결과가 정해지는 대로 이 화면과 남겨 주신 연락처로 안내드리겠습니다." },
];

/* ══════════════════════════════════════════════════════════════════════
   ⏳ 정책제안 «경과일수» — A-09 (2026-08-24)
   ────────────────────────────────────────────────────────────────────
   ⛔ 경과일수를 DB 에 저장하지 않습니다. 저장하면 «어제 계산한 값»이 오늘도 그대로 남습니다.
      볼 때마다 created_at 에서 그 자리에서 셉니다 — 아래 식이 그것뿐입니다.
   ⚠ 셈법은 신청접수 overdueDays() 와 «같은 식»입니다(Math.floor(밀리초 차 / 86400000)).
      두 화면의 「N일 경과」가 다른 뜻이면 담당자가 두 번 배웁니다.
   ⚠ 결론이 난 제안(반영·불채택)에는 붙이지 않습니다 — 이미 끝난 일에 «며칠 지났다»는
      아무 뜻이 없습니다. 신청접수가 승인·반려에 안 붙이는 것과 같은 이유입니다.
      「보류」는 «아직 끝나지 않은» 상태라 붙입니다(그것이 오래 묵는 것이 문제이므로).
   ⚠ P_OVERDUE_DAYS = 1 → 「0일이면 배지 없음」(🟠단장 지시). 이 숫자 하나만 7 로 올리면
      신청접수와 «같은 기준»(7일 넘은 것만)이 됩니다. 바꿀 곳은 여기 한 줄뿐입니다.
   ══════════════════════════════════════════════════════════════════════ */
const P_PENDING_STATUSES = new Set(["접수", "검토중", "보류"]);
const P_OVERDUE_DAYS = 1;
function proposalDays(r) {
  const st = (r && r.status) || "접수";
  if (!P_PENDING_STATUSES.has(st)) return 0;
  if (!r || !r.created_at) return 0;
  const t = new Date(r.created_at);
  if (isNaN(t)) return 0;
  const d = Math.floor((Date.now() - t.getTime()) / 86400000);
  return d >= P_OVERDUE_DAYS ? d : 0;
}

/* ══════════════════════════════════════════════════════════════════════
   💬 정책제안 답변 «자주 쓰는 문장»(상용구) — A-08 (2026-08-24)
   ────────────────────────────────────────────────────────────────────
   ★★ 문구를 고치는 곳은 «여기 한 곳»뿐입니다. ★★
   ⚠ 신청접수의 CITIZEN_REPLY_PRESETS 와 «다른 표»입니다 — 그쪽은 「내 신청 현황」에
      뜨는 처리 안내이고, 이쪽은 정책제안 화면에 공개되는 «검토 결과»입니다.
      같은 문장을 두 곳에 쓰면 어느 쪽에서 읽어도 어색해집니다.
   ⚠ 개수는 «3개»가 상한입니다(규격서 §0). ⚠ 시민이 그대로 읽는 글입니다.
   ⚠ 상용구를 넣어도 저장 시 검증(반영·불채택이면 답변 필수)은 그대로 돕니다.
   ══════════════════════════════════════════════════════════════════════ */
const PROPOSAL_REPLY_PRESETS = [
  { label: "검토 착수",
    text: "소중한 의견 감사합니다. 담당 부서에서 제안 내용을 검토하고 있으며, 결과가 정해지는 대로 이 화면에 답변드리겠습니다." },
  { label: "반영 예정",
    text: "제안해 주신 내용은 타당하다고 판단되어 관련 계획에 반영할 예정입니다. 추진 일정은 확정되는 대로 시정 소식으로 안내드리겠습니다." },
  { label: "어려운 사유",
    text: "검토 결과, 관련 법령·예산 여건상 지금 바로 시행하기는 어렵다고 판단되었습니다. 여건이 갖추어지면 다시 검토하겠습니다. 관심 가져 주셔서 감사합니다." },
];

const OVERDUE_DAYS = 7;
function overdueDays(r) {
  const st = (r && r.status) || "접수";
  if (st !== "접수" && st !== "심사중") return 0;
  if (!r || !r.created_at) return 0;
  const t = new Date(r.created_at);
  if (isNaN(t)) return 0;
  const d = Math.floor((Date.now() - t.getTime()) / 86400000);
  return d >= OVERDUE_DAYS ? d : 0;
}

/* ══════════════════════════════════════════════════════════════════════
   🔔 새 접수 소리 알림 — ★ 2026-08-24 양호창님 확정: «기본은 켜짐».
   ────────────────────────────────────────────────────────────────────
   ⚠⚠ 예전 판(기본 꺼짐)과 «반대»입니다. 되돌리지 마세요.
      바뀐 이유 — 접수 처리는 공무원 1순위 업무인데, 기본이 꺼짐이면 이 버튼을 찾아 켠
      사람만 알림을 받는다. 「모르는 채 놓치는 것」이 「시연장에서 한 번 울리는 것」보다 나쁘다.

   울리는 자리는 «둘» — 사업신청(applications) · 정책제안(proposals).
      ⚠ A-12 이전에는 subscribeApplicationsRealtime() 에만 걸려 있어 정책제안은 소리 없이
        들어왔다. 두 곳 다 걸어 두었으니 한쪽만 지우지 말 것.

   ⛔ 브라우저 자동재생 정책 — 이 대목을 지우면 「켜 놨는데 안 울린다」가 됩니다.
      크롬·엣지·사파리는 «그 페이지에서 사용자가 한 번이라도 누르기 전»에는 소리를 막는다.
      그래서 AudioContext 는 만들어 둬도 state 가 "suspended" 로 잠들어 있다.
      → primeAudio() 를 «처음 누르는 몸짓»(pointerdown·keydown, 로그인 클릭 포함)에 한 번 건다.
      → 그래도 못 깨우면 SOUND_BLOCKED 를 세워 «화면 글자»로 알린다(#btnSoundWarn).
   ⚠ 소리 파일을 내려받지 않는다 — WebAudio 로 짧은 두 음을 그 자리에서 만든다(CSP 무관).
   ⚠ 소리만으로 알리지 않는다 — 「새 접수 N건」 띠가 언제나 함께 뜬다(KWCAG 5.4.1).
      그래서 소리가 통째로 막혀도 «놓치는 정보»는 없다. 소리는 거들 뿐이다.
   ⚠ 첫 화면에서 밀려 있던 알림으로는 울리지 않는다(A_LOADED·P_LOADED 안에서만 부른다).
   ══════════════════════════════════════════════════════════════════════ */
/* 🤫 «내가 방금 쓴 것»이 실시간으로 되돌아온 것에는 울리지 않는다 (2026-08-24).
   왜 필요한가 — 공무원이 상태를 바꾸거나 댓글을 올리면 그 UPDATE·INSERT 가 실시간 구독으로
   «자기 자신에게» 되돌아온다. 그때도 울리면 「새 접수가 왔다」는 소리가 «내 저장»에 나서,
   소리의 뜻이 「누가 뭔가 했다」로 흐려진다. 알림음은 «남이 새로 보낸 것»에만 울려야 한다.
   ⚠ 화면 띠(「새 제안·변경 N건」)는 그대로 뜬다 — 자료가 바뀐 것은 사실이므로 숨기지 않는다.
      막는 것은 «소리»뿐이다.
   ⚠ 2.5초 — 왕복이 보통 0.2~0.8초다. 넉넉히 잡되, 그 사이 «진짜 새 제안»이 들어오면
      소리 하나를 놓칠 수 있다(띠는 뜬다). 소리를 한 번 덜 내는 쪽이 거짓으로 울리는 것보다 낫다. */
let _selfWriteAt = 0;
function markSelfWrite() { _selfWriteAt = Date.now(); }
function isSelfEcho() { return Date.now() - _selfWriteAt < 2500; }

const SOUND_KEY = "sangju_admin_new_sound";
// ★ 기본 켜짐. 저장된 값이 "0" 일 때만(= 사용자가 «직접 껐을» 때만) 꺼진다.
let SOUND_ON = true;
let _audioCtx = null;
let SOUND_BLOCKED = false;     // 켜져 있는데 브라우저가 소리를 막고 있는 상태
let _soundWarned = false;      // 같은 안내를 되풀이 낭독하지 않기 위한 빗장
function loadSoundPref() {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    SOUND_ON = (v === null || v === undefined) ? true : v === "1";
  } catch (e) { SOUND_ON = true; }   // localStorage 를 못 써도 «기본 켜짐»은 지킨다
  return SOUND_ON;
}
/* 소리 장치를 «깨운다». 사용자의 몸짓 안에서 불러야 실제로 깨어난다.
   반환값 — 지금 소리를 낼 수 있으면 true. */
function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    // ⚠ AudioContext 는 «몸짓 안»에서만 만든다 — 화면이 뜨자마자 만들면 크롬이
    //    「AudioContext was not allowed to start」 경고를 남긴다.
    if (!_audioCtx) _audioCtx = new AC();
    if (_audioCtx.state === "running") return true;
    if (_audioCtx.resume) {
      /* ⚠ resume() 은 «약속(Promise)»이다 — 바로 다음 줄에서 state 를 읽으면 아직
         "suspended" 일 수 있다. 그것만 보고 «막혔다»고 단정하면, 사용자가 방금 켰는데도
         「소리를 막았습니다」가 잠깐 떴다 사라진다. → 깨어나면 그때 스스로 거둔다. */
      const p = _audioCtx.resume();
      if (p && p.then) p.then(() => {
        if (_audioCtx && _audioCtx.state === "running" && SOUND_BLOCKED) {
          SOUND_BLOCKED = false; renderSoundBtn();
        }
      }, () => { /* 깨우기 거부 — 화면 안내는 그대로 둔다 */ });
    }
    return _audioCtx.state === "running";
  } catch (e) { _audioCtx = null; return false; }
}
/* 첫 몸짓 한 번에 소리 장치를 깨운다 — 로그인 버튼 클릭도 여기에 걸린다.
   ⚠ capture 로 받는 이유: 다른 처리기가 stopPropagation 해도 놓치지 않기 위함.
   ⚠ passive:true — 스크롤·터치를 1ms 도 늦추지 않는다(아무것도 막지 않는 처리기다).
   ⚠ 깨어날 때까지 «떼지 않는다» — 한 번 만에 깨지 못하는 브라우저가 있어,
      다음 몸짓에서 다시 시도해야 한다. 깨어나면 그 자리에서 스스로 떨어진다. */
function installAudioPrimer() {
  const once = () => {
    if (!primeAudio()) return;
    SOUND_BLOCKED = false; renderSoundBtn();
    document.removeEventListener("pointerdown", once, true);
    document.removeEventListener("keydown", once, true);
  };
  document.addEventListener("pointerdown", once, { capture: true, passive: true });
  document.addEventListener("keydown", once, { capture: true, passive: true });
}
function renderSoundBtn() {
  const b = $("#btnSound"), lab = $("#btnSoundLab"), warn = $("#btnSoundWarn");
  if (!b) return;
  b.setAttribute("aria-checked", SOUND_ON ? "true" : "false");
  // 「켜짐/꺼짐」 — 색이 아니라 «글자»가 상태를 말한다(KWCAG 5.4.1)
  if (lab) lab.textContent = SOUND_ON ? "켜짐" : "꺼짐";
  // 막혔다는 안내는 «켜 둔 사람»에게만 뜻이 있다(꺼 뒀으면 안 울리는 것이 정상)
  if (warn) warn.hidden = !(SOUND_ON && SOUND_BLOCKED);
}
function toggleSound() {
  SOUND_ON = !SOUND_ON;
  try { localStorage.setItem(SOUND_KEY, SOUND_ON ? "1" : "0"); } catch (e) {}
  if (SOUND_ON) {
    // «켜는 몸짓» 이 있는 지금이 소리 장치를 깨울 가장 좋은 순간이다.
    SOUND_BLOCKED = !primeAudio();
    renderSoundBtn();
    playNewBeep();                                   // 「이런 소리가 납니다」 미리듣기 1회
    announce(SOUND_BLOCKED
      ? "새 접수 소리 알림을 켰습니다. 다만 브라우저가 소리를 막고 있어, 화면을 한 번 누른 뒤부터 울립니다."
      : "새 접수 소리 알림을 켰습니다. 새 신청이나 새 정책제안이 오면 짧은 소리로 알립니다.");
  } else {
    renderSoundBtn();
    announce("새 접수 소리 알림을 껐습니다. 소리를 꺼도 «새 접수 N건» 알림 띠는 그대로 뜹니다.");
  }
}
// 짧은 «띵-딩» 두 음(총 0.32초). 저감 모션 설정과 무관하지만 볼륨은 아주 낮게 둔다.
function playNewBeep() {
  if (!SOUND_ON) return;
  // 아직 못 깨웠으면 여기서 한 번 더 시도한다 — 그 사이 사용자가 화면을 눌렀을 수 있다.
  if (!_audioCtx || _audioCtx.state !== "running") {
    if (!primeAudio()) {
      /* 못 울린다 → «화면으로» 알린다. 정보 자체는 「새 접수 N건」 띠가 이미 전하고 있으므로
         여기서는 «소리가 왜 안 나는지»만 덧붙인다. 낭독은 딱 한 번만(잔소리가 되지 않게). */
      SOUND_BLOCKED = true; renderSoundBtn();
      if (!_soundWarned) {
        _soundWarned = true;
        announce("새 접수가 있습니다. 브라우저가 소리를 막고 있어 알림음은 울리지 않았습니다. 화면을 한 번 누르면 다음부터 울립니다.");
      }
      return;
    }
    SOUND_BLOCKED = false; renderSoundBtn();
  }
  try {
    const t0 = _audioCtx.currentTime;
    [[880, 0], [1174.7, 0.16]].forEach(([hz, at]) => {
      const osc = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + at + 0.02);   // 최대 6% — 사무실에서 거슬리지 않게
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.15);
      osc.connect(g); g.connect(_audioCtx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + 0.16);
    });
  } catch (e) { /* 소리를 못 내도 업무는 그대로 — 화면 띠가 이미 알리고 있다 */ }
}

// 🔄 새로고침·창 닫기 — 앱 «밖»으로 나가는 경로도 똑같이 막는다(브라우저 기본 확인창).
window.addEventListener("beforeunload", (e) => {
  if (LOGGING_OUT) return;              // 로그아웃·«로그인 화면으로»는 사용자가 스스로 고른 이탈
  if (!isModalDirty(_activeModal)) return;
  e.preventDefault();
  e.returnValue = "";                   // 크롬 등 구형 규약 호환(문구는 브라우저가 정한다)
});

// ---------- 버전 정보 + 버전별 개선사항(체인지로그) ----------
// 데이터 단일 소스: version.js의 window.APP_VERSION / window.APP_CHANGELOG.
function renderChangelog() {
  const box = $("#changelogBody");
  if (!box) return;
  const logs = window.APP_CHANGELOG || [];
  box.innerHTML = "";
  logs.forEach((e) => {
    const entry = document.createElement("div");
    entry.className = "cl-entry";

    const head = document.createElement("div");
    head.className = "cl-head";
    const ver = document.createElement("span");
    ver.className = "cl-ver";
    ver.textContent = "v" + (e.version || "");
    head.appendChild(ver);
    if (e.date) {
      const date = document.createElement("span");
      date.className = "cl-date";
      date.textContent = e.date;
      head.appendChild(date);
    }
    entry.appendChild(head);

    if (e.title) {
      const t = document.createElement("div");
      t.className = "cl-title";
      t.textContent = e.title;
      entry.appendChild(t);
    }

    const ul = document.createElement("ul");
    ul.className = "cl-items";
    (e.items || []).forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    });
    entry.appendChild(ul);
    box.appendChild(entry);
  });
}

/* ── 🧪 테스트 모드 «로그인 없이 둘러보기» ──────────────────────────────
   ★ 스위치는 «두 곳»뿐이다 — 둘 다 config.js 에 있다.
       ① TEST_MODE_ALLOW_GUEST     — 둘러보기로 «들어올 수» 있는가
       ② TEST_MODE_GUEST_CAN_WRITE — 들어온 사람이 «저장할 수» 있는가
     화면은 그 값을 읽어 단추를 내보낼 뿐, 스스로 판단하지 않는다.
     값이 없는 옛 config.js 에서는 undefined → 둘 다 «안 된다»(닫힌 쪽이 안전).

   ⭐⭐ 2026-08-25 정책 변경 (양호창님)
       「시연 및 테스트를 위해서 비로그인으로 접속하더라도 **삭제기능들을 제외하고는**
        대부분의 기능을 모두 둘러볼 수 있어야 해.」
     → 예전 기준(모든 쓰기 차단)에서 **«지우는 것만» 차단**으로 좁혔다.
       · 열린 것 : 새 사업 올리기 · 사업/제안/접수 저장 · 서식 등록 · 일괄 상태 변경 · 댓글 감추기
       · 막은 것 : 삭제 «전부»(사업·접수·제안·서식·댓글) + 계정 관리·비밀번호 변경
         ⚠ 비밀번호 변경을 막은 채로 두는 까닭 — 로그인 화면의 둘러보기 설명이
           「계정 관리·비밀번호 변경 같은 관리자 기능은 잠깁니다」라고 이미 약속하고 있다.
           화면이 한 약속과 어긋나지 않는 쪽을 골랐다.
         ⚠ «되돌릴 수 있는가»가 기준이다 — 댓글 «감추기»는 옆에 「다시 보이기」가 있으므로 열고,
           «삭제»는 되돌릴 수 없으므로 막는다.

   ⛔⛔ 아주 중요 — ②가 «기본 꺼짐»인 까닭 (2026-08-25 실측)
     이 앱은 브라우저에서 **anon 키**로 서버에 말한다. 그런데 지금 서버는 anon 의 쓰기를
     표마다 «전부» 회수해 두었다. 실제 응답으로 확인한 것이다(문서가 아니라 응답을 믿는다) —
         benefits   INSERT/UPDATE/DELETE → 401 · 42501
         proposals  INSERT/UPDATE/DELETE → 401 · 42501
         applications      UPDATE/DELETE → 401 · 42501  (INSERT 는 RLS 로 시민 신청만 허용)
         proposal_comments UPDATE/DELETE → 401 · 42501
         admin_audit       INSERT        → 401 · 42501
     즉 «단추만» 열면 게스트가 저장을 누를 때마다 서버가 영어 권한 오류로 거절한다.
     그것은 이 저장소가 가장 경계하는 「눌러 봐야 실패하는 단추」다 — 방향만 반대일 뿐 같은 사고다.
     그래서 서버에 GRANT 가 들어가기 «전»에는 단추를 내보내지 않고, 왜 없는지를 글자로 말한다.
     ⇒ 서버 쪽이 열리면 config.js 의 TEST_MODE_GUEST_CAN_WRITE 를 true 로 «한 줄» 바꾸면 된다.
       (PC앱은 파이썬이 관리자 전용 키(service-role)로 말해 RLS 를 지나가므로 이 제약이 없다 — 그래서
        같은 지시라도 PC앱 쪽은 곧바로 열리고 이 앱만 서버 작업을 기다린다.)

   ★ 화면에서 감추는 것은 «안내»이지 «방어»가 아니다. 실제 차단은 Supabase RLS·권한이 한다.
   ⚠ PC앱(webui/app.js) 의 같은 덩어리와 문구·구조를 맞춰 두었다. 한쪽만 고치지 말 것. */
let IS_GUEST = false;
/* 🔴 읽음/안읽음 저장 칸을 가르는 «담당자 이메일». showApp() 이 한 번 채운다(2026-08-26).
   ⚠ 화면에는 절대 찍지 않는다 — reads.js 의 저장 칸 이름표로만 쓴다. */
let READS_USER = "";
const GUEST_WRITE_MSG =
  "테스트 모드(로그인 없이 둘러보기)에서는 저장·수정·삭제를 할 수 없습니다. "
  + "실제 처리는 담당자 계정으로 로그인한 뒤 이용해 주세요.";
/* ⭐ 문구는 PC앱(webui)과 «글자 단위로» 같다 (2026-08-25 · 🟠단장 통일안). 한쪽만 고치지 말 것.
   ① 화면에 남기는 한 줄(.guest-ro) — 사업·접수·제안·서식 네 자리 전부 이 문장 하나다. */
const GUEST_RO_LINE =
  "둘러보기(테스트) 중에는 지울 수만 없습니다. 저장·수정은 그대로 해 보실 수 있습니다.";

/* ② 통로를 직접 부른 경우(콘솔 등) 돌려주는 차단 문구 — «무엇을» 못 하는지 이름을 넣는다. */
const GUEST_FEATURE_NAME = {
  benefits: "지원사업 삭제",
  applications: "접수 삭제",
  proposals: "정책제안 삭제",
  proposal_comments: "댓글 삭제",
  submissions: "첨부파일 파기",
};
function guestDeleteMsg(what) {
  return "둘러보기(테스트) 중에는 «" + (what || "삭제") + "» 기능을 쓸 수 없습니다.\n"
       + "지울 수만 없습니다. 저장·수정은 그대로 해 보실 수 있습니다.\n"
       + "지우려면 담당자 계정으로 로그인해 주세요.";
}
const GUEST_DELETE_MSG = guestDeleteMsg("삭제");

/* 🧪 둘러보기가 «불러도 되는» RPC — 읽기 전용인 것만 이름으로 적는다.
   ⛔ 목록에 없는 RPC 는 전부 막힌다(닫힌 쪽이 기본값).
     · demo_applications — 둘러보기 예시 신청 10건. 표를 하나도 읽지 않는 고정 목록이라
       구조적으로 개인정보가 샐 수 없다(supabase/둘러보기_예시자료_260825.sql).
   ⚠ 새 «읽기» RPC 를 쓰게 되면 여기에 이름을 더한다. 목록을 없애고 전부 여는 쪽으로
     되돌리지 말 것 — 댓글 감추기(set_comment_hidden)·삭제(delete_comment_admin) 가
     «같은 통로»를 쓰므로, 열면 지우는 길이 함께 열린다. */
const GUEST_RPC_ALLOW = ["demo_applications"];

/* 🗑 «지우는» RPC — 둘러보기에게 «언제나» 막는다. 쓰기가 열려 있어도 이 목록은 그대로다.
   ⛔ 표(sb.from)의 delete 를 막아 놓고 여기를 비워 두면, «함수로 지우는» 길만 열린 채 남는다.
     delete_comment_admin 이 정확히 그 길이다(시민 댓글을 답글까지 함께 영영 지운다).
   ⚠ 새 «지우는» RPC 를 만들면 반드시 여기에 이름을 더할 것. */
const GUEST_DELETE_RPC = ["delete_comment_admin"];

/* 🔎 «지우는 효과를 내는 통로» 전수 확인 (2026-08-25 · 🟠단장 요청)
     이 앱에서 삭제로 이어지는 길을 모두 훑어 다음과 같이 갈랐다.
       막는다 : benefits/applications/proposals/proposal_comments 의 delete()
              · storage(submissions) 의 remove()
              · delete_comment_admin RPC
              · proposal_comments.is_deleted 를 켜는 update(소프트 삭제)
       연다   : 저장·수정 계열 전부 · 일괄 «상태» 변경 · 댓글 감추기(set_comment_hidden)
     ⭐ PC앱의 «홈페이지 연동»(#btnSync)은 이름과 달리 «중복·만료 사업을 지우고 클라우드에서도
        지우고 시민앱 배포까지» 나가므로 삭제 계열로 취급해 막는다 — 그런데
        ⛔ 이 앱(공무원앱)에는 그 기능이 «없다». app.js·index.html 어디에도 #btnSync 가 없고,
           prune·만료정리·중복제거 같은 «대량 정리» 통로도 없다(2026-08-25 grep 확인).
           → 여기서 따로 막을 것이 없다. 나중에 이 앱에 연동을 옮겨 오면 그때
             GUEST_DELETE_* 목록에 반드시 함께 넣을 것.
     ⚠ 일괄 «상태» 변경(applyBulkStatus)은 열어 둔다 — 결과가 삭제가 아니라 상태값 수정이고,
        되돌릴 수 있다(다시 상태를 바꾸면 된다). 「되돌릴 수 있는가」가 이 앱의 잣대다. */

/* 🗑 «update 로 지우는» 칸 — 소프트 삭제. 겉모습은 수정이지만 결과는 삭제다.
   · proposal_comments.is_deleted — 본인이 지웠으나 답글이 달려 «자리만» 남은 상태
     (supabase/제안댓글_260824.sql:170). 이 칸을 켜는 것은 «지우는 일»이다.
   ⚠ 새 소프트 삭제 칸이 생기면 여기에 더할 것. */
const GUEST_DELETE_FIELDS = ["is_deleted"];

function guestAllowed() {
  try { return typeof TEST_MODE_ALLOW_GUEST !== "undefined" && TEST_MODE_ALLOW_GUEST === true; }
  catch (e) { return false; }
}

/* ⭐ 둘러보기 판정은 «이 세 함수»가 정본이다 — 화면 어디서도 IS_GUEST 를 직접 보고
   저장 단추를 감추지 말 것. 기준이 또 바뀌면 여기만 고치면 된다(2026-08-25).
     guestCanWrite()  — 서버가 게스트의 쓰기를 허락하는가(config 스위치)
     guestSaveBlockedByServer()   — «저장» 단추를 감춰야 하는가
     guestNoDelete()  — «삭제» 단추를 감춰야 하는가 (게스트면 언제나 참) */
function guestCanWrite() {
  try { return typeof TEST_MODE_GUEST_CAN_WRITE !== "undefined" && TEST_MODE_GUEST_CAN_WRITE === true; }
  catch (e) { return false; }
}
/* ⚠⚠ 이름을 «guestNoWrite» 로 되돌리지 마세요 (2026-08-25 · 🟠단장 지적).
     「못 쓴다」로만 읽히는 이름이 남으면, 다음 사람이 정책을 잘못 읽고
     저장 단추를 다시 감춥니다. 이 함수가 참인 까닭은 «정책»이 아니라
     «서버가 아직 anon 쓰기를 허락하지 않아서»뿐입니다 — 이름이 그것을 말해야 합니다.
   ⛔ 서버가 열리고 config 스위치를 켜면 이 함수는 «언제나 거짓»이 되어
     저장 단추가 담당자와 똑같이 보입니다. 그때 이 함수를 지워도 됩니다. */
function guestSaveBlockedByServer() { return IS_GUEST && !guestCanWrite(); }
/* 🗑 «지우는 일»은 정책상 언제나 막힌다 — 서버 상태와 무관하다. */
function guestNoDelete() { return IS_GUEST; }
/* 🧪 지금 «예시 목록»을 보고 있는가 = anon 둘러보기인가.
   시연 계정으로 로그인한 둘러보기는 «진짜 표»를 읽으므로 예시가 아니다.
   ⛔ 이 구분을 빼면 화면이 진짜 접수를 두고 「예시 자료입니다」라고 거짓말한다. */
function guestUsesDemoList() { return IS_GUEST && !GUEST_SIGNED_IN; }

/* 🧪 둘러보기가 «무엇을 못 하는지» 한 문장 — 정책이 바뀌면 여기만 고친다.
   ⛔ index.html 에 글자를 박아 두지 않는다. 스위치(TEST_MODE_GUEST_CAN_WRITE)에 따라
      사실이 달라지므로, 화면이 «지금 사실»과 어긋나면 그것이 곧 결함이다. */
function guestLimitText() {
  return guestCanWrite()
    ? "지우는 일(삭제)과 계정 관리·비밀번호 변경은 잠깁니다. 저장·수정은 그대로 해 보실 수 있습니다."
    : "저장·삭제와 계정 관리·비밀번호 변경은 잠깁니다.";
}

// 로그인 카드의 «둘러보기» 덩어리 — 스위치가 켜져 있을 때만 보인다.
function paintGuestGate() {
  const box = $("#guestWrap");
  if (box) box.classList.toggle("hidden", !guestAllowed());
  const hint = $("#guestGateHint");
  if (hint) hint.textContent = "담당자 권한으로만 둘러볼 수 있고, " + guestLimitText()
    + " 접속기록에는 «게스트»로 남습니다.";
}

// 본문 맨 위 «테스트 모드» 띠 — 게스트로 들어와 있는 동안에만 보인다.
function paintGuestNotice() {
  const box = $("#guestNotice");
  if (box) box.classList.toggle("hidden", !IS_GUEST);
  const what = $("#guestNoticeWhat");
  if (what) what.textContent = guestLimitText();
}

/* 관리자 전용·«쓰는» 기능 잠금 — 아예 내보내지 않는다.
   ⚠ 눌러 봐야 세션이 없어 실패할 조작을 남겨 두지 않는다(막다른 길 금지).
     로그아웃은 남긴다 — 테스트 모드를 빠져나가 로그인 화면으로 가는 유일한 길이다.

   ⭐⭐ «양방향» 이어야 한다 (A-2 · 2026-08-25)
     예전에는 `if (!IS_GUEST) return;` 로 시작해 «잠그는 갈래»만 있었다.
     지금은 로그아웃이 location.reload() 라 우연히 안전할 뿐, 그 한 줄을 빼는 순간
     정상 담당자의 화면에도 잠금이 그대로 남아 «저장·삭제가 조용히 사라진다».
     그래서 값을 «지정»한다 — `hidden = IS_GUEST` 는 게스트면 감추고 담당자면 되돌린다.
     ⛔ `if (!IS_GUEST) return;` 로 되돌리지 마세요. 「보안을 조이다 정상 이용자를 막는」
        것이 이 저장소에서 가장 흔한 사고입니다.
   ⚠ 여기서 다루는 것은 index.html 에 «항상 있는» 요소뿐이다.
     모달 안 단추(#mSave·#pmSave·#amSave·#formsUpload)는 열 때마다 새로 그려지므로
     각 openXxx() 가 «그리지 않는» 방식으로 막는다(삭제 단추와 같은 방식). */
function paintGuestLocks() {
  /* 🔑 계정 관리·비밀번호 변경 — 게스트면 «언제나» 잠근다(쓰기가 열려 있어도).
     로그인 화면의 둘러보기 설명이 그렇게 약속하고 있다(위 머리말 참조). */
  const pw = $("#btnChangePw");
  if (pw) pw.hidden = guestNoDelete();
  /* ➕ 새 사업 올리기 · ☑ 일괄 상태 변경 — «저장» 계열이므로 쓰기 개방 여부를 따른다. */
  const add = $("#btnAdd");
  if (add) add.hidden = guestSaveBlockedByServer();
  const bulk = $("#aBulkApply");
  if (bulk) bulk.hidden = guestSaveBlockedByServer();
}

/* 쓰기 차단 — «한 곳»에서 막는다.
   서버(RLS)가 이미 막지만, 그때 나오는 말은 영어 권한 오류라 담당자가 이해할 수 없다.
   여기서 먼저 걸러 «왜 안 되는지»를 우리 말로 돌려준다.
   ⚠ 예외를 던지지 «않고» supabase-js 와 같은 모양({data,error})으로 돌려준다 —
     기존 호출부의 오류 처리(res.error 검사)가 그대로 동작해야 하기 때문이다.
   ⚠ .insert(...).select() 처럼 이어 부르는 곳이 있으므로 체인 메서드도 흉내 낸다. */
function _guestBlocked(msg) {
  const payload = {
    data: null,
    error: { message: msg || GUEST_WRITE_MSG, code: "GUEST_READONLY" }
  };
  const stub = {
    then: (ok, no) => Promise.resolve(payload).then(ok, no),
    catch: (f) => Promise.resolve(payload).catch(f),
    finally: (f) => Promise.resolve(payload).finally(f)
  };
  ["select", "eq", "neq", "in", "is", "match", "order", "limit", "single", "maybeSingle"]
    .forEach((m) => { stub[m] = () => stub; });
  return stub;
}

/* 🔓 되돌리기용 원본 보관 (A-2 ② · 2026-08-25)
   ⛔ 예전에는 sb.from·sb.rpc·sb.storage.from 을 «영구히» 덮어써 되돌릴 길이 없었다.
      로그아웃이 location.reload() 라서만 안전했을 뿐이라, 그 한 줄이 사라지면
      정상 담당자의 모든 저장·삭제가 「테스트 모드에서는…」 안내와 함께 조용히 막힌다.
   ⚠ «bind 하기 전»의 원본 함수를 그대로 담아 둔다 — 되돌릴 때 identity 까지 원래대로. */
let _GUEST_GUARD_ORIG = null;

function installGuestReadOnlyGuard() {
  if (installGuestReadOnlyGuard._on) return;
  installGuestReadOnlyGuard._on = true;
  try {
    const rawFrom = sb.from;
    const rawRpc = (typeof sb.rpc === "function") ? sb.rpc : null;
    const rawStorageFrom = (sb.storage && typeof sb.storage.from === "function") ? sb.storage.from : null;
    _GUEST_GUARD_ORIG = { from: rawFrom, rpc: rawRpc, storageFrom: rawStorageFrom };
    /* ⭐ 차단 «범위»는 여기 세 줄이 정한다 (2026-08-25 정책 변경).
         · 쓰기가 열려 있으면(guestCanWrite) → «지우는 것»만 막는다.
         · 아직 닫혀 있으면              → 예전처럼 쓰기를 통째로 막는다.
       ⛔ 어느 쪽이든 delete 는 «반드시» 목록에 있다. 빼지 마세요. */
    const canWrite = guestCanWrite();
    const TABLE_BLOCK = canWrite ? ["delete"] : ["insert", "update", "upsert", "delete"];
    const STORE_BLOCK = canWrite ? ["remove"] : ["upload", "remove", "move", "copy"];
    const WHY = canWrite ? GUEST_DELETE_MSG : GUEST_WRITE_MSG;

    const origFrom = rawFrom.bind(sb);
    sb.from = function (table) {
      const b = origFrom(table);
      const feat = GUEST_FEATURE_NAME[String(table)] || "삭제";
      TABLE_BLOCK.forEach((m) => {
        if (typeof b[m] === "function") {
          b[m] = () => _guestBlocked(m === "delete" ? guestDeleteMsg(feat) : WHY);
        }
      });
      /* 🗑 «update 로 지우는» 길 — 소프트 삭제(GUEST_DELETE_FIELDS)를 막는다.
         쓰기를 열어 주면 update 는 통과하는데, is_deleted=true 는 겉만 수정이고
         결과는 삭제다. 그 한 칸이 실린 update 만 골라 돌려보낸다.
         ⚠ 쓰기가 닫혀 있을 때는 위에서 update 자체가 이미 막혔으므로 이 갈래를 타지 않는다. */
      if (canWrite && typeof b.update === "function") {
        const origUpdate = b.update.bind(b);
        b.update = function (patch) {
          const hit = patch && typeof patch === "object" &&
            GUEST_DELETE_FIELDS.some((k) => Object.prototype.hasOwnProperty.call(patch, k));
          return hit ? _guestBlocked(guestDeleteMsg(feat)) : origUpdate(patch);
        };
      }
      return b;
    };
    /* 📞 RPC — sb.from() 과 «같은 쓰기 통로»다. 여기를 비워 두면 표 쓰기를 막아 놓고
       «함수로 지우는» 길만 열린 채 남는다(댓글 감추기·삭제가 정확히 그 길이다).
       ⚠ 서버는 이미 막고 있다 — set_comment_hidden·delete_comment_admin 은 anon·public 에서
         execute 를 회수했고(supabase/권한정리_260824.sql [1] · 실행 완료), 함수 본문에도
         「auth.role() <> 'authenticated' → raise」 가 있다. 여기서 한 번 더 막는 까닭은
         sb.from 과 «같다» — 서버가 돌려주는 영어 권한 오류 대신 우리 말로 알려 주기 위해서다.
       ⚠ 읽기 전용 RPC(GUEST_RPC_ALLOW)는 통과시킨다 — 안 그러면 둘러보기 예시 목록이
         통째로 깨진다(apply_client.js 의 demo_applications). */
    if (rawRpc) {
      const origRpc = rawRpc.bind(sb);
      sb.rpc = function (fn, args, opts) {
        const name = String(fn);
        // ① «지우는» 함수는 언제나 막는다 — 쓰기가 열려 있어도 예외가 없다.
        if (GUEST_DELETE_RPC.indexOf(name) >= 0) return _guestBlocked(guestDeleteMsg("댓글 삭제"));
        // ② 쓰기가 열려 있으면 나머지는 통과(댓글 감추기 set_comment_hidden 등).
        if (canWrite) return origRpc(fn, args, opts);
        // ③ 아직 닫혀 있으면 «읽기 전용»으로 이름을 적어 둔 것만 통과.
        if (GUEST_RPC_ALLOW.indexOf(name) >= 0) return origRpc(fn, args, opts);
        return _guestBlocked(GUEST_WRITE_MSG);
      };
    }
    if (rawStorageFrom) {
      const origStorage = rawStorageFrom.bind(sb.storage);
      sb.storage.from = function (bucket) {
        const s = origStorage(bucket);
        STORE_BLOCK.forEach((m) => {
          if (typeof s[m] === "function") {
            const why = (m === "remove") ? guestDeleteMsg(GUEST_FEATURE_NAME[String(bucket)] || "첨부파일 파기") : WHY;
            s[m] = () => Promise.resolve({ data: null, error: { message: why } });
          }
        });
        return s;
      };
    }
  } catch (e) {
    // 막지 못했어도 서버(RLS)가 여전히 막는다 — 앱을 멈추지는 않는다.
    console.warn("[테스트 모드] 쓰기 차단 설치 실패:", e);
  }
}

/* 🔓 쓰기 차단 해제 — «정상 담당자로 로그인했을 때만» 부른다 (A-2 ② · 2026-08-25).
   ⛔ 이 함수를 지우지 마세요. 이것이 없으면 게스트 잠금이 «단방향»이 되어,
      로그아웃이 새로고침을 그만두는 순간 담당자의 저장·삭제가 통째로 막힙니다.
   ⚠ 설치한 적이 없으면 아무 일도 하지 않는다(멱등). */
function uninstallGuestReadOnlyGuard() {
  if (!installGuestReadOnlyGuard._on) return;
  try {
    const o = _GUEST_GUARD_ORIG;
    if (o) {
      if (o.from) sb.from = o.from;
      if (o.rpc) sb.rpc = o.rpc;
      if (o.storageFrom && sb.storage) sb.storage.from = o.storageFrom;
    }
  } catch (e) {
    console.warn("[테스트 모드] 쓰기 차단 해제 실패:", e);
  }
  _GUEST_GUARD_ORIG = null;
  installGuestReadOnlyGuard._on = false;
}

/* 🧪 둘러보기가 «시연 전용 계정»으로 로그인해 들어왔는가.
   · true  = 진짜 계정(authenticated). 서버가 RLS 로 판단하므로 진짜 접수 목록을 읽는다.
   · false = anon. 예전 그대로 demo_applications() 예시 10건을 읽는다.
   ⚠ 어느 쪽이든 IS_GUEST 는 true 고 화면 가드(guestNoDelete)도 그대로다 —
     서버 차단은 «두 번째 그물»이지 첫 번째가 아니다(2026-08-25 🩷자물쇠 규약). */
let GUEST_SIGNED_IN = false;

/* 🔑 시연 계정 로그인 «시도» — 실패해도 절대 진입을 막지 않는다.
   ⭐⭐ 이 함수의 존재 이유가 곧 그 «절대 조건»이다 (2026-08-25 양호창님)
       「시연과 테스트를 위해서 게스트모드로 비로그인 접속은 그대로 잘 돌아가야 해.」
     계정이 아직 없거나(값이 빈 문자열) · 비밀번호가 틀렸거나 · 서버가 답을 안 해도
     조용히 false 를 돌려주고, 부르는 쪽은 «예전과 똑같은» anon 둘러보기로 이어 간다.
   ⛔ 여기서 err.textContent 로 실패를 알리거나 return 으로 진입을 끊지 마세요.
      로그인 실패 한 번에 시연이 통째로 멈춥니다.
   ⚠ 값이 비어 있으면 «서버를 부르지도 않는다» — 헛된 왕복과 401 로그를 남기지 않는다. */
async function tryGuestSignIn() {
  let email = "", pw = "";
  try { if (typeof GUEST_LOGIN_EMAIL !== "undefined") email = String(GUEST_LOGIN_EMAIL || "").trim(); } catch (e) {}
  try { if (typeof GUEST_LOGIN_PASSWORD !== "undefined") pw = String(GUEST_LOGIN_PASSWORD || ""); } catch (e) {}
  if (!email || !pw) return false;            // 아직 계정이 없다 — 정상 경로다(anon 으로 간다)
  try {
    const res = await sb.auth.signInWithPassword({ email: email, password: pw });
    if (res && res.error) {
      console.warn("[테스트 모드] 시연 계정 로그인 실패 — anon 둘러보기로 이어 갑니다:", res.error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[테스트 모드] 시연 계정 로그인 중 오류 — anon 둘러보기로 이어 갑니다:", e);
    return false;
  }
}

/* 🧪 지금 붙어 있는 세션이 «시연 둘러보기 계정»인가.
   ⛔ 이 검사를 빼지 마세요 — 새로고침하면 진입 관문이 그 세션을 보고 앱을 여는데,
      알아보지 못하면 «게스트가 정상 담당자 화면»으로 들어갑니다(삭제 단추까지 살아난 채로). */
function isGuestSession(session) {
  let email = "";
  try { if (typeof GUEST_LOGIN_EMAIL !== "undefined") email = String(GUEST_LOGIN_EMAIL || "").trim(); } catch (e) {}
  if (!email) return false;
  try {
    const who = session && session.user ? String(session.user.email || "") : "";
    return who.toLowerCase() === email.toLowerCase();
  } catch (e) { return false; }
}

async function doGuestLogin() {
  const err = $("#loginErr");
  if (!guestAllowed()) {
    if (err) err.textContent = "지금은 둘러보기를 쓸 수 없습니다.";
    return;
  }
  IS_GUEST = true;
  // 🔑 계정이 준비돼 있으면 그것으로, 아니면 조용히 anon 으로. 어느 쪽이든 «들어간다».
  GUEST_SIGNED_IN = await tryGuestSignIn();
  installGuestReadOnlyGuard();
  if (err) err.textContent = "";
  const pw = $("#pw"); if (pw) pw.value = "";
  await showApp();
  try { announce("테스트 모드로 들어왔습니다. 관리자 전용 기능은 잠겨 있습니다."); } catch (e) {}
}

// ── 진입 관문 ────────────────────────────────────────────────────────────
// 세션이 «있을 때만» 앱으로 들어간다. 없으면 로그인 화면에 머문다.
// (showApp() 을 호출하는 곳은 이 블록과 login() 성공 시점 두 곳뿐이어야 한다)
(async () => {
  let session = null;
  try {
    const res = await sb.auth.getSession();
    session = res && res.data ? res.data.session : null;
  } catch (e) {
    console.warn("[로그인] 세션 확인 실패 — 로그인 화면 유지:", e);
  }
  if (session) {
    /* 🧪 시연 둘러보기 계정으로 들어와 있다가 «새로고침»한 경우.
       알아보지 못하면 게스트가 정상 담당자 화면으로 들어간다 — 반드시 되살린다. */
    if (isGuestSession(session)) {
      IS_GUEST = true;
      GUEST_SIGNED_IN = true;
      installGuestReadOnlyGuard();
    }
    showApp(); return;
  }
  // 🧪 로그인 화면에 머무는 «지금»이 둘러보기 버튼을 내보낼 유일한 자리다.
  paintGuestGate();
  const gb = $("#guestBtn");
  if (gb) gb.addEventListener("click", doGuestLogin);
  // 로그인 화면 유지 — 키보드 이용자가 바로 입력할 수 있게 첫 칸에 초점(KWCAG 6.4.3)
  try { $("#email").focus(); } catch (e) {}
})();

// 세션이 끊기면(만료·토큰 갱신 실패·다른 곳에서 로그아웃) 로그인 화면으로 되돌린다.
// reload 하면 #app 이 다시 hidden 인 초기 상태로 돌아가므로 열람하던 자료가 남지 않는다.
//
// ⚠ 무한 새로고침 방지 — 반드시 «앱에 들어와 있을 때»만 반응한다.
//    로그인 화면에서 SIGNED_OUT 이 오면 reload → 또 SIGNED_OUT → reload … 로
//    앱이 통째로 먹통이 된다. 현재 버전(supabase-js 2.112.0)은 세션이 없을 때
//    INITIAL_SESSION 을 보내므로 실제로 그럴 일은 없지만(번들에서 확인함),
//    버전이 올라가도 안전하도록 «화면 상태»로 한 번 더 막는다.
sb.auth.onAuthStateChange((event) => {
  // 토큰이 갱신되거나 새로 로그인하면 «만료 예고» 시각을 다시 잡는다.
  if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") { scheduleExpiryWarning(); return; }
  if (event !== "SIGNED_OUT") return;
  if (LOGGING_OUT) return;                                  // 로그아웃 버튼 경로와 중복 방지
  if (PW_CHANGING) return;                                  // 🔑 비밀번호 변경 중 — 결과는 그 화면이 직접 안내
  if ($("#app").classList.contains("hidden")) return;       // 아직 로그인 화면 → 무시
  showSessionExpired();
});

/* ── 로그인 만료 대응 (KWCAG 6.2.1 «시간 제한») ──────────────────────────
   예전에는 만료되는 «순간» alert 를 띄우고 곧바로 location.reload() 를 실행했다.
   사업을 수정하던 중이면 입력하던 내용이 통째로 사라졌고, 미리 알 수도·연장할 수도 없었다.
   → ① 만료 2분 전에 미리 알리고 «로그인 연장» 을 제공
     ② 이미 만료됐으면 화면을 저절로 되돌리지 않고, 사용자가 누를 때 이동
   ⚠ 위 onAuthStateChange 의 «무한 새로고침 방어»(LOGGING_OUT·#app hidden 확인)는
      그대로 둔다. 여기서도 자동 reload 를 하지 않으므로 루프가 생기지 않는다. */
let EXPIRY_TIMER = null;

function showSessionBanner(text, opts) {
  const box = $("#sessionBanner");
  if (!box) return;
  $("#sessionBannerText").textContent = text;
  $("#sessionExtend").hidden = !(opts && opts.extend);
  $("#sessionGoLogin").hidden = !(opts && opts.goLogin);
  box.hidden = false;
  /* 👁 «보이게» 만든다 (B-1 · 2026-08-25).
     이 띠는 고정 헤더(.topdock) «안»에 있어 목록을 한참 내려 본 상태에서도 화면에 남는다.
     그래도 다음 두 가지를 덧댄다 —
       ① scrollIntoView({block:"nearest"}) — 브라우저가 띠를 실제로 화면 안에 들여놓는다.
          «nearest» 라 이미 보이면 «아무것도 하지 않는다»(읽던 자리를 흔들지 않는다).
       ② announce() — 낭독기 이용자에게 즉시 알린다. #sessionBanner 는 role="alert" 이지만
          «이미 있던 요소를 보이게» 하는 변화는 읽지 않는 낭독기가 있어 한 번 더 말한다.
     ⚠ focus() 는 하지 않는다 — 글을 쓰던 담당자의 초점을 빼앗으면 입력이 끊긴다.
        「작성 중인 내용을 지킨다」가 이 띠의 존재 이유이므로 그 반대로 가면 안 된다. */
  try { box.scrollIntoView({ block: "nearest" }); } catch (e) { /* 구형 브라우저 — 그대로 넘어간다 */ }
  try { announce(text); } catch (e) {}
}
function hideSessionBanner() {
  const box = $("#sessionBanner");
  if (box) box.hidden = true;
}

// 만료 2분 전 예고 — 연장 버튼 제공
function showSessionExpiring() {
  showSessionBanner("로그인이 곧 만료됩니다(약 2분 뒤). 계속 작업하시려면 «로그인 연장»을 눌러주세요.",
    { extend: true });
}

// 이미 만료됨 — 자동 이동하지 않는다(작성 중인 내용을 복사할 시간을 준다)
function showSessionExpired() {
  clearTimeout(EXPIRY_TIMER);
  showSessionBanner(
    "로그인이 만료되어 저장·조회가 되지 않습니다. 작성 중인 내용이 있으면 복사해 두신 뒤 «로그인 화면으로»를 눌러주세요.",
    { goLogin: true });
}

// 현재 세션의 만료 시각을 읽어 «2분 전» 예고를 예약한다.
async function scheduleExpiryWarning() {
  clearTimeout(EXPIRY_TIMER);
  let s = null;
  try {
    const res = await sb.auth.getSession();
    s = res && res.data ? res.data.session : null;
  } catch (e) { return; }
  if (!s || !s.expires_at) return;
  hideSessionBanner();                       // 갱신됐으면 이전 경고는 지운다
  const msLeft = s.expires_at * 1000 - Date.now();
  const warnIn = msLeft - 2 * 60 * 1000;
  /* ⏰ 이미 지난 세션에 «곧 만료됩니다(약 2분 뒤)» 를 띄우지 않는다 (B-8 · 2026-08-25).
     예전에는 warnIn <= 0 이면 무조건 예고 문구를 띄워, 컴퓨터를 켜 둔 채 자리를 비웠다
     돌아온 담당자에게 «이미 끝난 세션»을 두고 「연장하시겠어요?」 를 물었다.
     연장 단추를 눌러 봐야 refreshSession 이 실패해 그때서야 만료를 알게 된다 —
     사실과 다른 말을 먼저 하고 나중에 뒤집는 셈이라, 남은 시간으로 갈래를 나눈다. */
  if (warnIn <= 0) { (msLeft <= 0 ? showSessionExpired : showSessionExpiring)(); return; }
  // setTimeout 은 약 24.8일이 상한이라 그보다 길면 예약하지 않는다(현실적으로 없음)
  if (warnIn < 2147483647) EXPIRY_TIMER = setTimeout(showSessionExpiring, warnIn);
}

async function extendSession() {
  const btn = $("#sessionExtend");
  if (btn) { btn.disabled = true; btn.textContent = "연장 중..."; }
  let ok = false;
  try {
    const res = await sb.auth.refreshSession();
    ok = !(res && res.error);
  } catch (e) { ok = false; }
  if (btn) { btn.disabled = false; btn.textContent = "로그인 연장"; }
  if (ok) {
    hideSessionBanner();
    scheduleExpiryWarning();
  } else {
    // 연장 실패 = 사실상 만료. 그래도 자동 이동은 하지 않는다.
    showSessionExpired();
  }
}

$("#loginBtn").onclick = login;
$("#pw").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
$("#email").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pw").focus(); });

/* ── 인앱 브라우저(카톡·네이버 등) 대응 ──────────────────────────
   카톡/네이버 등 인앱 웹뷰는 PWA 설치·정상 사용이 어렵다.
   인앱일 때만 상단 배너로 크롬(안드로이드)·사파리(iOS) 전환을 유도한다.
   시민앱(모바일웹/app.js)의 isInApp/isIOS/isAndroid/buildChromeIntent와 동등. */
const INAPP_DISMISS_KEY = "sangju_admin_inapp_dismissed";
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
         window.navigator.standalone === true;
}
// 카카오톡·네이버·라인·페이스북·인스타·다음 등 주요 인앱 웹뷰 감지(일반 크롬/사파리/삼성=false)
function isInApp() {
  const ua = (navigator.userAgent || "").toLowerCase();
  return /kakaotalk|naver|line\/|fban|fbav|instagram|daumapps|whale|everytimeapp|band|kakaostory/.test(ua);
}
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ 는 Mac 처럼 보고 → 터치 지원으로 보완 판별
    (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent || "");
}
// 현재 주소(/admin/)를 안드로이드 크롬으로 강제로 여는 intent:// URL. 미설치 시 fallback_url 로 폴백.
function buildChromeIntent() {
  const cur = window.location.href;
  const hostPath = window.location.host + window.location.pathname +
                   window.location.search + window.location.hash;
  return "intent://" + hostPath +
    "#Intent;scheme=https;package=com.android.chrome;" +
    "S.browser_fallback_url=" + encodeURIComponent(cur) + ";end";
}
// 현재 주소 복사 — 복사 절차는 공용 copyText() 한 곳에 있다.
async function copyCurrentUrl() {
  await copyText(window.location.href, "주소를 복사했어요. 브라우저에 붙여넣어 열어주세요.");
}
function initInApp() {
  const banner = $("#inappBanner");
  if (!banner) return;
  let dismissed = false;
  try { dismissed = localStorage.getItem(INAPP_DISMISS_KEY) === "1"; } catch (e) {}
  // 설치 실행(standalone)·일반 브라우저·이미 닫음 → 숨김
  if (isStandalone() || !isInApp() || dismissed) { banner.classList.add("hidden"); return; }

  const txt = $("#inappText"), openBtn = $("#inappOpen"), copyBtn = $("#inappCopy");
  if (isAndroid()) {
    txt.innerHTML = "앱 설치·정상 이용은 <b>크롬</b>에서 됩니다.<br>아래 버튼으로 크롬에서 열어주세요.";
    openBtn.hidden = false; copyBtn.hidden = true;
  } else if (isIOS()) {
    txt.innerHTML = "정상 이용하려면 우측 위 <b>⋯ 메뉴 → ‘Safari로 열기’</b>를 눌러주세요.<br>(주소를 복사해 사파리에 붙여넣어도 됩니다.)";
    openBtn.hidden = true; copyBtn.hidden = false;
  } else {
    txt.innerHTML = "정상 이용은 <b>크롬·사파리 등 기본 브라우저</b>에서 됩니다.<br>주소를 복사해 브라우저에서 열어주세요.";
    openBtn.hidden = true; copyBtn.hidden = false;
  }
  banner.classList.remove("hidden");
}
// 인앱 배너 이벤트(로그인 전에도 동작하도록 즉시 바인딩)
$("#inappOpen").onclick = () => { window.location.href = buildChromeIntent(); };
$("#inappCopy").onclick = copyCurrentUrl;
$("#inappClose").onclick = () => {
  $("#inappBanner").classList.add("hidden");
  try { localStorage.setItem(INAPP_DISMISS_KEY, "1"); } catch (e) {}
};
// 진입 즉시 1회 평가(로그인 화면 상단에서도 노출)
initInApp();

// 로그인 실패 사유를 공무원이 이해할 수 있는 말로 바꾼다.
// (Supabase 원문은 영어라 "Invalid login credentials" 만 보이면 원인 파악이 안 된다)
function loginErrMsg(error) {
  const msg = String((error && error.message) || "").toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.";
  }
  if (/invalid login credentials|invalid credentials/.test(msg)) {
    return "이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }
  if (/email not confirmed/.test(msg)) {
    return "메일 인증이 끝나지 않은 계정입니다. 시스템 담당자에게 문의해 주세요.";
  }
  if (/too many requests|rate limit/.test(msg)) {
    return "로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/failed to fetch|network|load failed/.test(msg)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "로그인하지 못했습니다. (" + ((error && error.message) || "알 수 없는 오류") + ")";
}

async function login() {
  const email = $("#email").value.trim(), password = $("#pw").value;
  if (!email || !password) {
    $("#loginErr").textContent = "이메일과 비밀번호를 입력하세요.";
    (!email ? $("#email") : $("#pw")).focus();   // 초점을 비어 있는 칸으로
    return;
  }
  $("#loginBtn").disabled = true;                 // 중복 제출 방지
  $("#loginErr").textContent = "로그인 중...";
  let error = null;
  try {
    const res = await sb.auth.signInWithPassword({ email, password });
    error = res && res.error ? res.error : null;
  } catch (e) {
    error = e;
  }
  $("#loginBtn").disabled = false;
  if (error) {
    // role="alert" aria-live="assertive" 라 화면낭독기가 즉시 읽는다.
    $("#loginErr").textContent = loginErrMsg(error);
    $("#pw").value = "";
    $("#pw").focus();                             // 초점 유실 없이 다시 입력 가능
    return;
  }
  /* 🔓 «정상 담당자»로 들어왔다 — 둘러보기 흔적을 반드시 걷어 낸다 (A-2 · 2026-08-25).
     같은 탭에서 「둘러보기 → 로그인 화면으로 → 로그인」 으로 들어오는 길이 실제로 있다.
     이 두 줄이 없으면 IS_GUEST 가 참인 채로, 쓰기 차단이 걸린 채로 앱이 열려
     담당자의 저장·삭제가 「테스트 모드에서는…」 으로 조용히 막힌다. */
  IS_GUEST = false;
  uninstallGuestReadOnlyGuard();
  try { SangjuApply.setGuestMode(false); } catch (e) { /* 옛 헬퍼면 그냥 넘어간다 */ }
  showApp();
}

async function showApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  // 📌 헤더는 방금까지 hidden(높이 0)이었다 — 이제야 실제 높이를 잴 수 있다.
  //    ResizeObserver 가 있으면 어차피 따라오지만, 없는 브라우저에서도 첫 화면부터
  //    목록 머리행이 헤더 뒤로 파고들지 않도록 여기서 한 번 못 박는다.
  syncTopdockH();
  // 🧪 테스트 모드 — 띠를 올리고 관리자 전용 기능을 잠근다(게스트일 때만 동작).
  paintGuestNotice();
  paintGuestLocks();
  /* 🧪 둘러보기면 «진짜 신청 자료를 아예 읽지 말라»고 조회 헬퍼에 못 박는다.
     ⭐ 알려 주는 자리는 여기 «한 곳»뿐이다 — 로그인으로 들어오든(IS_GUEST=false)
        둘러보기로 들어오든(true) 반드시 이 함수를 지나므로, 두 길이 갈리지 않는다.
     ⚠ 로그아웃은 location.reload() 라 값이 저절로 초기화된다(남는 상태가 없다).
     자세한 사연은 cloudui/apply_client.js 의 「🧪 둘러보기(게스트)」 주석. */
  /* 🧪 «예시 자료로 갈아타라»고 알리는 자리 — anon 둘러보기일 때«만» 켠다.
       · anon        : applications 를 읽을 권한이 아예 없다 → demo_applications() 예시 10건.
       · 시연 계정   : 로그인한 상태라 진짜 표를 읽는다 → 예시로 갈아타면 안 된다.
         (예시 행은 id 가 진짜 행과 달라, 상태 변경을 눌러도 0건이 되어
          「눌러 봐야 실패하는 단추」가 된다 — 2026-08-25 🩷자물쇠 판단)
     ⚠ 자료는 전부 «가상»이므로 시연 계정이 진짜 표를 보는 것은 감수할 만하다.
     ⚠ 삭제 차단은 그대로다 — 목록을 진짜로 읽는 것과 지울 수 있는 것은 다른 문제다. */
  try { SangjuApply.setGuestMode(guestUsesDemoList()); } catch (e) { /* 옛 헬퍼면 그냥 넘어간다 */ }

  /* 🔴 읽음/안읽음 저장 칸을 «누구 것»으로 쓸지 어댑터에 알린다 (2026-08-26).
     ⭐ 알리는 자리를 여기 «한 곳»으로 둔 까닭은 위 setGuestMode 와 똑같다 —
        로그인으로 들어오든 둘러보기로 들어오든 반드시 이 함수를 지난다.
     ⚠ 사람이 바뀌면 어댑터가 시렁을 비운다(앞 사람의 읽음이 뒷사람에게 새면 안 된다).
     ⚠ 이 줄은 APP_STARTED 관문보다 «앞»이다 — 둘러보기로 열어 둔 탭에서 담당자가
       로그인하면 그 길은 관문에서 되돌아가므로, 관문 뒤에 두면 칸이 안 갈아 끼워진다.
     ⛔ 여기에 await 를 넣지 마세요 — 관문(APP_STARTED) «앞»에서 기다리면 showApp() 이
        두 번 들어와 실시간 채널이 중복 구독됩니다(위 「재진입 방어」 머리말 참조).
        이메일은 관문을 지난 뒤 아래에서 한 번 채워 넣습니다. */
  readsSetContext(READS_USER, IS_GUEST);

  /* 🔁 재진입 방어 (B-7 · 2026-08-25) ─────────────────────────────────────
     getSession() 이 늦게 풀리는 동안 로그인이 성공하면 «진입 관문»과 login() 이
     둘 다 showApp() 을 부른다. 그러면 bindUI 의 addEventListener 가 겹치고,
     실시간 채널 3개(benefits·proposals·applications)가 «중복 구독»되어
     알림 띠가 한 건에 2씩 오른다. bindRtRecovery() 의 _rtRecoveryBound 와 같은 규약.
     ⚠ 여기서 자르는 것은 «한 번만 해야 하는 일»(배선·구독·첫 적재)뿐이다.
        위쪽 화면 칠하기(paintGuestNotice·paintGuestLocks·setGuestMode)는 «멱등»이라
        일부러 이 줄보다 «앞»에 두었다 — 둘러보기로 들어와 있던 탭에서 담당자가
        로그인했을 때 잠금이 확실히 «풀리도록» 해야 하기 때문이다.
        ⛔ 이 줄을 함수 맨 앞으로 올리지 마세요(그 순간 잠금이 안 풀린다). */
  if (APP_STARTED) return;
  APP_STARTED = true;

  /* 🔴 저장 칸 이름을 «담당자 이메일»로 못 박는다 — 한 기기를 여러 담당자가 쓰는 자리에서
     앞 사람의 읽음이 뒷사람에게 새지 않게. 관문을 지난 뒤라 «딱 한 번»만 돈다.
     ⚠ 게스트는 어댑터가 scope:"guest" 한 칸으로 몰아 두므로 이메일이 필요 없다.
     ⚠ 아래 loadApplications() 보다 «먼저» 끝나야 한다 — 목록을 그린 뒤에 칸이 바뀌면
       어댑터의 시렁이 비워져 방금 그린 「신규」와 배지가 어긋난다. */
  if (!IS_GUEST) {
    let who = "";
    try {
      const r = await sb.auth.getSession();
      const ses = r && r.data ? r.data.session : null;
      who = (ses && ses.user && ses.user.email) || "";
    } catch (e) { who = ""; }
    READS_USER = who;
    readsSetContext(READS_USER, false);
  }

  // ⬅ 히스토리 루트를 «첫 탭»으로 잡는다. 여기서 뒤로가기를 누르면 앱이 종료되는 것이 정상.
  //    (로그인 화면에서는 NAV_READY 가 거짓이라 히스토리를 전혀 건드리지 않는다)
  navReset({ type: "tab", tab: pCurrentTab });
  bindUI();
  bindProposalsUI();
  bindApplicationsUI();
  // 로그인 만료 예고 예약 + 띠 버튼 연결
  scheduleExpiryWarning();
  $("#sessionExtend").onclick = extendSession;
  $("#sessionGoLogin").onclick = () => { LOGGING_OUT = true; location.reload(); };
  await loadBenefits();
  subscribeRealtime();
  // 정책제안: 탭 진입 시 1회 로드(초기엔 비활성 섹션이라 미로드 → 첫 탭 전환에서 로드)
  subscribeProposalsRealtime();
  // 📥 신청 접수: 공무원 1순위 업무 → 기본(첫) 탭. 즉시 로드 + 실시간 구독.
  subscribeApplicationsRealtime();
  bindRtRecovery();          // 끊김 → 복구 시 즉시 다시 확인(폴백)
  // 📍 읍·면·동 목록(data.json) — 접수 목록과 «나란히» 받는다. 기다리지 않는다:
  //    못 받아도 목록·상세·저장은 그대로 돌아야 하고, 차트만 조용히 빠진다.
  loadRegionMeta();
  loadApplications();
}

/* ══════════════════════════════════════════════════════════════════════
   🔑 비밀번호 변경 (담당자 본인이 직접)
   ────────────────────────────────────────────────────────────────────
   계정은 시스템 담당자가 Supabase 대시보드에서 만들고 «임시 비밀번호»를 알려 준다.
   그 값을 계속 쓰면 만든 사람도 아는 비밀번호가 되어 «본인만 아는 비밀번호» 원칙
   (개인정보의 안전성 확보조치 기준)에 어긋난다 → 여기서 스스로 바꾼다.

   절차: ① 현재 비밀번호로 본인 확인  ② 복잡도 검사  ③ Supabase 에 새 비밀번호 저장
   ★ ①을 두는 이유: Supabase 는 «세션만 있으면» 현재 비밀번호 없이 바꿀 수 있다.
     자리를 비운 사이 지나가던 사람이 비밀번호를 바꿔 계정을 통째로 가져갈 수 있으므로,
     PC앱(webui/app_web.py change_password)과 같게 현재 비밀번호를 한 번 더 묻는다.
   ══════════════════════════════════════════════════════════════════════ */

/* 비밀번호 복잡도 — PC앱 auth.py password_strength_error() 의 «그대로» 옮긴 판정.
   기준(개인정보의 안전성 확보조치 기준 해설서): 문자 종류 3종 이상이면 8자,
   2종 이상이면 10자. 두 앱이 다른 기준을 쓰면 담당자가 혼란스러우므로
   ⚠ 한쪽만 고치지 말 것(auth.py ↔ 이 함수는 한 쌍이다).
   문자 종류 판정은 파이썬 islower/isupper/isdigit/isalnum 과 맞춘다
   (한글은 대·소문자가 없고 isalnum 이 참 → «특수문자»로 세지 않는다). */
function passwordStrengthError(pw) {
  const s = String(pw == null ? "" : pw);
  if (!s.trim()) return "새 비밀번호를 입력해 주세요.";
  if (/\s/.test(s)) return "비밀번호에 공백은 쓸 수 없습니다.";
  let kinds = 0;
  if (/\p{Ll}/u.test(s)) kinds++;                 // 소문자
  if (/\p{Lu}/u.test(s)) kinds++;                 // 대문자
  if (/\p{Nd}/u.test(s)) kinds++;                 // 숫자
  if (/[^\p{L}\p{N}]/u.test(s)) kinds++;          // 특수문자(글자·숫자가 아닌 것)
  const len = [...s].length;                      // 이모지 등도 1자로 세도록 코드포인트 기준
  if (kinds >= 3 && len >= 8) return "";
  if (kinds >= 2 && len >= 10) return "";
  return "비밀번호가 너무 단순합니다.\n" +
    "· 영문 대문자·소문자·숫자·특수문자 중 3종류 이상을 섞으면 8자 이상\n" +
    "· 2종류만 섞으면 10자 이상\n" +
    "  예) sangju!2026 · Gotgam2026!\n" +
    "(지금 입력: " + len + "자, " + kinds + "종류)";
}

// 비밀번호 변경 실패 사유를 공무원이 이해할 수 있는 말로 바꾼다(loginErrMsg 와 같은 방식).
function pwErrMsg(error) {
  const msg = String((error && error.message) || "").toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.";
  }
  if (/invalid login credentials|invalid credentials/.test(msg)) {
    return "현재 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }
  if (/should be different|same_password|same as the old/.test(msg)) {
    return "지금 쓰는 비밀번호와 같습니다. 다른 값으로 정해 주세요.";
  }
  if (/weak password|password should be at least|password is too short/.test(msg)) {
    return "서버가 요구하는 조건에 못 미치는 비밀번호입니다. 더 길고 복잡하게 정해 주세요.";
  }
  if (/too many requests|rate limit|for security purposes/.test(msg)) {
    return "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/session|jwt|token|not authenticated/.test(msg)) {
    return "로그인이 만료되었습니다. 다시 로그인하신 뒤 바꿔 주세요.";
  }
  if (/failed to fetch|network|load failed/.test(msg)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "비밀번호를 바꾸지 못했습니다. (" + ((error && error.message) || "알 수 없는 오류") + ")";
}

function pwSetMsg(text, kind) {
  const box = $("#pwErr");
  if (!box) return;
  box.className = "pw-msg" + (kind ? " " + kind : "");
  box.textContent = text || "";
}

// 「변경하기」 단추의 «본디 글자». 앞의 🔑 는 icons.js 가 인라인 SVG 로 바꿔 끼운다(규격서 §10).
// ⚠ 여기 한 곳에서만 정한다 — 열 때와 되돌릴 때가 어긋나면 아이콘이 사라진다.
const PW_SAVE_LABEL = "🔑 변경하기";

// 화면을 처음 상태로 되돌리고 연다(직전 입력·안내가 남지 않게).
function openChangePw() {
  ["#pwCur", "#pwNew", "#pwChk"].forEach((s) => { const n = $(s); if (n) n.value = ""; });
  const rule = $("#pwNewRule");
  if (rule) { rule.textContent = ""; rule.className = "pw-rule"; }
  pwSetMsg("");
  const btn = $("#pwSave");
  if (btn) { btn.disabled = false; btn.textContent = PW_SAVE_LABEL; btn.onclick = submitChangePw; }
  openModal($("#pwModal"));   // 첫 초점은 «현재 비밀번호» 칸(모달 공통 규약)
}

async function submitChangePw() {
  const cur = $("#pwCur").value, nw = $("#pwNew").value, chk = $("#pwChk").value;
  // 실패 안내 + 고쳐야 할 칸으로 초점 이동(KWCAG)
  const fail = (msg, sel) => {
    pwSetMsg(msg, "ng");
    announce(msg);
    if (sel) { const n = $(sel); if (n) n.focus(); }
  };
  if (!cur) { fail("현재 비밀번호를 입력해 주세요.", "#pwCur"); return; }
  const ruleErr = passwordStrengthError(nw);
  if (ruleErr) {
    // 여러 줄짜리 «규칙 안내»는 해당 칸 바로 아래에 두고, 맨 아래 결과줄에는 한 줄 요약만 —
    // 같은 긴 안내가 화면에 두 번 뜨면 무엇을 고쳐야 할지 오히려 찾기 어렵다.
    const box = $("#pwNewRule");
    const oneLine = ruleErr.indexOf("\n") < 0;
    if (box) {
      box.textContent = oneLine ? "" : ruleErr;
      box.className = "pw-rule" + (oneLine ? "" : " ng");
    }
    fail(oneLine ? ruleErr : "새 비밀번호가 규칙에 맞지 않습니다. 「새 비밀번호」 칸 아래 안내를 확인해 주세요.", "#pwNew");
    return;
  }
  if (!chk) { fail("새 비밀번호 확인을 입력해 주세요.", "#pwChk"); return; }
  if (nw !== chk) { fail("새 비밀번호 확인이 일치하지 않습니다. 같은 값을 다시 입력해 주세요.", "#pwChk"); return; }
  if (nw === cur) { fail("지금 쓰는 비밀번호와 같습니다. 다른 값으로 정해 주세요.", "#pwNew"); return; }

  const btn = $("#pwSave");
  // ⚠ btn.textContent 를 그대로 기억해 두면 안 된다 — icons.js 가 «🔑» 글자를 이미 SVG 로
  //    바꿔 놓은 뒤라 textContent 는 «변경하기» 뿐이고, 되돌릴 때 자물쇠 아이콘이 사라진다.
  //    openChangePw() 와 «같은 문자열»을 쓰면 icons.js 가 다시 아이콘을 끼워 준다.
  const label = PW_SAVE_LABEL;
  let needRelogin = false;
  btn.disabled = true; btn.textContent = "변경 중...";
  pwSetMsg("비밀번호를 바꾸는 중입니다...");
  PW_CHANGING = true;
  try {
    // ① 본인 확인 — 지금 로그인한 이메일 + 입력한 현재 비밀번호로 다시 로그인해 본다.
    //    (Supabase 에는 «비밀번호만 확인» 하는 기능이 없다. 성공하면 같은 계정의 새 세션으로 이어진다)
    let email = "";
    try {
      const r = await sb.auth.getSession();
      const ses = r && r.data ? r.data.session : null;
      email = (ses && ses.user && ses.user.email) || "";
    } catch (e) { email = ""; }
    if (!email) {
      needRelogin = true;
      fail("로그인이 만료되었습니다. 다시 로그인하신 뒤 바꿔 주세요.");
      return;
    }
    let vErr = null;
    try {
      const r = await sb.auth.signInWithPassword({ email, password: cur });
      vErr = r && r.error ? r.error : null;
    } catch (e) { vErr = e; }
    if (vErr) {
      $("#pwCur").value = "";
      fail(pwErrMsg(vErr), "#pwCur");
      return;
    }

    // ② 새 비밀번호 저장
    let uErr = null;
    try {
      const r = await sb.auth.updateUser({ password: nw });
      uErr = r && r.error ? r.error : null;
    } catch (e) { uErr = e; }
    if (uErr) { fail(pwErrMsg(uErr), "#pwNew"); return; }

    // ③ 세션이 살아 있는지 확인 — Supabase 설정에 따라 비밀번호를 바꾸면
    //    다른 기기의 로그인을 끊는데, 그때 이 기기까지 끊기는 경우가 있어 결과를 보고 안내를 나눈다.
    let alive = false;
    try {
      const r = await sb.auth.getSession();
      alive = !!(r && r.data && r.data.session);
    } catch (e) { alive = false; }

    ["#pwCur", "#pwNew", "#pwChk"].forEach((s) => { const n = $(s); if (n) n.value = ""; });
    const rule = $("#pwNewRule");
    if (rule) { rule.textContent = ""; rule.className = "pw-rule"; }

    if (alive) {
      scheduleExpiryWarning();     // 새 세션 기준으로 «만료 2분 전» 예고를 다시 잡는다
      pwSetMsg("✅ 비밀번호를 바꿨습니다. 지금 로그인은 그대로 유지되며, 다음 로그인부터 새 비밀번호를 쓰시면 됩니다.", "ok");
      announce("비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.");
    } else {
      needRelogin = true;
      pwSetMsg("✅ 비밀번호를 바꿨습니다. 보안을 위해 로그인이 끊겼으니 새 비밀번호로 다시 로그인해 주세요.", "ok");
      announce("비밀번호를 바꿨습니다. 새 비밀번호로 다시 로그인해 주세요.");
    }
  } finally {
    PW_CHANGING = false;
    btn.disabled = false;
    if (needRelogin) {
      // 저절로 화면을 되돌리지 않는다(KWCAG 6.2.1 «시간 제한») — 누를 때 이동한다.
      btn.textContent = "로그인 화면으로";
      btn.onclick = () => { LOGGING_OUT = true; location.reload(); };
      try { btn.focus(); } catch (e) {}
    } else {
      btn.textContent = label;
    }
  }
}

function bindUI() {
  $("#search").addEventListener("input", debounce(() => { page = 0; render(); }, 300));
  $("#sortSel").addEventListener("change", () => { sortKey = $("#sortSel").value; render(); });
  $("#btnAdd").onclick = () => openEdit(null);
  $("#btnLogout").onclick = async () => {
    LOGGING_OUT = true;                 // onAuthStateChange 가 중복으로 안내하지 않도록
    try { await sb.auth.signOut(); } catch (e) { /* 이미 끊겼어도 화면은 되돌린다 */ }
    /* ⛔⛔ 이 한 줄(location.reload)을 빼지 마세요 — «게스트 잠금»이 남습니다.
       새로고침이 IS_GUEST·APP_STARTED·쓰기 차단(installGuestReadOnlyGuard)을 통째로
       초기 상태로 되돌립니다. 화면만 로그인 카드로 바꾸는 식으로 «가볍게» 고치면,
       둘러보기 → 로그아웃 → 다른 계정 로그인 경로에서 담당자의 저장·삭제가
       조용히 막힙니다(2026-08-25 A-2). 꼭 바꿔야 한다면 그 자리에서
       IS_GUEST=false · uninstallGuestReadOnlyGuard() · APP_STARTED=false 를
       «세 가지 모두» 되돌려 주세요. */
    location.reload();                  // 초기 상태(로그인 화면)로 — 열람하던 데이터도 사라짐
  };
  // C2: 닫기/바깥클릭은 closeModal로 통일(포커스 복귀). Esc는 _trapKeydown이 일괄 처리.
  $("#mClose").onclick = () => requestCloseModal($("#modal"));
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") requestCloseModal($("#modal")); });

  // 🔑 비밀번호 변경 모달 (열기/닫기/바깥클릭) — Esc는 공통 트랩에서 처리
  const pwm = $("#pwModal");
  if (pwm) {
    $("#btnChangePw").onclick = openChangePw;
    // 🔔 새 접수 소리 알림 — ★ 기본 켜짐(2026-08-24). 직접 끈 적이 있어야만 꺼진 상태로 뜬다.
    loadSoundPref();
    renderSoundBtn();
    // 브라우저 자동재생 정책 — «처음 누르는 몸짓» 한 번에 소리 장치를 깨워 둔다.
    // 이 줄이 없으면 기본 켜짐인데도 첫 알림이 통째로 조용히 지나간다(A-12).
    installAudioPrimer();
    const sb2 = $("#btnSound");
    if (sb2) sb2.onclick = toggleSound;
    $("#pwClose").onclick = () => requestCloseModal(pwm);
    pwm.addEventListener("click", (e) => { if (e.target.id === "pwModal") requestCloseModal(pwm); });
    $("#pwSave").onclick = submitChangePw;
    // 입력 중 규칙 미리 확인 — 「변경하기」를 눌러야 알 수 있던 것을 미리 알려 준다(300ms 디바운스).
    // 안내는 role="status"(polite) 라 타이핑을 방해하지 않는다.
    $("#pwNew").addEventListener("input", debounce(() => {
      const v = $("#pwNew").value, box = $("#pwNewRule");
      if (!box) return;
      if (!v) { box.textContent = ""; box.className = "pw-rule"; return; }
      const err = passwordStrengthError(v);
      box.textContent = err ? err : "✅ 쓸 수 있는 비밀번호입니다.";
      box.className = "pw-rule " + (err ? "ng" : "ok");
    }, 300));
  }

  /* 계정 메뉴 — 비밀번호 변경·로그아웃을 하나로 접었다(규격서 0절 «버튼 총량 3개»).
     ⚠ 안에 든 버튼의 id 는 그대로라, 위쪽 btnChangePw·btnLogout 연결이 그대로 동작한다.
     ⚠ 모달이 아니라 «메뉴»다 — 바깥을 누르거나 Esc 면 닫히고, 초점은 여는 버튼으로 돌아간다. */
  const acctBtn = $("#btnAcct"), acctPop = $("#acctPop");
  if (acctBtn && acctPop) {
    const setAcct = (open) => {
      acctPop.hidden = !open;
      acctBtn.setAttribute("aria-expanded", open ? "true" : "false");
      /* 🎯 초점은 «실제로 보이는» 첫 단추로 (B-4 · 2026-08-25).
         예전에는 querySelector("button") 로 «DOM 첫 단추»를 잡았는데, 둘러보기에서는
         그것이 hidden 된 #btnChangePw 였다. display:none 요소의 focus() 는 «무동작»이라
         메뉴를 열어도 초점이 들어가지 않아, 키보드·낭독기 이용자는 Tab 을 눌러야 겨우 들어갔다.
         ⚠ [hidden] 뿐 아니라 offsetParent 로도 확인한다 — 조상이 감춰졌거나 CSS 로
            숨겨진 경우까지 잡아야 «보이는 첫 단추»가 된다(position:fixed 는 이 앱에 없다). */
      if (open) {
        const btns = acctPop.querySelectorAll("button");
        let f = null;
        for (let i = 0; i < btns.length; i++) {
          if (!btns[i].hidden && btns[i].offsetParent !== null) { f = btns[i]; break; }
        }
        if (!f) f = btns[0] || null;
        if (f) f.focus();
      }
    };
    acctBtn.onclick = (e) => { e.stopPropagation(); setAcct(acctPop.hidden); };
    document.addEventListener("click", (e) => {
      if (acctPop.hidden) return;
      if (acctPop.contains(e.target) || acctBtn.contains(e.target)) return;
      setAcct(false);
    });
    document.addEventListener("keydown", (e) => {
      // 모달이 열려 있으면 Esc 는 모달 몫이다(_trapKeydown) — 메뉴는 건드리지 않는다.
      if (e.key !== "Escape" || acctPop.hidden || _activeModal) return;
      setAcct(false);
      acctBtn.focus();
    });
    // 메뉴 안에서 무엇을 고르면 메뉴는 닫는다(그 뒤 동작은 각 버튼이 한다)
    acctPop.addEventListener("click", (e) => { if (e.target.closest("button")) setAcct(false); });
  }

  // 개인정보 처리방침 모달 (열기/닫기/바깥클릭) — Esc는 공통 트랩에서 처리
  const pp = $("#ppModal");
  if (pp) {
    $("#btnPrivacy").onclick = () => openModal(pp);
    $("#ppClose").onclick = () => requestCloseModal(pp);
    pp.addEventListener("click", (e) => { if (e.target.id === "ppModal") requestCloseModal(pp); });
  }

  // 버전 라벨 + 버전별 개선사항(체인지로그) 모달 — Esc는 공통 트랩에서 처리
  const vm = $("#versionModal");
  const vbtn = $("#btnVersion");
  const ver = window.APP_VERSION || "";
  if (vbtn && ver) {
    vbtn.textContent = "v" + ver;                // 단일 소스에서 버전 주입
    // 음성 명령이 «보이는 글자»로 눌리도록 접근명 맨 앞에 화면 텍스트(v0.0.2 등)를 그대로 둔다
    vbtn.setAttribute("aria-label", "v" + ver + " — 버전별 개선사항 보기");
  }
  if (vm && vbtn) {
    renderChangelog();
    vbtn.onclick = () => openModal(vm);
    $("#vmClose").onclick = () => requestCloseModal(vm);
    vm.addEventListener("click", (e) => { if (e.target.id === "versionModal") requestCloseModal(vm); });
  }
}

/* 📌 접수 안내(엑셀 «비고» 열 = benefits.note) — 세 앱 공통 규약
   «비고»에는 "2026년 접수 마감(매년 3~5월 접수)"처럼 지금 신청할 수 있는지가 담긴다.
   안 보이면 이미 마감된 사업을 민원인에게 안내하게 되므로 목록·상세(수정)에 모두 노출한다.
   ★ 아이콘 «📌» + 문구 «접수 안내» 는 시민앱(모바일웹)·PC앱(webui)과 글자 단위로 동일(임의 변경 금지).
   ★ 색만으로 알리지 않는다 — 배경색과 별개로 «📌 접수 안내» 라는 글자를 항상 함께 쓴다.

   ⚠ note 컬럼은 Supabase 대시보드에서 사람이 직접 추가한다(supabase/add_note_column.sql).
     아직 없을 수 있으므로 «있으면 쓰고 없으면 조용히 빠진다»를 원칙으로 한다.
       · 읽기 : select("*") 결과에 키가 없으면 undefined → 배지 미표시(그대로 안전)
       · 쓰기 : 없는 컬럼을 insert/update 에 넣으면 PGRST204 로 «저장 자체»가 실패한다
                → NOTE_OK 가 참일 때만 입력칸을 만들고, 만일을 대비해 저장 실패 시 1회 재시도 */
const NOTE_KEY = "note";
const NOTE_LABEL = "📌 접수 안내";
let NOTE_OK = false;   // benefits.note 컬럼 존재 여부(런타임 감지)

function noteText(r) {
  const v = String((r && r[NOTE_KEY]) || "").replace(/\s+/g, " ").trim();
  return (v && v !== "nan" && v !== "null" && v !== "undefined") ? v : "";
}

// 컬럼 존재 감지: 행이 있으면 키 유무로 판정(추가 요청 0회),
// 행이 하나도 없을 때만 가벼운 probe 질의를 한 번 던진다.
async function detectNoteColumn(rows) {
  if (rows && rows.length) {
    NOTE_OK = Object.prototype.hasOwnProperty.call(rows[0], NOTE_KEY);
    return;
  }
  const { error } = await sb.from("benefits").select(NOTE_KEY).limit(1);
  NOTE_OK = !error;
}

// 저장 payload 에서 note 를 제거해야 하는 오류인지(컬럼 미생성) 판정
function isMissingNoteColumn(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  return code === "PGRST204" || (msg.includes("note") && /column|schema cache/.test(msg));
}

// 🏷 저장 payload 에서 categories 를 제거해야 하는 오류인지(컬럼 미생성) 판정.
//   schema.sql 에는 처음부터 있는 컬럼이라 보통 일어나지 않지만, 서버가 옛 스키마일 때
//   «사업 내용 전체가 저장 실패»로 날아가는 것을 막기 위한 마지막 안전망이다.
function isMissingCatColumn(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  return (code === "PGRST204" || code === "42703") &&
         (msg.includes("categor") || msg.includes("schema cache"));
}

async function loadBenefits() {
  showSkeleton("#list", 4);           // 첫 불러오기에만
  const { data, error } = await sb.from("benefits").select("*").order("seq", { nullsFirst: false }).order("id");
  if (error) {
    console.error(error);
    // 원인(연결/권한/미설정)별 안내 + 다시 시도 — "불러오기 실패"만 뜨던 문제 개선
    showLoadError("#list", error, "listRetry", loadBenefits);
    return;
  }
  ALL = data || [];
  await detectNoteColumn(ALL);          // 📌 접수 안내 컬럼이 준비됐는지 확인
  RT_PENDING = 0; syncRtBanners();     // 새로 불러왔으니 «밀린 알림»도 지운다
  CATS = [...new Set(ALL.flatMap((r) => r.categories || []))].sort();
  renderDbInfo();      // 「사업 N건 · 실시간」 — 연결이 끊겨 있으면 그 사실도 이 한 줄이 알린다
  renderBSummary();
  renderCats();
  render();
}

// ── 실시간 변경 «알림»(자동 갱신 아님) ────────────────────────────────
// 예전에는 새 데이터가 오면 목록을 즉시 갈아끼웠다. 보고 있던 위치가 사라지고,
// 모달을 열어 편집하는 중에도 뒤 목록이 바뀌어 «정지 기능»(KWCAG 6.2.2)이 필요한
// 자동 변경이었다. → 이제는 누적 건수만 띠로 알리고, 갱신은 사용자가 누를 때만 한다.
let RT_PENDING = 0, PRT_PENDING = 0, ART_PENDING = 0;

// 자동 반영(2026-08-18) — 예전에는 «알림 띠»만 올리고 사람이 눌러야 목록이 바뀌었다.
//  요구: 시민앱에서 신청·제안이 들어오거나 사업이 바뀌면 «아무 동작 없이» 화면에 나타나야 한다.
//  · rtBusy()(편집·상세 모달이 열려 있음)면 화면을 갈아엎지 않고 띠만 남긴다 — 작업 중 유실 방지.
//    모달을 닫으면 그때 띠를 눌러 반영하거나, 다음 이벤트에 자동으로 따라온다.
//  · 한 번 동기화에 수십 행이 바뀌면 이벤트도 그만큼 온다 → 1.2초로 «묶어» 한 번만 부른다.
const RT_APPLY_MS = 1200;
const _rtJobs = {};
/* opts.evenWhenBusy — «모달이 열려 있어도» 반영한다. 예외는 지금 «댓글» 하나뿐이다.
   왜 예외가 필요한가: rtBusy() 는 「#pModal 이 열려 있으면 바쁘다」로 판정하는데,
   댓글 목록은 «바로 그 #pModal 안»에 있다. 그래서 보통 규칙을 그대로 쓰면
   「댓글을 보고 있는 동안에는 댓글이 갱신되지 않는다」는 뒤집힌 결과가 된다.
   ⚠ 그래도 «작업 중 유실 방지»는 포기하지 않는다 — 무엇을 지키는지는 pcmtBusy() 참조.
   ⛔ 다른 kind 에 evenWhenBusy 를 붙이지 말 것. 목록을 갈아엎으면 편집 중인 폼이 날아간다. */
function rtAutoApply(kind, fn, opts) {
  clearTimeout(_rtJobs[kind]);
  _rtJobs[kind] = setTimeout(() => {
    if (!(opts && opts.evenWhenBusy) && rtBusy()) { syncRtBanners(); return; }
    try { Promise.resolve(fn()).catch(() => {}); } catch (e) { /* 실패해도 띠가 남는다 */ }
  }, RT_APPLY_MS);
}


// 모달이 열려 있으면(=편집 중) 알림 띠도 띄우지 않는다 — 작업 방해 금지
function rtBusy() {
  return ["#modal", "#pModal", "#aModal", "#ppModal", "#versionModal"]
    .some((s) => { const m = $(s); return m && !m.classList.contains("hidden"); });
}

function syncRtBanners() {
  const busy = rtBusy();
  const b = $("#rtBanner"), p = $("#pRtBanner"), a = $("#aRtBanner");
  if (b) {
    const show = RT_PENDING > 0 && !busy;
    if (show) $("#rtText").textContent = `사업 정보 변경 ${RT_PENDING}건이 있습니다`;
    b.hidden = !show;
  }
  if (p) {
    const show = PRT_PENDING > 0 && !busy;
    if (show) $("#pRtText").textContent = `새 제안·변경 ${PRT_PENDING}건이 있습니다`;
    p.hidden = !show;
  }
  if (a) {
    const show = ART_PENDING > 0 && !busy;
    if (show) $("#aRtText").textContent = `새 접수·변경 ${ART_PENDING}건이 있습니다`;
    a.hidden = !show;
  }
}

function subscribeRealtime() {
  sb.channel("benefits-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "benefits" },
        () => { RT_PENDING += 1; syncRtBanners(); rtAutoApply("benefits", loadBenefits); })
    .subscribe((status) => rtChannelStatus("benefits", status));
}

/* ── 실시간이 끊겼을 때의 «폴백 조회» (2026-08-20) ───────────────────────
   왜 필요한가 — 지금까지는 연결이 끊기면 헤더 글자만 「실시간 연결 끊김」으로 바뀌고
   «그 뒤로는 아무 일도 일어나지 않았다». 시연장 와이파이가 한 번 흔들리면 그 뒤
   들어온 시민 신청이 화면에 영영 나타나지 않는다(공무원은 알 길이 없다).
   → 끊겨 있는 «동안만», «보고 있는 탭만» 20초마다 직접 다시 불러온다.
     연결이 살아 있으면 폴백은 한 번도 돌지 않으므로 평소 조회량은 그대로다.
   ⚠ 편집·상세 모달이 열려 있으면(rtBusy) 건너뛴다 — 작성 중인 내용을 지우면 안 된다. */
const RT_POLL_MS = 20000;
let _rtPollTimer = null;
// null = 아직 소식 없음(«끊김»으로 치지 않는다). 세 채널이 차례로 붙는 동안
// 잠깐 false 로 보여 「연결 끊김」을 헛되이 낭독하는 일을 막는다.
const _rtChanOk = { benefits: null, proposals: null, applications: null };

function rtChannelStatus(kind, status) {
  _rtChanOk[kind] = (status === "SUBSCRIBED");
  // «실제로 끊겼다고 알려온» 채널이 하나라도 있으면 끊김으로 본다(같은 소켓이라 대개 함께 움직인다).
  const bad = Object.keys(_rtChanOk).some((k) => _rtChanOk[k] === false);
  setRealtimeDot(!bad);
  if (RT_OK) rtStopPoll(); else rtStartPoll();
}

function rtPollTick() {
  if (RT_OK || document.hidden || rtBusy()) return;
  if (pCurrentTab === "applications" && A_LOADED) loadApplications();
  else if (pCurrentTab === "benefits") loadBenefits();
  else if (pCurrentTab === "proposals" && P_LOADED) loadProposals();
}
function rtStartPoll() {
  if (_rtPollTimer !== null) return;      // ⚠ !_rtPollTimer 로 쓰면 타이머 id 0 을 «없음»으로 오인한다
  _rtPollTimer = setInterval(rtPollTick, RT_POLL_MS);
}
function rtStopPoll() {
  if (_rtPollTimer === null) return;
  clearInterval(_rtPollTimer);
  _rtPollTimer = null;
}

// 네트워크가 돌아오거나 화면이 다시 보이면 기다리지 않고 즉시 한 번 확인한다.
let _rtRecoveryBound = false;
function bindRtRecovery() {
  if (_rtRecoveryBound) return;      // showApp() 이 두 번 불려도 리스너가 겹치지 않게
  _rtRecoveryBound = true;
  window.addEventListener("online", () => setTimeout(rtPollTick, 500));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rtPollTick(); });
}

// 실시간 연결 표시 갱신
// ─────────────────────────────────────────────────────────────────────
// 2026-08-19 양호창님 지시로 헤더의 「실시간 연결됨」 알약(#realtimeDot)을 «화면에서 뺐다».
//   (좁은 폰에서 그 알약 때문에 계정 버튼이 아래 줄로 밀려 헤더가 두 줄이 됐다)
// 그렇다고 «연결 끊김»을 안 알리면 시민 신청이 실시간으로 안 들어오는 것을 아무도 모른다.
// → 두 가지로 대체한다.
//   ① 헤더 부제(#dbInfo)의 «글자»를 「사업 N건 · 실시간」 ↔ 「… · 실시간 연결 끊김」 으로 바꾼다.
//      눈에 띄게 튀지 않으면서 화면 어디서나 항상 보이는 자리다. 색이 아니라 «글자»가 정보다.
//   ② 상태가 «바뀌는 순간»에만 낭독기(#liveStatus)로 알린다. 매번 알리면 소음이 된다.
// ⚠ 요소(#realtimeDot)를 지웠으므로 아래 코드는 그 요소를 더 이상 찾지 않는다.
//    옛 요소가 남아 있는 캐시본에서도 죽지 않도록(널 참조) 애초에 참조하지 않는 구조로 두었다.
let RT_OK = true;                     // 지금 실시간 연결이 살아 있는가(초기값 = 살아 있음)
let RT_OK_KNOWN = false;              // 한 번이라도 상태를 받았는가(첫 통보는 낭독하지 않는다)

// 헤더 부제 = 「사업 N건 · 실시간(또는 실시간 연결 끊김)」. 두 곳에서 쓰므로 한 함수로 묶는다.
function renderDbInfo() {
  const box = $("#dbInfo");
  if (!box) return;
  const state = RT_OK ? "실시간" : "실시간 연결 끊김";
  // 아직 사업 목록을 한 번도 못 받았으면 «0건»이라고 단정하지 않는다(index.html 초기 문구를 유지)
  // ⚠ 「진행사업」 — 탭 이름(진행사업 현황)과 «같은 말»을 쓴다(A-03 · 2026-08-24).
  box.textContent = ALL.length ? `진행사업 ${ALL.length}건 · ${state}` : `진행사업 현황 (${state})`;
  box.classList.toggle("rt-off", !RT_OK);
}

function setRealtimeDot(ok) {
  ok = !!ok;
  const changed = RT_OK_KNOWN && ok !== RT_OK;
  RT_OK = ok;
  RT_OK_KNOWN = true;
  renderDbInfo();
  // 상태가 «바뀐 순간»에만 알린다(첫 연결 성공은 굳이 알리지 않는다)
  if (changed) {
    announce(ok
      ? "실시간 연결이 복구되었습니다."
      : "실시간 연결이 끊겼습니다. 새 신청·변경이 자동으로 나타나지 않을 수 있습니다. 화면을 새로고침해 주세요.");
  }
}

/* 📊 요약 띠 — 설계안 «통계는 각 탭 상단 요약 띠».
   ⚠ «실제로 셀 수 있는 수»만 둔다. 없는 항목(임시저장·마감 등)을 지어내지 않는다.
   ⚠ 수치는 countUp() 이 채운다 — 최종값이 먼저 DOM 에 들어가 낭독기가 최종값을 읽는다. */
/* 🕘 「최신순」을 보여 줄지 정한다 — A-11 (시민앱 C-11 과 같은 규칙).
   «등록일이 하나라도 있을 때만» 최신순을 남긴다. 아무 행에도 날짜가 없으면 그 칸을 뺀다 —
   고를 수는 있는데 아무 일도 일어나지 않는 «죽은 선택지»를 남기지 않기 위함이다.
   ⚠ 지금 클라우드(benefits)는 created_at 이 늘 채워지므로 실제로는 거의 늘 보인다.
      그래도 규칙을 두는 이유는 시민앱과 «같은 규칙»을 지키기 위함이고, 옛 자료를 가져오는
      경우(엑셀만 있고 날짜가 없는 판본)를 위한 안전장치이기도 하다.
   ⚠ 고르고 있던 값이 사라지면 «기본순»으로 되돌린다 — 빈 값이 남으면 목록이 안 그려진다. */
function syncSortOptions() {
  const sel = $("#sortSel"); if (!sel) return;
  const opt = sel.querySelector('option[value="new"]'); if (!opt) return;
  const hasDate = ALL.some((r) => r && (r.updated_at || r.created_at));
  const show = !ALL.length || hasDate;      // 자료를 아직 못 받았으면 건드리지 않는다
  if (opt.hidden === !show) return;         // 바뀐 것이 없으면 조용히 둔다
  opt.hidden = !show;
  opt.disabled = !show;
  if (!show && sortKey === "new") { sortKey = "default"; sel.value = "default"; }
}

function renderBSummary() {
  const box = $("#bSummary"); if (!box) return;
  syncSortOptions();
  if (!ALL.length) { box.hidden = true; return; }
  box.hidden = false;
  countUp($("#kpiBAll"), ALL.length);
  countUp($("#kpiBCat"), CATS.length);
  countUp($("#kpiBNote"), ALL.filter((r) => noteText(r)).length);
}

function renderPSummary() {
  const box = $("#pSummary"); if (!box) return;
  if (!PALL.length) { box.hidden = true; return; }
  box.hidden = false;
  const st = (r) => r.status || "접수";
  countUp($("#kpiPAll"), PALL.length);
  countUp($("#kpiPNew"), PALL.filter((r) => st(r) === "접수" || st(r) === "검토중").length);
  countUp($("#kpiPDone"), PALL.filter((r) => (r.admin_reply || "").trim()).length);
}

/* ⭐⭐ 접힌 분야 칩의 «요약 한 줄» (2026-08-25) ────────────────────────────────
   접혀 있을 때 「분야 — 청년 · 주거·부동산 (2개)」처럼 «지금 무엇으로 걸러졌는지»를 말한다.
   ⛔ 이것이 없으면 접어 둔 담당자가 며칠 뒤 「왜 목록이 이것뿐이지?」 하고 헤맨다 —
      접기 기능에서 가장 중요한 한 줄이다. 지우지 말 것.
   ⚠ 펼쳐져 있을 때도 «글자를 지우지 않는다» — 칩이 이미 색으로 말하고 있으니 중복이지만,
      접는 «순간» 글자가 새로 나타나면 줄 높이가 튀고 낭독기가 그것을 못 따라 읽는다.
      대신 CSS 가 «펼침일 때는 감춘다»(.fold-btn[aria-expanded="true"] .fold-sum { display:none }).
   ⚠ 이름이 길어지지 않게 «세 개까지»만 적고 나머지는 개수로 말한다.
   ⚠ 아무것도 안 골랐으면 「전체」다 — 빈칸으로 두면 «걸러진 것이 없다»가 안 전해진다. */
function foldSumText(set) {
  const list = [...set];
  if (!list.length) return "— 전체";
  if (list.length <= 3) return "— " + list.join(" · ");
  return "— " + list.slice(0, 3).join(" · ") + ` 외 ${list.length - 3}개`;
}
function paintCatFoldSum(id, set) {
  const el2 = $("#" + id);
  if (!el2) return;
  const n = set.size;
  el2.textContent = foldSumText(set) + (n ? ` (${n}개)` : "");
}

function renderCats() {
  const box = $("#catChips"); box.innerHTML = "";
  // 분야가 하나도 없으면 이름표(「분야로 좁혀보기」)만 덩그러니 남는다 → 함께 감춘다
  const cap = $("#catCap"); if (cap) cap.hidden = !CATS.length;
  CATS.forEach((cat) => {
    const c = el("button", "chip" + (SELCATS.has(cat) ? " on" : ""));
    c.type = "button";
    c.textContent = cat;
    // 색(.on)만으로 선택 상태를 알리지 않는다 — renderAStatusChips 와 같은 규약
    c.setAttribute("aria-pressed", SELCATS.has(cat) ? "true" : "false");
    c.onclick = () => { SELCATS.has(cat) ? SELCATS.delete(cat) : SELCATS.add(cat); page = 0; renderCats(); render(); };
    box.appendChild(c);
  });
  paintCatFoldSum("catFoldSum", SELCATS);   // 접힌 줄의 요약을 늘 최신으로
}

// 🕘 사업 한 건의 «최신 시각»(밀리초). 최신순 정렬에만 쓴다.
//    updated_at(마지막 수정) → created_at(등록) → id 순으로 안전하게 떨어진다.
//    ⚠ 값이 없거나 형식이 이상해도 «절대 NaN 을 돌려주지 않는다» — NaN 이 섞이면
//      Array.sort 의 비교가 일관성을 잃어 목록 순서가 브라우저마다 달라진다.
function benefitTime(r) {
  if (!r) return 0;
  const t = Date.parse(r.updated_at || r.created_at || "");
  if (!isNaN(t)) return t;
  const id = Number(r.id);
  return isNaN(id) ? 0 : id;          // 시각이 아예 없는 옛 행은 id(증가값)로 대신 줄 세운다
}

function render() {
  const q = $("#search").value.trim().toLowerCase();
  let rows = ALL.filter((r) => {
    if (SELCATS.size) {
      const rc = r.categories || [];
      if (![...SELCATS].some((c) => rc.includes(c))) return false;
    }
    if (q) {
      const blob = `${r.name || ""} ${r.team || ""} ${r.content || ""} ${r.target || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  if (sortKey === "name") rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  // 🕘 최신순 — «마지막으로 고친 시각» 내림차순. 방금 등록·수정한 사업이 맨 위로 온다.
  //    (기본순 default 는 엑셀 순번 그대로라, 새로 올린 사업이 목록 한복판에 묻혀 찾기 어려웠다)
  else if (sortKey === "new") rows.sort((a, b) => benefitTime(b) - benefitTime(a));
  // 🏢 팀별순 — 규칙은 teamSortCmp 한 곳뿐이다(시민앱 C-11 과 «글자 단위로» 같은 규칙).
  else if (sortKey === "team") rows.sort(teamSortCmp);
  $("#count").textContent = `총 ${rows.length}건`;
  const list = $("#list");
  /* 🈳 빈 화면 — «걸러서 0건»과 «원래 0건»을 가른다 (B-5 · 2026-08-25).
     예전에는 어느 쪽이든 「조건에 맞는 사업이 없습니다」 였다. 필터를 하나도 안 건
     담당자는 그 말을 보고 「내가 뭘 잘못 걸었나」 하고 칩·검색창을 헤맸다.
     신청 접수 탭(renderApplications 의 빈 화면)과 «같은 결»로 나눈다. */
  if (!rows.length) {
    const narrowed = SELCATS.size > 0 || !!q;
    list.innerHTML = narrowed
      ? '<div class="empty">조건에 맞는 사업이 없습니다. 위 분야 칩을 끄거나 검색어를 지우면 모든 사업을 볼 수 있습니다.</div>'
      : (guestSaveBlockedByServer()
        ? '<div class="empty">아직 등록된 사업이 없습니다.</div>'
        : '<div class="empty">아직 등록된 사업이 없습니다. 위 «새 사업 올리기»로 첫 사업을 등록해 보세요.</div>');
    $("#pager").innerHTML = "";
    return;
  }
  const pages = Math.ceil(rows.length / PAGE); if (page >= pages) page = pages - 1; if (page < 0) page = 0;
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const team = (r.team || "").trim();
    const content = (r.content || "").replace(/\s+/g, " ").trim();
    const note = noteText(r);          // 📌 접수 안내(비고). 컬럼이 없으면 항상 ""
    const card = el("div", "card");
    // C1: 키보드 접근 — 버튼 의미 부여 + Enter/Space 동작 + 접근명
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    // 색만으로 알리지 않도록 접근명에도 «접수 안내»를 함께 넣는다
    card.setAttribute("aria-label",
      `${r.name || "사업"}${note ? `, 접수 안내 ${note}` : ""} 수정`);
    /* ⭐⭐ 카드 높이 통일 (2026-08-25 양호창님 「카드 높이를 같게 해 줘」)
       ① 제목에 title 속성 — 2줄에서 «…»로 잘려도 온전한 사업명이 마우스·낭독기에 남는다.
          (잘린 글자를 그냥 두면 「전통시장…」이 무슨 사업인지 알 길이 없다)
       ② 「📌 접수 안내」가 없는 카드에도 «빈 자리»를 둔다 — 있고 없고에 따라 카드가
          40px 씩 달라지던 것을 막는다. 보이지 않고(visibility:hidden · style.css)
          낭독기도 읽지 않는다(aria-hidden). ⛔ 이 빈 칸을 지우지 마세요. */
    card.innerHTML = `<div class="card-main">
        <div class="card-title" title="${esc(r.name || "")}">📂 ${esc(r.name)}</div>
        <div class="card-desc">${esc(content.slice(0, 90)) || "—"}</div>
        ${note ? `<div class="card-note">${NOTE_LABEL} · ${esc(note)}</div>`
               : `<div class="card-note is-empty" aria-hidden="true"></div>`}
      </div>
      <span class="badge ${team ? "" : "warn"}"${team ? ` title="${esc(team)}"` : ""}>${team ? esc(team) : "담당팀 확인 필요"}</span>`;
    // 담당팀 색 구분: 팀명별 결정적 색을 배지에 적용(시민앱과 동일). null이면 중립 유지.
    const tc = teamColor(team);
    if (tc) {
      const bdg = card.querySelector(".badge");
      if (bdg) { bdg.style.background = tc.bg; bdg.style.color = tc.fg; }
    }
    const openIt = () => openEdit(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    list.appendChild(card);
  });
  staggerCards(list);
  renderPager(rows.length, pages);
}

// 페이지 이동(KWCAG 2.2 «레이블 제공»·«명확한 지시») — PC앱 webui/app.js renderPager 와 동일 방식.
//  · 래퍼를 <nav aria-label="페이지 이동"> 으로 두어 보조기기가 영역을 인지
//  · ‹ / › 는 기호뿐이라 화면낭독기가 읽을 수 없음 → aria-label 로 "이전/다음 페이지"
//  · 숫자 버튼은 "N 페이지", 현재 페이지는 aria-current="page"
/* ══════════════════════════════════════════════════════════════════════
   🏢 팀별순 정렬 — A-11 (2026-08-24 · 시민앱 C-11 과 «같은 규칙»)
   ────────────────────────────────────────────────────────────────────
   ⛔ 팀 «색»이나 «팀별 사업 수»로 정렬하지 마세요(단장 지시).
      담당자도 시민도 다음에 무엇이 올지 예측할 수 없습니다. 가나다순만 예측 가능합니다.
   규칙은 셋뿐입니다.
     ① 팀명이 없는 것(빈칸 · "-" · "담당팀 확인 필요")은 «맨 뒤»
     ② 있는 것끼리는 localeCompare(a, b, "ko") 오름차순 — 한글 가나다 정렬
     ③ 같으면 0 을 돌려준다 → Array.prototype.sort 의 «안정성»이 «기본순»을 그대로 보존한다
        (같은 팀 안에서는 엑셀 순번 차례가 살아 있다는 뜻입니다. 이것이 ③ 의 목적입니다)
   ⚠ TEAM_NONE 의 글자를 바꾸면 시민앱 C-11 과 어긋납니다. 양쪽을 함께 고치세요.
   ══════════════════════════════════════════════════════════════════════ */
const TEAM_NONE = ["", "-", "담당팀 확인 필요"];
function teamSortKey(r) {
  const t = String((r && r.team) || "").trim();
  return TEAM_NONE.indexOf(t) >= 0 ? "" : t;   // "" = 팀명 없음
}
function teamSortCmp(a, b) {
  const ta = teamSortKey(a), tb = teamSortKey(b);
  if (!ta && !tb) return 0;      // 둘 다 없음 → 기본순 보존
  if (!ta) return 1;             // 없는 것은 맨 뒤
  if (!tb) return -1;
  return ta.localeCompare(tb, "ko");
}

function renderPager(total, pages) {
  const wrap = $("#pager"); wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    if (dis) b.disabled = true; else b.onclick = () => { page = p; render(); };
    bar.appendChild(b);
  };
  mk("‹", page - 1, page <= 0, false, "이전 페이지");
  let s = Math.max(0, page - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === page, `${p + 1} 페이지`);
  mk("›", page + 1, page >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

// 추가/수정/삭제
// [화면 라벨, 컬럼명, 여러 줄 여부, 도움말(선택), 강조박스 여부(선택)]
// ※ 📌 접수 안내(note)는 «지금 신청 가능한지»를 좌우하므로 긴 본문 칸보다 «위»에 둔다
//    (PC앱 webui/app.js EDIT_FIELDS 와 같은 순서·같은 라벨).
/* ════════════════════════════════════════════════════════════════════════
   🏷 분야(카테고리) 자동 분류 — PC config.py 의 규칙을 «그대로» 옮긴 것
   ────────────────────────────────────────────────────────────────────────
   왜 필요한가 (2026-08-19 확인된 결함):
     공무원앱의 「새 사업 올리기」에는 분야를 고르는 자리가 «아예 없었다».
     benefits.categories 가 빈 배열로 저장되고, 시민앱은 분야 버튼으로 사업을 찾으므로
     이렇게 올린 사업은 «분야 검색에 영영 안 걸렸다». (엑셀→클라우드 동기화로 들어온
     사업만 cloud_sync.py 가 config.categories_for_record() 로 채워 주고 있었다.)

   어떻게 고쳤나 — «자동으로 채우고, 그래도 비면 못 넘어가게» 둘 다 한다.
     ① 사업명·지원 대상·사업 내용에서 키워드를 찾아 «미리 골라» 둔다(아래 suggestCategories).
     ② 담당자가 그 결과를 눈으로 보고 고칠 수 있다(칩을 눌러 켜고 끈다).
     ③ 저장할 때 하나도 안 골랐으면 한 번 더 자동 분류를 돌리고,
        그래도 비면 «저장을 막고» 분야를 고르게 한다(빈 분야로 저장되는 길을 없앤다).

   ★★ 단일 출처 (2026-08-24 개편 · 1단계) ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      분야 «이름»의 정본은 이제 **data.json 의 categories** 다(= `config.POLICY_CATEGORIES`).
      화면은 categoryKeys() 로 그 목록을 읽는다. 아래 표는 그 목록을 «못 받았을 때»만 쓰인다.

      ⛔ 아래 표는 «비상용 폴백»이다. 정본은 data.json(= config.POLICY_CATEGORIES).
         분야가 바뀌면 여기가 아니라 config.py 를 고친다. 여기는 «못 읽었을 때»만 쓰인다.
         (행정망 프록시가 .json 을 걸러 data.js 폴백까지 실패한 경우 — loadRegionMeta 참조)

      ⚠ 그런데 이 표를 «통째로 지울 수는 없다» — 아래 키워드 목록이 「🔄 자동 분류로 채우기」
        (suggestCategories)의 재료이고, data.json 에는 이름만 있고 키워드가 없기 때문이다.
        → 2단계에서 🟢곳간이 build_data.py 에 `category_keywords` 를 실어 주면 통째로 사라진다.
      ⚠ 이름이 어긋난 적이 실제로 있었다(2026-08-24 실측): config·data.json 은 25개인데
        여기는 24개로, 없어진 「🎉 행사·축제·공연」이 남아 있고 새 분야 「💍 결혼·신혼부부」
        「🚚 전입·정착」 둘이 빠져 있었다. 담당자에게 «없는 분야»가 보이던 실사용 결함이다.
        → 그래서 이름을 여기서 읽지 않게 바꾼 것이다. 되돌리지 마세요.
      ⛔ 여기서 카테고리 «이름»을 새로 지어내지 마세요 — 이름이 한 글자라도 다르면
         시민앱 분야 버튼과 안 맞아 그 사업이 검색에서 사라집니다.
      ⛔ config.py 의 CATEGORY_OVERRIDES(사업명별 교체 보정맵 100여 건)는 옮기지 않았다.
         그것은 «엑셀에서 들어오는 기존 사업명»을 바로잡는 표라, 담당자가 손으로 올리는
         새 사업에는 해당이 없다. 필요하면 담당자가 칩으로 직접 고르면 된다.
   ════════════════════════════════════════════════════════════════════════ */
const POLICY_CATEGORIES = {
  "👶 임신·출산": ["임신", "임산부", "임신부", "출산", "출생", "난임", "산모", "산후"],
  "🧸 영유아·보육": ["영유아", "아동", "어린이", "보육", "유아", "어린이집", "유치원", "아이돌봄", "영유아돌봄", "아동돌봄"],
  "📚 청소년·교육": ["청소년", "학생", "대학생", "초등", "중등", "고등학교", "고등학생", "학교", "장학", "교육비", "교육활동비", "방과후", "학용품", "교복", "수업료", "입학준비", "돌봄교실", "진로", "체험학습"],
  "🎓 청년": ["청년", "20대", "30대", "대학생", "대학교", "취준생"],
  "👩 여성": ["여성", "경력단절", "여성기업", "산모", "임신부", "임산부", "수유부", "출산부", "난임", "산후조리", "생리용품", "자궁경부암", "예비신부"],
  "👴 노인·어르신": ["노인", "어르신", "65세 이상", "고령", "경로", "치매", "장수사진"],
  "♿ 장애인": ["장애", "장애인", "발달장애", "중증장애"],
  "👨‍👩‍👧‍👦 다자녀·가족": ["다자녀", "셋째", "둘째", "세자녀", "다둥이", "가족", "입양"],
  "👤 1인가구": ["1인가구", "1인 가구", "독거", "홀몸", "혼자 사는", "단독가구", "1인 세대"],
  "👩‍👦 한부모·조손": ["한부모", "조손", "미혼모", "미혼부"],
  "🌏 다문화·외국인": ["다문화", "결혼이주", "외국인", "이민자", "귀화"],
  "💰 저소득·기초수급": ["기초생활", "기초수급", "수급자", "수급권자", "차상위", "저소득", "빈곤", "생계", "소득재산", "소득,재산", "소득·재산"],
  "🏥 건강·의료": ["의료", "질환", "환자", "입원", "보건", "건강", "수술", "요양", "의료급여", "예방접종", "접종", "진료비", "검사비", "재활", "치료비", "약제비", "구강"],
  "🌾 농림축수산업": ["농업", "축산", "임업", "어업", "농가", "농민", "농산물", "영농", "농지", "농기계", "농장"],
  "🏡 귀농·귀촌": ["귀농", "귀촌", "귀어", "귀산촌", "농촌 정착", "농촌정착", "전원생활", "농촌 이주", "농촌이주"],
  "🏪 소상공인·기업": ["소상공인", "중소기업", "스타트업", "소기업", "창업", "시장상인", "상인회", "전통시장", "자영업", "가맹점", "점포", "기업체", "공장", "제조업"],
  "💼 일자리·구직": ["구직", "실업", "실직", "근로자", "재직자", "일자리", "고용", "취업", "노동", "자격증", "직업훈련", "채용", "면접", "인턴", "구인"],
  "🏠 주거·부동산": ["무주택", "전세", "월세", "주거", "주택", "임대", "집수리", "집 마련", "이사비", "이사지원", "이주비", "기숙사", "빈집", "슬레이트", "화장실 개선"],
  "🎖️ 보훈·유공자": ["유공자", "보훈", "참전", "제대군인", "독립유공자", "국가유공자", "상이군경", "전몰군경", "보훈보상"],
  "🎨 문화·체육·관광": ["문화예술", "문화행사", "문화시설", "체육", "관광", "예술", "도서관", "스포츠", "여행", "공연", "전시", "평생학습", "문화강좌", "문화누리", "축제", "박람회", "페스티벌", "체험행사"],
  "🚌 교통·안전": ["교통", "안전", "자동차", "대중교통", "자전거", "재난", "피해", "방범", "폭염", "한파", "차량", "운전면허", "횡단보도", "방재", "소방"],
  "🌱 환경·에너지": ["환경", "에너지", "탄소", "친환경", "쓰레기", "폐기물", "종량제", "폐건전지", "종이팩", "페트병", "재활용", "분리배출", "자원순환", "전기차", "수소차", "경유차", "폐차", "태양광", "도시가스", "새활용", "그린리모델링"],
  "💍 결혼·신혼부부": ["신혼", "예비부부", "예비신부", "예비신랑", "혼인신고", "미혼남녀", "결혼장려", "작은결혼식", "결혼식"],
  "🚚 전입·정착": ["전입", "정착지원금"],
  "📢 모집·공모": ["모집", "공모", "공모전", "선발", "참가자", "참가 신청"],
};
/* ── «사업명에 있을 때만» 인정하는 키워드 (config.NAME_ONLY_CATEGORIES 와 같은 값) ──────
   보통 키워드는 「사업명 + 지원 대상 + 사업 내용」을 함께 본다. 그런데 어떤 낱말은 자격 요건
   문구에 흔히 쓰여(예: '전입' — 「타 시·군에서 …농촌지역으로 전입한」) 남의 분야 사업까지 끌어온다.
   ⚠ 이 표가 없으면 「🔄 자동 분류로 채우기」가 귀농·귀촌 사업 8건에 🚚 전입·정착을 함께 붙여
      «전입 = 귀농»으로 뜻이 흐려진다(config.py 331~338행에 같은 이유가 적혀 있다).
   ⚠ POLICY_CATEGORIES 에도 같은 낱말이 있어야 «분야 자체»가 정의된다. 여기는 «보는 범위»만 좁힌다. */
const NAME_ONLY_CATEGORIES = {
  "🚚 전입·정착": ["전입", "정착지원금"],
};

/* 🏷 지금 쓸 분야 «이름» 목록 — 정본은 data.json(= config.POLICY_CATEGORIES).
   ⛔ Object.keys(POLICY_CATEGORIES) 로 되돌리지 마세요 — 그것이 2026-08-24 의 결함이었습니다
      (config 는 25개인데 화면은 24개, 없어진 분야가 뜨고 새 분야 둘이 안 뜸).
   ⚠ data.json 을 못 받았을 때만 사본으로 떨어진다. 사본도 25개로 맞춰 두었다 —
      폴백 경로에서 같은 결함이 다시 나지 않게. */
function categoryKeys() {
  return (Array.isArray(SJ_CATEGORIES) && SJ_CATEGORIES.length)
    ? SJ_CATEGORIES : Object.keys(POLICY_CATEGORIES);
}

// 분류용 글에서 걷어낼 «잡음 문구» — config.py _CATEGORY_NOISE_RES 와 같은 값.
//   이 문구들을 지우지 않으면 자격 요건 표기가 키워드에 부분매칭돼 엉뚱한 분야가 붙는다.
//   예) "생계·의료·주거·교육 급여 수급자" → 📚 청소년·교육 / 🏠 주거·부동산 오분류
//   [정규식, 그 자리에 넣을 글] 짝으로 둔다. 마지막 줄이 짝이 필요한 이유는 주석 참조.
const CATEGORY_NOISE_RES = [
  [/생계\s*[·ㆍ․‧,、/]\s*의료\s*[·ㆍ․‧,、/]\s*주거\s*[·ㆍ․‧,、/]\s*교육\s*급여/g, " "],
  [/교육\s*[·ㆍ․‧,、/]\s*주거\s*[·ㆍ․‧,、/]\s*의료\s*[·ㆍ․‧,、/]\s*생계\s*급여/g, " "],
  [/이후\s*출생/g, " "],           // '2024.1. 이후 출생 자녀' 는 나이 요건이지 출산지원이 아니다
  [/출생\s*[연년]도/g, " "],
  // '창업' 만 지우고 «앞의 농업·영농·귀농은 남긴다» — 🌾·🏡 분류는 그대로 살아야 하기 때문.
  // (config.py 는 뒤돌아보기(?<=농업)창업 로 같은 일을 한다. 뒤돌아보기를 못 읽는 옛 사파리에서도
  //  똑같이 동작하도록 여기서는 «잡아서 되돌려 넣는» 방식을 쓴다 — 결과는 완전히 같다)
  //   (config.py 는 붙여 쓴 «영농창업» 만 본다. 여기서는 담당자가 손으로 「영농 창업」처럼
  //    띄어 쓸 수 있으므로 \s* 를 넣었다 — 같은 뜻을 더 넓게 잡을 뿐, 분류 결과의 방향은 같다)
  [/(농업|영농|귀농)\s*창업/g, "$1 "],
];
// 「기준중위소득 N% 이하」에서 N ≤ 100 이면 사실상 소득 요건 → 💰 저소득·기초수급.
// (120·130·180% 는 저소득 요건이 아니라 일반 지원 상한이므로 제외)
const MEDIAN_INCOME_RE = /중위\s*소득\s*(\d{2,3})\s*%/g;

/** 사업 입력값에서 «붙일 만한» 분야를 골라 돌려준다(config.categories_for_record 와 같은 규칙).
 *  ⚠ config.py 와 «일부러 다른» 점이 하나 있다 — 읽는 글의 범위.
 *     config.py 는 「사업명 + 대상자 상세기준」만 본다(엑셀에는 그 칸이 늘 채워져 있다).
 *     여기서는 「사업명 + 지원 대상 + 사업 내용」을 본다. 담당자가 손으로 올리는 새 사업은
 *     지원 대상 칸을 비워 두는 일이 잦아, 그대로 두면 «분야를 하나도 못 찾는» 경우가 많다.
 *     넓게 잡아 «미리 골라 주고», 담당자가 눈으로 보고 끄는 편이 안전하다(빈 분야로 저장되는 것보다).
 */
function suggestCategories(rec) {
  rec = rec || {};
  let text = [rec.name, rec.target, rec.content].map((v) => String(v || "")).join(" ");
  /* 🚚 «사업명에 있을 때만» 보는 분야를 위해 사업명도 따로 둔다(NAME_ONLY_CATEGORIES 참조).
     잡음 지우기는 두 글에 «똑같이» 걸어야 판정이 갈리지 않는다. */
  let nameText = String(rec.name || "");
  CATEGORY_NOISE_RES.forEach((pair) => {
    text = text.replace(pair[0], pair[1]);
    nameText = nameText.replace(pair[0], pair[1]);
  });
  const extra = new Set();
  let m;
  MEDIAN_INCOME_RE.lastIndex = 0;
  while ((m = MEDIAN_INCOME_RE.exec(text)) !== null) {
    const pct = parseInt(m[1], 10);
    if (!isNaN(pct) && pct <= 100) { extra.add("💰 저소득·기초수급"); break; }
  }
  return categoryKeys().filter((cat) => {
    if (extra.has(cat)) return true;
    /* ⚠ 이름은 data.json 에서 오고 키워드는 아래 사본에서 온다 — 새 분야가 생겼는데
       키워드가 아직 없을 수 있다. 그때는 «자동으로는 안 붙고» 담당자가 칩으로 직접 고른다.
       ⛔ 여기서 임의의 키워드를 지어내지 마세요. 틀리게 붙는 것이 안 붙는 것보다 나쁩니다. */
    const kws = POLICY_CATEGORIES[cat];
    if (!Array.isArray(kws) || !kws.length) return false;
    // 🚚 사업명만 보는 분야 — 자격 요건 문구('…전입한 자')에 끌려오지 않게 범위를 좁힌다
    const hay = Object.prototype.hasOwnProperty.call(NAME_ONLY_CATEGORIES, cat) ? nameText : text;
    return kws.some((k) => hay.indexOf(k) !== -1);
  });
}

// 편집 모달에서 «지금 골라 둔» 분야. 모달을 열 때마다 새로 채운다.
let EDIT_CATS = new Set();

/* 칩으로 보여 줄 분야 목록 — 정본 목록(categoryKeys) + «이미 붙어 있는데 목록에 없는» 것.
   왜 더하나: 목록에 없는 분야를 그냥 버리면, 그 사업을 한 번 수정하는 것만으로
   시민앱에서 그 분야로 찾던 길이 «조용히» 끊긴다. 모르는 값도 보여 주고 지키게 한다.
   ⚠ 개수를 주석에 적어 두지 않는다 — 분야는 config.py 에서 늘고 줄기 때문에
     여기 적어 둔 숫자는 반드시 언젠가 거짓말이 된다(예전 주석은 「기본 26종」이라 적혀 있었다). */
function editCatKeys() {
  const base = categoryKeys();
  const extra = [...EDIT_CATS, ...CATS].filter((c) => c && base.indexOf(c) === -1);
  return base.concat([...new Set(extra)].sort());
}

// 분야 칩 다시 그리기(편집 모달 안). 켜고 끄기는 aria-pressed 로도 알린다(색 의존 금지).
function renderEditCats() {
  const box = $("#editCatChips");
  if (!box) return;
  box.innerHTML = "";
  editCatKeys().forEach((cat) => {
    const on = EDIT_CATS.has(cat);
    const c = el("button", "chip" + (on ? " on" : ""));
    c.type = "button";
    c.textContent = cat;
    c.setAttribute("aria-pressed", on ? "true" : "false");
    // ★ «복수 선택» — 누를 때마다 그 분야 하나만 켜고 끈다(다른 선택은 그대로 남는다).
    //   ⛔ 드롭다운(select)으로 바꾸지 마세요. 한 사업이 여러 분야에 걸치는 일이 흔합니다
    //      (예: 청년 + 주거 + 저소득). 2026-08-19 양호창님 조건.
    c.onclick = () => {
      if (EDIT_CATS.has(cat)) EDIT_CATS.delete(cat); else EDIT_CATS.add(cat);
      renderEditCats();
      setEditCatErr("");          // 하나라도 고르면 오류 안내를 지운다
      refreshEditCatStale();      // 방금 켠 분야가 «추천 남은 것»에서 빠지도록 다시 계산
    };
    box.appendChild(c);
  });
  updateEditCatCount();
}
// 분야 미선택 오류 — 브라우저 alert() 이 아니라 «화면 안» 안내로 알린다(PC앱 webui 와 같은 말투).
function setEditCatErr(msg) {
  const box = $("#editCatErr"), txt = $("#editCatErrText");
  if (!box || !txt) return;
  txt.textContent = msg || "";        // ⚠ 표식(SVG)은 그대로 두고 «글»만 갈아 끼운다
  box.hidden = !msg;
  if (msg) announce(msg);             // role="alert" 와 별개로 라이브영역에도 한 번 실어 보낸다
}
function updateEditCatCount() {
  const n = $("#editCatCount");
  // 몇 개를 골랐는지 «수»로 알린다 — 복수 선택이라는 사실이 화면에서도 드러난다.
  if (n) n.textContent = EDIT_CATS.size ? `분야 ${EDIT_CATS.size}개 선택됨` : "아직 고르지 않았습니다";
  // «작성 중 내용 지킴»(formSnapshot)은 input/textarea/select 만 본다 → 고른 결과를 숨은 칸에 적어 둔다.
  const s = $("#editCatState");
  if (s) s.value = [...EDIT_CATS].sort().join("|");
}
// 지금 입력칸에 적힌 내용으로 분야를 «다시» 자동 분류한다(담당자가 누를 때 + 저장 직전 마지막 방어).
function autofillEditCats() {
  const get = (k) => { const e = $(`#f_${k}`); return e ? e.value : ""; };
  const found = suggestCategories({ name: get("name"), target: get("target"), content: get("content") });
  found.forEach((c) => EDIT_CATS.add(c));      // 담당자가 손으로 고른 것은 지우지 않는다(더하기만)
  renderEditCats();
  return found;
}

/* 🔁 «수정» 화면에서만 — 사업명·지원 대상·사업 내용을 고쳤을 때 분야를 다시 보라고 알린다.
   왜: 지금까지 공무원앱은 지원 대상을 고쳐도 categories 가 옛 값 그대로 저장됐다(🟢곳간 지적).
       담당자가 «분야도 같이 봐야 한다»는 것을 알 방법이 화면에 없었던 것이 원인이다.
   ⚠ 모달을 «열자마자» 띄우지 않는다 — 저장된 분야는 보정맵(CATEGORY_OVERRIDES)으로 좁혀 둔
      경우가 많아, 열 때마다 뜨면 «늘 뜨는 잔소리»가 되어 아무도 안 읽는다.
      담당자가 실제로 글을 «고친 뒤», 그리고 «아직 안 고른 분야가 있을 때»만 뜬다. */
let EDIT_TEXT_TOUCHED = false;
function refreshEditCatStale() {
  const box = $("#editCatStale"), txt = $("#editCatStaleText");
  if (!box || !txt) return;
  if (!EDIT_TEXT_TOUCHED) { box.hidden = true; return; }
  const get = (k) => { const e = $(`#f_${k}`); return e ? e.value : ""; };
  const missing = suggestCategories({ name: get("name"), target: get("target"), content: get("content") })
    .filter((c) => !EDIT_CATS.has(c));
  if (!missing.length) { box.hidden = true; return; }
  txt.textContent = `고치신 내용에는 «${missing.join(", ")}» 도 어울립니다. `
    + `맞다면 «자동 분류로 채우기»를 누르거나 아래에서 직접 켜 주세요.`;
  box.hidden = false;
}

const FIELDS = [
  ["사업명", "name", false], ["담당팀", "team", false], ["담당 연락처", "contact", false],
  ["담당자 이메일", "manager_email", false],
  [NOTE_LABEL + " (비고)", NOTE_KEY, true,
   "접수 마감·재접수 시기 등 지금 신청할 수 있는지에 대한 안내. 입력하면 목록과 시민 앱에 함께 표시됩니다.", true],
  ["지원 대상", "target", true],
  ["사업 내용", "content", true], ["이용 방법", "method", true], ["필요 서류", "documents", true],
];
// 실제로 그릴 입력칸 — note 컬럼이 아직 없으면 그 칸을 통째로 뺀다.
// (없는 컬럼을 payload 에 담으면 PGRST204 로 «저장 자체»가 실패하기 때문)
function editFields() {
  return FIELDS.filter(([, key]) => key !== NOTE_KEY || NOTE_OK);
}
// 저장/삭제 실패 메시지: RLS(권한) 거부면 «재로그인·계정 권한» 안내로 친절하게.
// ───────── 오류 원인 분류 ─────────
// 무료 플랜 일시정지로 클라우드가 통째로 멈췄을 때 화면엔 "불러오기 실패"만 떠서
// 원인 파악이 불가능했던 사고가 있었다 → 연결/권한/미설정을 문구로 구분한다.
//   conn  : 네트워크·서버 미응답(오프라인, fetch 실패, 5xx, 프로젝트 일시정지)
//   perm  : 권한(RLS)·인증 거부
//   setup : 테이블·함수 미생성(스키마 미적용)
//   other : 그 밖
function errKind(error) {
  if (!error) return "other";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "conn";
  const msg = String(error.message || error || "").toLowerCase();
  const code = String(error.code || error.status || "");
  if (error.name === "TypeError" && msg.indexOf("fetch") >= 0) return "conn";
  if (/failed to fetch|networkerror|network error|load failed|timeout|timed out|econnrefused|fetch failed/.test(msg)) return "conn";
  if (/^(5\d\d|0|429)$/.test(code)) return "conn";
  if (/service unavailable|bad gateway|gateway timeout|temporarily unavailable|paused|infrastructure/.test(msg)) return "conn";
  if (code === "42501" || code === "401" || code === "403" ||
      /row-level security|\brls\b|permission|policy|not authorized|violates|jwt|api key/.test(msg)) return "perm";
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205" ||
      /does not exist|could not find the (table|function)|schema cache/.test(msg)) return "setup";
  return "other";
}

// 목록 자리에 넣을 오류 안내 HTML(원인별 문구 + 다시 시도 버튼)
function errBoxHtml(error, retryId) {
  const kind = errKind(error);
  const btn = retryId ? `<button id="${retryId}" class="err-retry" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 18v-5h5"/></svg><span>다시 시도</span></button>` : "";
  if (kind === "conn") {
    return `<div class="err-box" role="alert">
      <div class="err-title">⏸ 클라우드 서비스가 일시적으로 응답하지 않습니다.</div>
      <div class="err-desc">잠시 후 다시 시도해 주세요.<br>계속되면 인터넷 연결 또는 Supabase 프로젝트 상태를 확인해 주세요.</div>
      ${btn}</div>`;
  }
  if (kind === "perm") {
    return `<div class="err-box" role="alert">
      <div class="err-title">🔒 접근 권한이 없어 불러오지 못했습니다.</div>
      <div class="err-desc">로그인이 만료되었거나 이 계정에 열람 권한이 없습니다.<br>
        «로그아웃» 후 다시 로그인해 보시고, 그래도 안 되면 시스템 담당자에게 계정 권한을 확인해 주세요.</div>
      ${btn}</div>`;
  }
  if (kind === "setup") {
    return `<div class="err-box" role="alert">
      <div class="err-title">🛠 DB 설정이 아직 적용되지 않았습니다.</div>
      <div class="err-desc">필요한 테이블·함수(SQL)를 먼저 적용해 주세요.</div>
      ${btn}</div>`;
  }
  return `<div class="err-box" role="alert">
    <div class="err-title">불러오지 못했습니다.</div>
    <div class="err-desc">${esc(error && error.message ? error.message : "알 수 없는 오류")}</div>
    ${btn}</div>`;
}

// 오류 박스를 그리고 «다시 시도» 버튼에 재조회 함수를 연결
function showLoadError(boxSel, error, retryId, retryFn) {
  const box = $(boxSel);
  if (!box) return;
  box.innerHTML = errBoxHtml(error, retryId);
  const b = $("#" + retryId);
  if (b) b.onclick = retryFn;
  announce(errKind(error) === "conn"
    ? "클라우드 서비스가 일시적으로 응답하지 않습니다."
    : "목록을 불러오지 못했습니다.");
}

function writeErrMsg(error, verb) {
  // 연결 자체가 안 되는 경우를 권한 문제와 구분(원인 오인 방지)
  if (errKind(error) === "conn") {
    return "⏸ 클라우드 서비스가 일시적으로 응답하지 않습니다.\n잠시 후 다시 시도해 주세요.\n(계속되면 인터넷 연결 또는 Supabase 프로젝트 상태를 확인해 주세요.)";
  }
  const msg = (error && error.message ? error.message : "").toLowerCase();
  const code = error && error.code ? String(error.code) : "";
  const isPerm =
    code === "42501" || // insufficient_privilege (Postgres)
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("permission") ||
    msg.includes("policy") ||
    msg.includes("not authorized") ||
    msg.includes("violates");
  if (isPerm) {
    return "⚠️ 저장 권한이 없습니다.\n로그인이 만료되었거나 이 계정에 수정 권한이 없습니다.\n" +
           "«로그아웃» 후 다시 로그인해 보시고, 그래도 안 되면 시스템 담당자에게 계정 권한을 확인해 주세요.";
  }
  return `${verb} 실패: ` + (error && error.message ? error.message : "알 수 없는 오류");
}

/* ⚠ «다른 담당자가 먼저 저장했다»를 알리는 자리 — 문구는 여기 «한 곳»뿐이다 (2026-08-25).
 사업·접수·정책제안 셋이 같은 말을 해야 담당자가 «같은 일»로 알아본다.
 ⛔ 새 문구를 만들지 마세요. 대상 이름(what)만 갈아 끼웁니다.
   ⚠ what 에는 «조사까지» 붙여 넘긴다 — 「이 접수를」·「이 사업을」·「이 정책제안을」.
     「을(를)」 같은 표기를 쓰지 않는다. 받침에 따라 조사가 갈리는데 괄호로 미루면
     읽는 사람에게 «기계가 쓴 글»로 보인다.
 ⚠ askAlert 를 «기다린다» — 알림을 읽기도 전에 창이 닫히고 목록이 새로 그려지면
   왜 내 수정이 사라졌는지 알 길이 없다(사업 수정에서 이미 그렇게 정해 두었다). */
async function announceSaveConflict(what, modalSel, reload) {
announce("다른 담당자가 먼저 수정했습니다. 새로고침합니다.");
await askAlert("⚠️ 다른 담당자가 먼저 " + what + " 수정했습니다.\n"
  + "최신 내용으로 새로고침하니, 다시 확인 후 수정해 주세요.");
try { closeModal($(modalSel)); } catch (e) {}
if (typeof reload === "function") await reload();
}

function openEdit(r) {
  $("#mTitle").textContent = r ? "✏ 사업 수정" : "➕ 새 사업 추가";
  let html = "";
  editFields().forEach(([label, key, multi, hint, notice]) => {
    const v = r ? (r[key] || "") : "";
    // C8: field-label → <label for> 로 input/textarea id와 연결
    const fid = `f_${key}`, hid = hint ? `h_${key}` : "";
    const aria = hint ? ` aria-describedby="${hid}"` : "";
    // ⚠ 실제 저장을 막는 필수 칸은 사업명 하나뿐(저장 시 obj.name 검사) — 그 사실을 시각 배지뿐 아니라
    //   required/aria-required 로도 전달한다(스크린리더가 «필수»를 놓치지 않게, 2026-08-21 잣대 점검).
    const req = key === "name";
    const reqLab = req ? `${label} <span class="req-note">(필수)</span>` : label;
    const reqAttr = req ? ` required aria-required="true"` : "";
    html += `<div class="field${notice ? " notice-field" : ""}">` +
      `<label class="field-label" for="${fid}">${reqLab}</label>` +
      (hint ? `<p class="field-hint" id="${hid}">${esc(hint)}</p>` : ``) +
      (multi ? `<textarea id="${fid}" class="form-textarea" data-k="${key}"${aria}${reqAttr}>${esc(v)}</textarea>`
             : `<input id="${fid}" class="form-input" data-k="${key}"${aria}${reqAttr} value="${esc(v)}">`) + `</div>`;
  });
  /* 📎 필요 서류 서식 — 저장된 사업(r)은 «바로 등록», 새 사업은 «저장 시 함께 올림».
        새 사업에서 곧바로 올릴 수 없는 이유: 서식은 benefit_key(= 공백 뺀 사업명)로 이어지는데,
        사업명은 저장 버튼을 누르는 순간까지 얼마든지 바뀐다. 먼저 올리면 «옛 이름»에 붙어
        영영 찾을 수 없는 파일이 된다. → 목록에 담아 뒀다가 저장이 성공한 «뒤에» 올린다.

     ★★ 자리 (A-10 · 2026-08-24 양호창님 지시) ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        이 묶음은 «「필요 서류」 입력칸 바로 아래»에 온다. FIELDS 의 마지막이 「필요 서류」라
        위 for 문이 끝난 «바로 다음»이 곧 그 자리다.
        ⛔ 다시 아래로 내리지 마세요 — 예전에는 저장·삭제 버튼 뒤에 있어서, 담당자가
           「필요 서류」에 글로 적어 놓고도 «서식 파일 올리는 자리»를 버튼 너머에서 찾아야 했다.
           서로 같은 것을 말하는 두 칸은 붙어 있어야 한다.
        ⚠ FIELDS 의 차례를 바꿔 「필요 서류」가 마지막이 아니게 되면 이 자리도 함께 옮길 것. */
  if (window.SangjuForms) {
    /* 🧪 둘러보기(게스트) — «이미 저장된 사업»의 서식 칸은 서버에 곧바로 쓰는 자리라
       칸 자체를 그리지 않고 안내 한 줄로 갈음한다 (2026-08-25 A-1 · PC앱 webui 와 같은 판단).
       ⚠ «새 사업»은 여기서 올리지 않는다 — 목록에 담아만 두었다가(PENDING_FORMS)
         저장이 성공한 뒤에야 올라간다. 그 저장 단추가 이미 게스트에게 없으므로
         (게스트에게는 「새 사업 올리기」 단추 자체가 없다) 여기서 또 막을 것이 없다.
       ⚠ 칸을 안 그리면 #formsFile·#formsUpload 가 «없다». 배선(initFormsSection)은
         이미 `if (!upBtn || !fileInput) return;` 으로 감싸여 있어 그대로 안전하다. */
    const formsRO = !!r && guestSaveBlockedByServer();
    html += `<div class="forms-section" id="formsSection">
      <div class="field-label">📎 필요 서류 서식</div>
      <p class="field-hint">시민이 상세 화면에서 내려받을 서식 파일입니다. 허용: hwp·hwpx·pdf·doc(x)·xls(x)·ppt(x)·jpg·png·zip·txt · 최대 10MB.${
        r ? "" : "<br>새 사업은 <b>저장한 뒤에</b> 자동으로 함께 올라갑니다(사업명이 정해져야 파일을 이을 수 있습니다)."}</p>
      <ul class="forms-list" id="formsList" aria-live="polite"><li class="forms-empty">${r ? "불러오는 중…" : "아직 고른 서식이 없습니다."}</li></ul>
      ${formsRO ? `<p class="guest-ro"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2h.01"/></svg>${GUEST_RO_LINE}</p>` : `<div class="forms-upload">
        <input type="file" id="formsFile" class="forms-file"
          accept=".hwp,.hwpx,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.txt"
          aria-label="등록할 서식 파일 선택">
        <button type="button" id="formsUpload" class="top-btn solid">${r ? '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20V6"/><path d="M6 12l6-6 6 6"/><path d="M4 4h16"/></svg><span>서식 등록</span>' : '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg><span>목록에 담기</span>'}</button>
      </div>`}
      <p class="forms-status" id="formsStatus" role="status" aria-live="polite"></p>
    </div>`;
  }
  // 🏷 분야(카테고리) — 새 사업·수정 «둘 다»에 둔다.
  //    ⛔ 이 자리를 없애지 마세요. 없던 시절에는 공무원앱으로 올린 사업의 categories 가
  //       빈 배열이라 시민앱 «분야로 찾기»에서 통째로 사라졌습니다(2026-08-19 확인).
  html += `<div class="field">
      <div class="field-label" id="editCatLab">🏷 분야${r
        ? ` <span class="field-opt">(여러 개 고를 수 있습니다 · 비워 두면 자동으로 분류합니다)</span>`
        : ` <span class="req-note">(필수 · 하나 이상 · 여러 개 고를 수 있습니다)</span>`}</div>
      <p class="field-hint" id="editCatHint">시민이 <b>«분야로 찾기»</b>에서 이 사업을 만나는 길입니다. 칩을 눌러 켜고 끕니다 — <b>여러 개</b>를 동시에 고를 수 있습니다.${r
        ? ` 비워 두고 저장하면 사업명·내용을 보고 자동으로 분류합니다.`
        : ` <b>하나 이상</b> 골라야 저장됩니다. «자동 분류로 채우기»를 누르면 사업명·내용을 보고 골라 드립니다(고른 뒤 확인해 주세요).`}</p>
      <div class="forms-upload">
        <button type="button" id="editCatAuto" class="top-btn ghost"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 18v-5h5"/></svg><span>자동 분류로 채우기</span></button>
        <span class="forms-status" id="editCatCount" role="status" aria-live="polite"></span>
      </div>
      <!-- ⛔ 드롭다운으로 바꾸지 마세요 — 복수 선택이 «필수 조건»입니다(2026-08-19 양호창님).
           칩마다 aria-pressed 를 켜고 꺼서, 낭독기에도 «여러 개를 켜고 끄는 자리»로 전달된다.
           키보드는 Tab 으로 칩 사이를 옮기고 Enter·Space 로 켜고 끈다(button 기본 동작 그대로). -->
      <div id="editCatChips" class="chips grid mt-8" role="group" aria-labelledby="editCatLab" aria-describedby="editCatHint"></div>
      <!-- 미선택 오류 — 브라우저 alert() 대신 «화면 안» 경고. role="alert" 이라 뜨는 순간 낭독된다. -->
      <p class="field-err" id="editCatErr" role="alert" hidden><span aria-hidden="true">⚠</span><span id="editCatErrText"></span></p>
      <!-- 🔁 «내용을 고쳤는데 분야는 옛 값 그대로» 를 막는 알림(수정 화면에서만 뜬다).
           지원 대상·사업 내용을 손보면 어울리는 분야가 달라지는데, 칩을 안 건드리면
           예전 분야가 그대로 저장돼 시민앱 분야 검색이 어긋난다(2026-08-19 🟢곳간 지적). -->
      <p class="field-note" id="editCatStale" role="status" aria-live="polite" hidden><span aria-hidden="true">🔄</span><span id="editCatStaleText"></span></p>
      <!-- 칩은 <button> 이라 «작성 중 내용 지킴»(formSnapshot) 이 못 본다.
           고른 결과를 이 숨은 칸에 같이 적어 두어, 분야만 바꾸고 닫아도 되묻게 한다. -->
      <input type="hidden" id="editCatState" value="">
    </div>`;
  /* 💾 저장 · 🗑 삭제 — ★ «맨 아래» (A-10 · 2026-08-24 양호창님 지시)
     ⛔ 위로 올리지 마세요. 예전에는 분야 칩·서식 등록보다 «먼저» 나와서,
        버튼을 만난 담당자가 「다 됐구나」 하고 눌러 버렸다 — 그 아래 칸은 채워지지 않은 채로.
        «끝내는 단추»는 언제나 «채울 것이 다 끝난 뒤»에 온다.
     ⚠ 삭제는 «맨 끝» — 되돌릴 수 없는 단추를 먼저 닿는 자리에 두지 않는다
        (정책제안 모달 #pmSave → #pmDelete 와 같은 차례). */
  /* 🧪 둘러보기(게스트)에게는 «저장·삭제»를 아예 내보내지 않는다 (2026-08-25 A-1).
     ★ 왜 삭제만이 아니라 저장까지 감추나 — 저장도 «쓰기»라서 _guestBlocked() 에 걸린다.
       예전에는 저장 단추만 남아 있어, 게스트가 긴 서식을 다 채우고 「저장」을 누른 뒤에야
       「테스트 모드에서는…」 을 만났다. 확인창·입력을 다 지나온 뒤 만나는 실패는 막다른 길이다.
       (수정으로 내용을 비우면 삭제와 다르지 않다는 점도 PC앱 webui 와 같은 판단이다.)
     ⛔ 화면에서 감추는 것은 «안내»이지 «방어»가 아니다 — 실제 차단은 RLS 와
        installGuestReadOnlyGuard 가 한다. 그래도 감추는 까닭은 이 저장소 규약 —
        「눌러 봐야 실패할 조작을 남기지 않는다」(#btnAcct·#btnChangePw 와 같은 규약).
     ⚠ 빈 자리만 남기지 않는다 — «왜 없는지»를 .guest-ro 한 줄로 말한다(규격서 §5).
     ⚠ 아래 `$("#mSave").onclick = …` 은 반드시 «있을 때만» 건다. 안 감싸면
        null.onclick 에서 예외가 나 사업 창이 통째로 죽는다. */
  html += `<div class="modal-actions">` +
    (guestSaveBlockedByServer() ? `` : `<button id="mSave" class="top-btn solid"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4"/><path d="M8 20v-6h8v6"/></svg><span>저장</span></button>`) +
    (r && !guestNoDelete() ? `<button id="mDel" class="top-btn danger"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg><span>삭제</span></button>` : ``) +
    (IS_GUEST ? `<p class="guest-ro"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2h.01"/></svg>${guestCanWrite() ? GUEST_RO_LINE
      : "둘러보기(테스트) 중에는 사업을 저장·삭제할 수 없습니다. 담당자 계정으로 로그인해 주세요."}</p>` : ``) +
    `</div>`;
  $("#mBody").innerHTML = html;

  // 분야 칩 채우기.
  //   · 수정  = 지금 붙어 있는 분야를 그대로 켜 둔다(모르는 값도 버리지 않는다 — editCatKeys 참조).
  //   · 새 사업 = «비운 채»로 시작한다. 담당자가 저장 전에 «직접» 고르는 것이 이 화면의 요구사항이라
  //     (2026-08-19 양호창님 결정) 미리 채워 두면 확인 없이 그대로 저장되기 때문이다.
  //     대신 「자동 분류로 채우기」 버튼 한 번으로 후보를 받아 보고 고칠 수 있다.
  EDIT_CATS = new Set(r && Array.isArray(r.categories) ? r.categories.filter(Boolean) : []);
  EDIT_TEXT_TOUCHED = false;
  renderEditCats();
  setEditCatErr("");
  refreshEditCatStale();
  // 🔁 «수정» 화면에서만 — 분류에 쓰이는 세 칸을 지켜보다가, 고치면 분야를 다시 보라고 알린다.
  //    새 사업은 어차피 «하나 이상 필수»라 따로 알릴 것이 없다.
  if (r) ["name", "target", "content"].forEach((k) => {
    const box = $(`#f_${k}`);
    if (box) box.addEventListener("input", debounce(() => {
      EDIT_TEXT_TOUCHED = true;
      refreshEditCatStale();
    }, 400));
  });
  $("#editCatAuto").onclick = () => {
    const found = autofillEditCats();
    setEditCatErr("");
    refreshEditCatStale();
    announce(found.length
      ? `분야 ${found.length}개를 자동으로 골랐습니다. 맞는지 확인해 주세요.`
      : "사업명·내용에서 알아볼 수 있는 분야가 없습니다. 직접 골라 주세요.");
  };

  /* ⚠ 널가드 — 둘러보기(게스트)에서는 위에서 «저장 단추를 그리지 않았다».
     감싸지 않으면 여기서 null.onclick 으로 예외가 나 사업 창이 그 자리에서 죽는다. */
  const mSaveBtn = $("#mSave");
  if (mSaveBtn) mSaveBtn.onclick = async () => {
    const saveBtn = $("#mSave");
    const obj = {};
    document.querySelectorAll("#mBody [data-k]").forEach((e) => { obj[e.dataset.k] = e.value; });
    if (!(obj.name || "").trim()) { announce("사업명을 입력하세요."); askAlert("사업명을 입력하세요."); const nm = $("#f_name"); if (nm) nm.focus(); return; }
    // 🏷 분야 — 새 사업과 수정의 규칙이 «다르다»(2026-08-19 양호창님 결정, PC앱 webui 와 동일).
    //   · 새 사업 : 하나 이상 «직접» 골라야 저장된다. 안 골랐으면 화면 안 오류로 알리고 멈춘다.
    //     (키워드 자동분류만 믿으면 「문화누리 이용권 지원」·「상주 화장품 산업 육성」처럼
    //      한 개도 안 붙는 사업이 생겨, 시민앱 분야 검색에서 영영 빠진다 — 실측 확인됨)
    //   · 수정   : 강제하지 않는다. 비워 두면 예전처럼 자동분류 결과로 채워 저장한다.
    if (!r && !EDIT_CATS.size) {
      setEditCatErr("분야를 하나 이상 골라 주세요. 분야가 없으면 시민 앱의 «분야로 찾기»에서 이 사업이 보이지 않습니다.");
      const c = $("#editCatChips button"); if (c) c.focus();     // 초점을 «고쳐야 할 자리»로 옮긴다
      return;                                                    // ⛔ 여기서 alert() 을 쓰지 말 것
    }
    if (r && !EDIT_CATS.size) autofillEditCats();
    // ── 저장 형식 (2026-08-19 🟢곳간 확정) ────────────────────────────────
    //   클라우드 benefits.categories 는 «text[]» → 고른 키를 그대로 «배열»로 넣는다.
    //   ⛔ ", " 로 이어 붙인 «한 줄 문자열»로 바꾸지 마세요 — 그 표기는 «엑셀 한 칸» 전용이고
    //      (config.categories_to_cell), 클라우드에 넣으면 통째로 «분야 이름 한 개»가 됩니다.
    //   값은 POLICY_CATEGORIES 키 원문(이모지·가운뎃점·띄어쓰기 포함) 그대로다 —
    //   PC cloud_sync.sync_benefits 도, 시민앱 adaptCloudRow 도 같은 문자열을 읽는다.
    obj.categories = [...EDIT_CATS];
    if (saveBtn) saveBtn.disabled = true;
    try {
      await saveBenefit(r, obj);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

// 저장 본체 — 위 onclick 이 길어져 흐름이 안 보이게 되므로 따로 뺐다(동작은 그대로).
  async function saveBenefit(r, obj) {
    if (r) {
      // 낙관적 잠금: 내가 연 이후 다른 담당자가 먼저 수정했는지 updated_at으로 확인
      let { data, error } = await sb.from("benefits")
        .update(obj).eq("id", r.id).eq("updated_at", r.updated_at).select();
      // 📌 접수 안내 컬럼이 그사이 사라졌거나 감지가 어긋난 경우 — note 를 빼고 1회만 재시도.
      // (사업 내용 전체가 저장 실패로 날아가는 것보다, 접수 안내만 못 담는 편이 낫다)
      if (error && isMissingNoteColumn(error) && NOTE_KEY in obj) {
        NOTE_OK = false; delete obj[NOTE_KEY];
        ({ data, error } = await sb.from("benefits")
          .update(obj).eq("id", r.id).eq("updated_at", r.updated_at).select());
      }
      // 🏷 categories 컬럼이 없는 옛 스키마라면 그 칸만 빼고 한 번 더(사업 내용이 통째로 날아가지 않게)
      if (error && isMissingCatColumn(error) && "categories" in obj) {
        delete obj.categories;
        ({ data, error } = await sb.from("benefits")
          .update(obj).eq("id", r.id).eq("updated_at", r.updated_at).select());
      }
      if (error) { announce(writeErrMsg(error, "저장")); askAlert(writeErrMsg(error, "저장")); return; }
      if (!data || !data.length) {
        await announceSaveConflict("이 사업을", "#modal", loadBenefits);
        return;
      }
    } else {
      // 새 사업 — 저장된 «행»을 돌려받는다(.select()). 그 행이 있어야 뒤이어 서식을 올릴 수 있다.
      let { data, error } = await sb.from("benefits").insert(obj).select();
      if (error && isMissingNoteColumn(error) && NOTE_KEY in obj) {
        NOTE_OK = false; delete obj[NOTE_KEY];
        ({ data, error } = await sb.from("benefits").insert(obj).select());
      }
      // 🏷 categories 컬럼이 없는 옛 스키마라면 그 칸만 빼고 한 번 더(사업 자체는 저장되게)
      if (error && isMissingCatColumn(error) && "categories" in obj) {
        delete obj.categories;
        ({ data, error } = await sb.from("benefits").insert(obj).select());
      }
      if (error) { announce(writeErrMsg(error, "저장")); askAlert(writeErrMsg(error, "저장")); return; }
      // 📎 「저장 시 함께 올림」으로 담아 둔 서식을 «지금» 올린다(사업명이 확정된 뒤).
      //    ⚠ 여기서 실패해도 사업 저장은 이미 끝났다 — 되돌리지 않고 «무엇이 안 올라갔는지»만 알린다.
      const saved = (data && data[0]) || { name: obj.name };
      await uploadPendingForms(saved);
    }
    closeModal($("#modal"));
    // 🎉 「저장했습니다 · 오늘 3번째」 — 움직임과 낭독이 «같은 문구»를 쓴다(§14).
    const dt = doneText("저장했습니다");
    showDoneCheck(dt);
    announce(dt.replace("저장했습니다", "저장되었습니다") + ".");
    await loadBenefits();
  }
  // 🔒 연타 방어(bindOnce) — 확인창을 두 번 띄우거나 delete 를 두 번 보내지 않는다.
  if (r && !guestNoDelete()) bindOnce($("#mDel"), async () => {
    // 되돌릴 수 없는 삭제 — 초점은 «취소»에 놓인다(askConfirm 규약).
    const ok = await askConfirm({
      title: "이 사업을 삭제할까요?",
      body: "삭제하면 시민 화면에서도 사라집니다.",
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    const res = await sb.from("benefits").delete().eq("id", r.id);
    if (res.error) { announce(writeErrMsg(res.error, "삭제")); askAlert(writeErrMsg(res.error, "삭제")); return; }
    closeModal($("#modal"));
    announce("삭제되었습니다.");
    await loadBenefits();
  });
  PENDING_FORMS = [];                       // 「저장 시 함께 올림」 목록은 모달을 열 때마다 비운다
  if (window.SangjuForms) initFormsSection(r);
  openModal($("#modal"));
}

/* ── 📎 필요 서류 서식 등록/삭제 (편집 모달 내부) ─────────────────────
   저장소 규약: _workspace/서식스토리지_클라이언트_규약.md
   실제 Storage·테이블 접근은 공용 헬퍼 window.SangjuForms 가 담당.
   forms_storage.sql 미실행이면 listForms 가 조용히 [] → "등록된 서식 없음". */
function fSetStatus(msg, isErr) {
  const el = $("#formsStatus");
  if (el) { el.textContent = msg || ""; el.classList.toggle("err", !!isErr); }
  if (msg) announce(msg);
}
async function refreshFormsList(r) {
  const list = $("#formsList");
  if (!list || !window.SangjuForms) return;
  let rows = [];
  try { rows = await SangjuForms.listForms(r); } catch (e) { rows = []; }
  if (!rows.length) {
    list.innerHTML = `<li class="forms-empty">등록된 서식이 없습니다.</li>`;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const nm = String(row.file_name || "서식");
    const ext = (nm.split(".").pop() || "").toUpperCase();
    const size = SangjuForms.formatSize(row.size);
    const meta = (ext ? ext + " 파일" : "파일") + (size ? " · " + size : "");
    const url = safeHref(row.public_url);      // http(s)·상대경로만 링크로 만든다
    // ⚠ KWCAG 2.2 6.4.2(사용자 요구에 따른 실행)·5.1.1(적절한 대체 텍스트) —
    //    새 탭으로 열리는 사실과 파일형식·용량을 링크의 접근명(aria-label)에 포함한다.
    //    시민앱(app.js renderFormsDownload)과 같은 원칙(2026-08-20 잣대 수정).
    const ariaLabel = esc(nm) + " (" + esc(meta) + ", 새 창에서 열림)";
    const nameHtml = url
      ? `<a class="forms-item-name" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${ariaLabel}">📄 ${esc(nm)}</a>`
      : `<span class="forms-item-name">📄 ${esc(nm)}</span>`;
    return `<li class="forms-item" data-id="${esc(String(row.id))}">
        <span class="forms-item-main">${nameHtml}<span class="forms-item-meta" aria-hidden="true">${esc(meta)}</span></span>
        ${guestNoDelete() ? "" : `<button type="button" class="forms-del" aria-label="${esc(nm)} 서식 삭제"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg><span>삭제</span></button>`}
      </li>`;
  }).join("");
  // 삭제 버튼 바인딩(행 데이터는 클로저로 잡아둔다)
  const byId = {};
  rows.forEach((row) => { byId[String(row.id)] = row; });
  list.querySelectorAll(".forms-item").forEach((li) => {
    const row = byId[li.dataset.id];
    const btn = li.querySelector(".forms-del");
    if (btn) btn.onclick = async () => {
      const ok = await askConfirm({
        title: "서식을 삭제할까요?",
        body: `'${row.file_name}' 파일을 저장소에서 지웁니다. 되돌릴 수 없습니다.`,
        cancelText: "취소",
        okText: "삭제"
      });
      if (!ok) return;
      btn.disabled = true;
      fSetStatus("삭제 중…");
      try {
        await SangjuForms.deleteForm(row);
        fSetStatus("서식을 삭제했습니다.");
        await refreshFormsList(r);
      } catch (e) {
        btn.disabled = false;
        const m = (e && e.message) || "삭제에 실패했습니다.";
        fSetStatus(m, true); askAlert(m);
      }
    };
  });
}
/* ── 📎 «새 사업» 의 서식 — 저장 시 함께 올림 ────────────────────────────
   서식은 benefit_key(= 공백 뺀 사업명)로 사업과 이어진다. 그래서 사업명이 확정되기 «전»에
   올리면 옛 이름에 붙어 버려 시민 화면에서 영영 찾을 수 없다.
   → 등록 화면에서는 파일을 «담아만» 두고(PENDING_FORMS), 저장이 성공한 직후 순서대로 올린다.
   ⚠ 업로드가 실패해도 사업 저장은 되돌리지 않는다 — 무엇이 안 올라갔는지 «이름»으로 알린다. */
let PENDING_FORMS = [];

// 담아 둔 파일 목록 그리기(아직 서버에 없는 파일이라 «저장 시 함께 올림» 표를 단다)
function renderPendingForms() {
  const list = $("#formsList");
  if (!list) return;
  if (!PENDING_FORMS.length) {
    list.innerHTML = `<li class="forms-empty">아직 고른 서식이 없습니다.</li>`;
    return;
  }
  list.innerHTML = PENDING_FORMS.map((f, i) => {
    const size = SangjuForms.formatSize(f.size);
    return `<li class="forms-item" data-i="${i}">
        <span class="forms-item-main"><span class="forms-item-name">📄 ${esc(f.name)}</span>
          <span class="forms-item-meta">${esc(size)}${size ? " · " : ""}저장 시 함께 올림</span></span>
        <button type="button" class="forms-del" aria-label="${esc(f.name)} 목록에서 빼기"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg><span>빼기</span></button>
      </li>`;
  }).join("");
  list.querySelectorAll(".forms-item").forEach((li) => {
    const btn = li.querySelector(".forms-del");
    if (btn) btn.onclick = () => {
      PENDING_FORMS.splice(Number(li.dataset.i), 1);
      renderPendingForms();
      fSetStatus("목록에서 뺐습니다.");
    };
  });
}

// 저장 성공 직후 호출 — 담아 둔 파일을 «하나씩 차례로» 올린다(동시에 올리면 이름 충돌 회피가 꼬인다).
async function uploadPendingForms(benefit) {
  if (!PENDING_FORMS.length || !window.SangjuForms) return;
  const failed = [];
  for (const f of PENDING_FORMS) {
    fSetStatus(`서식 올리는 중… (${f.name})`);
    try { await SangjuForms.uploadForm(benefit, f); }
    catch (e) { failed.push(f.name + " — " + ((e && e.message) || "업로드 실패")); }
  }
  const total = PENDING_FORMS.length;
  PENDING_FORMS = [];
  if (failed.length) {
    // 사업은 이미 저장됐다. 되돌리지 않고 «무엇을 다시 올려야 하는지»만 분명히 알린다.
    const m = `사업은 저장했습니다.\n다만 서식 ${total}건 중 ${failed.length}건을 올리지 못했습니다.\n\n`
            + failed.join("\n")
            + `\n\n목록에서 이 사업을 다시 열어 «서식 등록»으로 올려 주세요.`;
    announce(`서식 ${failed.length}건을 올리지 못했습니다.`);
    askAlert(m);
  } else {
    announce(`서식 ${total}건을 함께 올렸습니다.`);
  }
}

function initFormsSection(r) {
  const fileInput = $("#formsFile");
  const upBtn = $("#formsUpload");
  if (r) refreshFormsList(r); else renderPendingForms();
  if (!upBtn || !fileInput) return;
  upBtn.onclick = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { fSetStatus("등록할 파일을 선택해 주세요.", true); return; }
    // 검증은 «담을 때»도 «올릴 때»와 똑같이 한다(forms.js validateFile 하나만 쓴다).
    const bad = SangjuForms.validateFile(file);
    if (bad) { fSetStatus(bad, true); askAlert(bad); return; }
    // ── 새 사업: 서버에 올리지 않고 목록에 담아만 둔다 ──
    if (!r) {
      if (PENDING_FORMS.some((f) => f.name === file.name && f.size === file.size)) {
        fSetStatus("이미 목록에 있는 파일입니다.", true); return;
      }
      PENDING_FORMS.push(file);
      fileInput.value = "";
      renderPendingForms();
      fSetStatus("목록에 담았습니다. 저장하면 함께 올라갑니다.");
      return;
    }
    // ── 이미 저장된 사업: 예전 그대로 바로 올린다 ──
    upBtn.disabled = true;
    fSetStatus("업로드 중…");
    try {
      await SangjuForms.uploadForm(r, file);
      fileInput.value = "";
      fSetStatus("서식을 등록했습니다.");
      await refreshFormsList(r);
    } catch (e) {
      const m = (e && e.message) || "업로드에 실패했습니다.";
      fSetStatus(m, true); askAlert(m);
    } finally {
      upBtn.disabled = false;
    }
  };
}

/* ============================================================
   🗳 정책제안 관리 (Phase A) — proposals / proposal_reports
   기존 사업관리·로그인·게스트·실시간 무손상. 추가 모듈.
   ============================================================ */
const P_STATUSES = ["접수", "검토중", "반영", "불채택", "보류"];
// 정책제안에서 읽어 올 칸 — pin_hash 제외(아래 loadProposals 머리말 참고).
/* ══════════════════════════════════════════════════════════════════════
   📋 정책제안 목록에서 «불러올 칸» — ⛔ select("*") 를 쓰지 마세요.
   ────────────────────────────────────────────────────────────────────
   proposals 에는 익명이 읽으면 안 되는 칸(pin_hash 등)이 있어 칸 권한이 회수돼 있습니다.
   select("*") 를 쓰면 회수된 칸까지 달라는 뜻이 되어 «목록 전체»가 401 로 떨어집니다.
   ⚠ 칸을 더할 때는 반드시 «여기 목록에 더해서» 부르세요(2026-08-24 🩷자물쇠 확인).
   ⚠ 반대로, proposal_comments 는 회수한 칸이 없어 select("*") 를 써도 됩니다.
   ★ 2026-08-24 추가된 칸 (SQL 4개 적용 완료 · 🩷자물쇠 검증 통과)
      proposal_no    제안 접수번호 YYYYMMDD-HHMMSS-NN (신청접수 receipt_no 와 «글자 그대로» 같은 형식)
      comment_count  댓글·답글 수(트리거가 맞춰 준다 — 화면에서 세지 않는다)
      body_problem · body_idea · body_effect   시민이 나눠 적은 «문제/제안/기대효과»
      search_text    검색용 통합 글(서버가 만든다)
   ══════════════════════════════════════════════════════════════════════ */
const P_COLS = "id,title,body,category,author_nick,region,status,admin_reply,like_count,is_hidden,created_at"
             + ",proposal_no,comment_count,body_problem,body_idea,body_effect,search_text";
const REPLY_REQUIRED = new Set(["반영", "불채택"]); // 전환 시 답변/사유 필수
let PALL = [], PCATS = [], P_SELCAT = new Set(), P_STATUS = "전체";
let pSort = "new", pPage = 0, P_LOADED = false;
let P_REPORTS = {}; // proposal_id -> 신고 건수
// 첫 화면(루트) 탭 = 신청 접수. index.html 의 .tab-btn.on / 보이는 섹션과 «반드시» 같아야
// 뒤로가기가 엉뚱한 탭으로 가지 않는다.
let pCurrentTab = "applications";

/* ══ 🔴 «아직 확인하지 않음» — 카드 「신규」 배지 + 탭 건수 배지 ════════════════
   (2026-08-26 양호창님 승인 · 🩵물결 설계 · 세 앱 공통 규약)

   ⭐ 무엇을 세는가 — «오늘 들어온 건수»가 아니라 «아직 아무도 열어 보지 않은 건수»다.
      예전 PC앱 배지는 「오늘 N건」이라 눌러도 줄지 않아, 다 처리한 뒤에도 빨간 숫자가 남았다.
      이제는 상세를 여는 «그 순간» 읽음이 되고 숫자가 1 줄어든다.

   ⭐ 저장은 «어댑터»(reads.js · window.SangjuReads) 한 곳에만 맡긴다.
      ⛔ 이 파일에서 localStorage 를 직접 만지지 마세요 — 나중에 «계정별 서버 저장»으로
         옮길 때 어댑터 안쪽만 바꾸면 화면이 안 바뀌게 하려는 것입니다.
      ⚠ 어댑터가 아직 없거나(배포 누락) 브라우저가 저장을 막았으면 아래 감싸개가 모두
        «조용히 0/false» 를 돌려준다 → 배지가 하나도 안 그려질 뿐, 앱은 멀쩡하다.

   ⭐ 세 앱이 «글자 단위로» 같아야 하는 것 —
        카드 배지 글자      : 「신규」
        카드 접근명 꼬리    : 「, 아직 확인하지 않음」 (aria-label 맨 뒤 · ⛔ 맨 앞 금지)
        탭 접근명           : 「신청사업 현황 — 확인하지 않은 접수 3건」
                              「정책제안 현황 — 확인하지 않은 제안 3건」
        0건                 : 배지를 아예 그리지 않는다
        표시 상한           : 「99+」
        한꺼번에 읽음 단추  : 「모두 읽음」

   ⭐ 배지 «차례» 규약 (세 앱 공통 · 2026-08-26 개정)
        (신규) → 상태 → (경과 — 신규가 붙었으면 생략) → 블라인드 → 신고 → 분야
      「신규」가 붙는 동안 「N일 경과」를 생략하는 까닭 — 정책제안은 P_OVERDUE_DAYS=1 이라
      «어제 들어온 제안»이 둘을 함께 달게 되는데, 둘 다 「어제 들어와 아직 손 안 댄 글」이라는
      «한 사실»이다. 생략하면 최악 5배지 조합이 57px 좁아진다.
   ══════════════════════════════════════════════════════════════════════ */
/* ⚠ 갈래 이름은 «단수»다 — reads.js 의 KINDS = ["application","proposal"] 와 «글자 그대로» 같아야
     한다. 다르면 normKind() 가 빈 값을 돌려 배지가 통째로 안 그려진다(오류는 안 난다 — 더 나쁘다). */
const RK_A = "application";
const RK_P = "proposal";
const NEW_TAG_HTML = `<span class="new-tag">신규</span>`;
const NEW_ALABEL   = "아직 확인하지 않음";   // ⚠ aLabel 배열 «맨 뒤»에 넣는다

/* 🔴 실시간으로 «방금 들어온» id 만 담아 두는 임시 주머니.
   ⛔ 배지 숫자를 rtAutoApply() 에 태우지 «않는다» — 그 함수는 rtBusy()(모달 열림)면 미룬다.
      처리 창을 5분 열어 두면 그동안 배지가 멈춘 채로 있게 된다.
   ⚠ 여기에 «id 만» 넣는다. 목록(AALL·PALL)은 건드리지 않으므로 「쓰는 중이면 미룬다」
     원칙은 그대로다 — 화면의 목록은 담당자가 띠를 누르거나 rtAutoApply 가 적용할 때 바뀐다.
   ⚠ loadApplications()/loadProposals() 가 목록을 «실제로» 받으면 그때 비운다(중복 계수 방지). */
let A_NEW = new Set(), P_NEW = new Set();

function READS() { return (typeof window !== "undefined" && window.SangjuReads) || null; }

/* 🧪 둘러보기(게스트) 판정은 «어댑터 안»에 있다 — 화면에서 다시 보지 않는다.
   게스트의 «신청»은 count 0 · badgeText "" · isNew false 를 돌려주고 저장 칸조차 만들지 않는다
   (게스트 목록이 demo_applications() 고정 예시라 「신규 3건」이 그럴듯한 거짓말이 되기 때문).
   «정책제안»은 게스트도 진짜 제안을 보므로 scope:"guest" 칸에 따로 기억해 정상 동작한다.
   ⛔ 여기에 IS_GUEST 검사를 다시 넣지 마세요 — 규칙이 두 곳으로 갈라져 언젠가 어긋납니다. */
function readsOn(kind) {
  const R = READS();
  if (!R) return false;                       // 어댑터가 아직 없으면 배지를 안 그릴 뿐, 앱은 멀쩡하다
  try { return !!R.badgeEnabled(kind); } catch (e) { return false; }
}
function readsIsNew(kind, id, createdAt) {
  if (!readsOn(kind)) return false;
  try { return !!READS().isNew(kind, id, createdAt); } catch (e) { return false; }
}
/* ⛔ 행에서 id·시각을 «직접 꺼내» 넘기지 마세요 — count/badgeText/prune 은 행 객체를 그대로
     받아 어댑터 안에서 꺼냅니다(세 앱의 칸 이름이 달라 그 자리를 한 곳에 모아 둔 것입니다). */
function readsCount(kind, rows) {
  if (!readsOn(kind)) return 0;
  try { return Number(READS().count(kind, rows || [])) || 0; } catch (e) { return 0; }
}
function readsMarkRead(kind, id) {
  if (!readsOn(kind)) return;
  try { READS().markRead(kind, id); } catch (e) { /* 저장 실패해도 화면은 계속 돈다 */ }
}
function readsMarkAllRead(kind, rows) {
  if (!readsOn(kind)) return Promise.resolve(false);
  // ⚠ rows 는 «화면 필터(상태·담당팀·검색)를 걷어낸» 전체 목록이어야 한다(AALL·PALL).
  try { return Promise.resolve(READS().markAllRead(kind, rows || [])); } catch (e) { return Promise.resolve(false); }
}
function readsPrune(kind, rows) {
  if (!readsOn(kind)) return Promise.resolve(false);
  try { return Promise.resolve(READS().prune(kind, rows || [])); } catch (e) { return Promise.resolve(false); }
}
function readsLoad(kind) {
  if (!readsOn(kind)) return Promise.resolve(null);
  try { return Promise.resolve(READS().load(kind)); } catch (e) { return Promise.resolve(null); }
}
/* 로그인·둘러보기 시작·로그아웃 «직후» 한 번. 사람이 바뀌면 어댑터가 시렁을 비운다
   (앞 사람의 읽음이 뒷사람에게 새지 않게). 안 불러도 어댑터가 #guestNotice 띠로 스스로 살핀다. */
function readsSetContext(user, guest) {
  const R = READS(); if (!R) return;
  try { R.setContext({ user: user || "", guest: !!guest }); } catch (e) {}
}

/* 지금 «확인하지 않은» 건수. 목록을 받았으면 목록 기준으로 세고,
   아직 목록에 «없는» 것(실시간으로 방금 들어온 것)만 따로 더한다.
   ⚠ 목록에 «이미 있는» id 는 더하지 않는다 — 목록을 받는 도중 그 행의 INSERT 가
     도착하면(경합) 같은 한 건을 두 번 세게 된다. */
function extraNewCount(set, rows) {
  if (!set.size) return 0;
  const have = new Set((rows || []).map((r) => String(r.id)));
  let n = 0;
  set.forEach((id) => { if (!have.has(id)) n += 1; });
  return n;
}
function aUnreadCount() {
  if (!readsOn(RK_A)) return 0;
  return (A_LOADED ? readsCount(RK_A, AALL) : 0) + extraNewCount(A_NEW, A_LOADED ? AALL : []);
}
function pUnreadCount() {
  if (!readsOn(RK_P)) return 0;
  return (P_LOADED ? readsCount(RK_P, PALL) : 0) + extraNewCount(P_NEW, P_LOADED ? PALL : []);
}

/* 탭 배지 하나를 그린다 / 지운다.
   ⚠ 탭 단추의 aria-label 을 «갈아 끼운다» — index.html 이 이미 갖고 있으므로 값만 바꾼다.
     (aria-label 이 있으면 보조기기는 안쪽 글자 대신 그것을 읽는다 — 탭바 3단 규약과 같은 원리)
   ⚠ .has-badge 토글이 style.css 의 «좁은 화면에서 아이콘 접기» 처방의 «전제»다. 지우지 말 것. */
function paintOneTabBadge(sel, kind, baseName, unit, n) {
  const t = $(sel); if (!t) return;
  /* 「99+」 상한은 어댑터(reads.js badgeText)가 한 곳에서 정한다 — 여기서 다시 계산하지 않는다.
     ⚠ 숫자를 넘기면 badgeText 가 그 숫자에 상한만 씌워 돌려준다(0 이면 빈 글자). */
  const R = READS();
  let txt = "";
  if (n > 0) { try { txt = R ? String(R.badgeText(kind, n) || "") : String(n); } catch (e) { txt = String(n); } }
  let b = t.querySelector(".tab-badge");
  if (!txt) {
    if (b) b.remove();
    t.classList.remove("has-badge");
    t.setAttribute("aria-label", baseName);
    return;
  }
  if (!b) {
    b = el("span", "tab-badge");
    b.setAttribute("aria-hidden", "true");   // 숫자는 아래 aria-label 이 문장으로 읽어 준다
    t.appendChild(b);
  }
  b.textContent = txt;
  t.classList.add("has-badge");
  // 접근명은 «상한 없는 진짜 건수»로 읽어 준다(99+ 는 눈으로 보는 표기일 뿐이다).
  t.setAttribute("aria-label", `${baseName} — ${unit} ${n}건`);
}

/* 탭 배지 두 개 + 「모두 읽음」 단추 두 개를 «한 번에» 맞춘다.
   ⚠ 부르는 자리 — 목록을 받았을 때 · 목록을 다시 그릴 때 · 상세를 열었을 때(읽음)
     · 실시간 INSERT 가 왔을 때 · 「모두 읽음」을 눌렀을 때. */
function paintTabBadges() {
  const a = aUnreadCount(), p = pUnreadCount();
  paintOneTabBadge("#tabApplications", RK_A, "신청사업 현황", "확인하지 않은 접수", a);
  paintOneTabBadge("#tabProposals", RK_P, "정책제안 현황", "확인하지 않은 제안", p);
  const ab = $("#aMarkAllRead");
  if (ab) {
    ab.hidden = !a;
    ab.setAttribute("aria-label", `확인하지 않은 접수 ${a}건을 모두 읽음으로 표시`);
  }
  const pb = $("#pMarkAllRead");
  if (pb) {
    pb.hidden = !p;
    pb.setAttribute("aria-label", `확인하지 않은 제안 ${p}건을 모두 읽음으로 표시`);
  }
}

/* 상세를 «연 순간» 읽음으로 바꾸고, 그 카드에서 「신규」 배지만 걷어낸다.
   ⚠ 목록을 통째로 다시 그리지 «않는다» — 다시 그리면 카드가 사라졌다 나타나며
     방금 누른 자리가 흔들리고(초점·스크롤) staggerCards 가 헛돈다.
   ⚠ 접근명 꼬리(「, 아직 확인하지 않음」)도 함께 뗀다 — 화면과 낭독이 갈라지면 안 된다. */
function markOpened(kind, r, listSel) {
  if (!r || r.id == null) return;
  if (!readsOn(kind)) return;
  const wasNew = readsIsNew(kind, r.id, r.created_at) || (kind === RK_A ? A_NEW : P_NEW).has(String(r.id));
  readsMarkRead(kind, r.id);
  (kind === RK_A ? A_NEW : P_NEW).delete(String(r.id));
  if (wasNew) {
    try {
      const list = $(listSel);
      const card = list && list.querySelector('.pcard[data-id="' + String(r.id).replace(/"/g, '\\"') + '"]');
      if (card) {
        const tag = card.querySelector(".new-tag");
        if (tag) tag.remove();
        const al = card.getAttribute("aria-label") || "";
        card.setAttribute("aria-label", al.replace(", " + NEW_ALABEL, ""));
      }
    } catch (e) { /* 배지 걷어내기는 «거들 뿐» — 실패해도 읽음 처리는 이미 끝났다 */ }
  }
  paintTabBadges();
}

function bindProposalsUI() {
  // 실시간 알림 띠의 «새로고침» — 목록 갱신은 오직 이 클릭으로만 일어난다
  const rtb = $("#rtBtn"); if (rtb) rtb.onclick = () => { RT_PENDING = 0; syncRtBanners(); loadBenefits(); };
  const prtb = $("#pRtBtn"); if (prtb) prtb.onclick = () => { PRT_PENDING = 0; syncRtBanners(); loadProposals(); };
  const artb = $("#aRtBtn"); if (artb) artb.onclick = () => { ART_PENDING = 0; syncRtBanners(); loadApplications(); };

  /* 🔴 「모두 읽음」 — 목록 위 도구줄 오른쪽(#aStatusChips·#pStatusChips 줄).
     ⚠ 「신규」는 걷히지만 «상태»는 하나도 안 바뀐다 — 되돌릴 수 없는 조작이 아니므로
       확인창을 두지 않는다(확인창을 남발하면 정작 필요한 확인창을 안 읽게 된다).
     ⚠ 여기서 다시 그리는 것은 «목록»이다 — 걸러 보는 중이어도 읽음은 «전체»에 적용한다
       (탭 배지가 전체 기준이라, 걸러진 것만 읽으면 숫자와 화면이 어긋난다).
     ⚠ announce() 로 낭독기에도 결과를 알린다 — 배지가 사라지는 것은 «눈»으로만 보인다. */
  const amr = $("#aMarkAllRead");
  if (amr) amr.onclick = async () => {
    const n = aUnreadCount();
    await readsMarkAllRead(RK_A, AALL);   // ⚠ AALL — «화면 필터를 걷어낸» 전체 목록
    A_NEW.clear();
    renderApplications();
    paintTabBadges();
    announce(`확인하지 않은 접수 ${n}건을 모두 읽음으로 표시했습니다.`);
  };
  const pmr = $("#pMarkAllRead");
  if (pmr) pmr.onclick = async () => {
    const n = pUnreadCount();
    await readsMarkAllRead(RK_P, PALL);   // ⚠ PALL — «화면 필터를 걷어낸» 전체 목록
    P_NEW.clear();
    renderProposals();
    paintTabBadges();
    announce(`확인하지 않은 제안 ${n}건을 모두 읽음으로 표시했습니다.`);
  };

  /* 🔁 다른 탭·다른 창에서 읽음이 바뀌면 이 화면의 배지도 따라 바뀐다(어댑터가 알려 준다).
     ⚠ 목록은 다시 그리지 않는다 — 담당자가 지금 보고 있는 자리(초점·스크롤)를 흔들지 않는다.
       다음에 목록을 다시 그릴 때 「신규」가 함께 걷힌다. */
  const R = READS();
  if (R && typeof R.subscribe === "function") {
    try { R.subscribe(() => paintTabBadges()); } catch (e) {}
  }

  /* 탭: 클릭 + 좌우/Home/End 화살표 이동(WAI-ARIA tablist 표준 조작).
     PC앱(webui)과 같은 규약 — 탭바는 Tab 키 «한 번»으로 진입하고(로빙 tabindex),
     그 안에서는 화살표로 이동한다. 마우스 없이도 탭을 모두 쓸 수 있게 하는 것이 목적.

     ★★ DOM 차례를 «읽는다» — 손으로 적지 않는다 (A-02 · 2026-08-24) ★★★★★★★★★★★★★★★★
     ⛔ 여기에 탭 배열을 다시 손으로 적지 마세요.
        예전에는 [tabApplications, tabBenefits, tabProposals] 라고 «적어» 두었습니다.
        A-02 로 index.html 의 탭 차례를 접수 → 제안 → 사업으로 바꿨는데, 이 배열은
        그대로라 화살표(→)를 누르면 «화면에 보이는 다음 탭»이 아니라 사업 탭으로 건너뛰었습니다.
        (보이는 차례와 키보드 차례가 어긋나면 KWCAG 2.4.3 «초점 이동 순서»에 어긋납니다)
        → 이제 DOM 에서 읽으므로, 마크업 차례만 바꾸면 키보드가 «저절로» 따라옵니다.
     ⚠ 어느 탭인지는 «id» 로 알아낸다 — 차례에 기대지 않는다.
        내부 키(applications·benefits·proposals)는 A-02 에서도 한 글자도 바뀌지 않았다. */
  const TAB_KEY = { tabApplications: "applications", tabBenefits: "benefits", tabProposals: "proposals" };
  const TABS = [...document.querySelectorAll(".tabbar .tab-btn")];
  const WHICH = TABS.map((t) => TAB_KEY[t.id]);
  TABS.forEach((t, i) => {
    t.onclick = () => switchTab(WHICH[i]);
    t.addEventListener("keydown", (e) => {
      let j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = TABS.length - 1;
      if (j < 0) return;
      e.preventDefault();
      TABS[j].focus();
      TABS[j].click();
    });
  });
  $("#pSearch").addEventListener("input", debounce(() => { pPage = 0; renderProposals(); }, 300));
  $("#pSortSel").addEventListener("change", () => { pSort = $("#pSortSel").value; renderProposals(); });
  $("#pmClose").onclick = () => requestCloseModal($("#pModal"));
  $("#pModal").addEventListener("click", (e) => { if (e.target.id === "pModal") requestCloseModal($("#pModal")); });
  // Esc는 공통 트랩(_trapKeydown)에서 처리 — 중복 등록 제거
}

// switchTab(which) — 호출 계약 유지(인자 하나로 부르던 기존 코드 그대로 동작).
//   opts.fromHistory=true 면 뒤로/앞으로가기로 «되돌아온» 경우라 히스토리를 새로 쌓지 않는다.
function switchTab(which, opts) {
  const fromHistory = !!(opts && opts.fromHistory);
  // 화면 전환 슬라이드 방향(규격서 §14). 사용자가 «새로» 옮기면 앞으로, 뒤로가기면 뒤로.
  const dir = (opts && opts.dir) || (fromHistory ? "back" : "fwd");
  // ✍ 모달이 열린 채로 탭을 옮기려 하면(키보드·프로그램 호출) 작성 중인 내용부터 확인한다.
  //   모달 닫기가 히스토리를 한 칸 되돌리므로(navBack), 그게 «끝난 뒤»에 탭을 옮긴다.
  //   ⚠ 확인이 «비동기»가 됐다(askConfirm). switchTab 자체를 async 로 바꾸면 부르는 곳이
  //     20곳 넘어 흐름이 흔들리므로, 여기서만 then 으로 이어 붙이고 즉시 되돌아간다
  //     (원래도 이 갈래는 곧바로 return 했으므로 호출부가 보는 동작은 그대로다).
  if (!fromHistory && _activeModal) {
    const m = _activeModal;
    confirmLeaveModal(m).then((ok) => {
      if (!ok) return;
      closeModal(m);
      setTimeout(() => switchTab(which), 0);
    });
    return;
  }
  // ⬅ 탭 전환을 히스토리 한 칸으로 — 뒤로가기를 누르면 «직전 탭»으로 돌아온다.
  //   같은 탭을 다시 누르면 쌓지 않는다(눌러도 아무 일 없는 «죽은 뒤로가기» 방지).
  if (!fromHistory && which !== pCurrentTab) navPush({ type: "tab", tab: which });
  pCurrentTab = which;
  // 탭 3종: 신청사업 현황 · 정책제안 현황 · 진행사업 현황. 선택된 하나만 보이고 나머지는 숨긴다.
  //   ⚠ 아래 MAP 의 «키»는 내부 이름이라 A-02·A-03 에서도 그대로다(보이는 글자만 바뀌었다).
  const MAP = {
    applications: { tab: "#tabApplications", sec: "#secApplications" },
    benefits:     { tab: "#tabBenefits",     sec: "#secBenefits" },
    proposals:    { tab: "#tabProposals",    sec: "#secProposals" },
  };
  Object.keys(MAP).forEach((k) => {
    const on = k === which;
    const t = $(MAP[k].tab), s = $(MAP[k].sec);
    if (t) {
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      // 로빙 tabindex: 선택된 탭만 Tab 키 순서에 남긴다(탭바 전체가 Tab 한 번으로 진입)
      t.tabIndex = on ? 0 : -1;
    }
    // class(스타일) + hidden 속성(보조기기·검사기) 둘 다 맞춰 준다.
    if (s) {
      s.classList.toggle("hidden", !on);
      s.hidden = !on;
      // 화면 전환 슬라이드 — 보이게 되는 패널에만, 방향에 맞는 클래스를 «다시» 건다.
      //   (같은 클래스를 그대로 두면 애니메이션이 재생되지 않으므로 한 번 지우고 붙인다)
      s.classList.remove("slide-fwd", "slide-back");
      if (on && !prefersReducedMotion()) {
        void s.offsetWidth;                       // 리플로우 강제 → 애니메이션 재시작
        s.classList.add(dir === "back" ? "slide-back" : "slide-fwd");
      }
    }
  });
  // 건너뛰기 링크는 유일한 <main id="main"> 으로 고정 — 탭이 바뀌어도 목적지가 항상 유효하다.
  if (which === "proposals" && !P_LOADED) loadProposals();
  if (which === "applications" && !A_LOADED) loadApplications();
}

async function loadProposals() {
  showSkeleton("#pList", 4);          // 첫 불러오기에만(이미 목록이 있으면 그대로 둔다)
  // 공무원은 숨김(is_hidden) 글도 모두 본다 → 필터 없이 전체 조회
  /* ⛔⛔ 여기에 .eq("is_hidden", false) 를 «절대» 붙이지 마세요 (2026-08-26 못 박음)
     예전에는 시민 본인 삭제가 «숨김»일 뿐이어서, 시민이 지운 글이 이 목록에
     「🚫 블라인드」로 남아 담당자를 헷갈리게 했다. 그래서 「필터를 넣자」는 생각이
     들 수 있다 — 하지만 그 원인은 2026-08-26 에 «DB 함수 delete_proposal 을 진짜
     삭제로 바꾸어» 뿌리째 없앴다. 지운 글은 이제 행 자체가 없다.
     그 뒤로 is_hidden 이 뜻하는 것은 «담당자가 감춘 글»과 «신고 5명 자동숨김» 둘뿐이고,
     그것은 담당자가 «반드시 봐야 하는» 글이다. 필터를 붙이면 담당자가 자기 손으로
     감춘 글을 다시 찾지 못해 되돌릴 수도 없게 된다 — 새 결함을 만드는 셈이다.
     ⚠ 시민앱(모바일웹/proposals.js)에는 반대로 is_hidden=false 필터가 «있어야» 한다.
        두 앱은 보는 범위가 다른 것이 정상이다 — 한쪽에 맞춘다고 옮겨 오지 마세요. */
  /* 조회할 «칸» 목록 — pin_hash 는 «절대» 넣지 않는다 (2026-08-19).
     본인확인용 PIN 해시가 필요 없는 화면에까지 딸려 나오지 않게 «쓰는 칸만» 적는다.
     시민앱(모바일웹/proposals.js)에서는 anon 에게 pin_hash 권한이 없어 select("*") 가
     통째로 401(42501) 이 됐다. 여기(로그인 사용자)는 아직 전체 권한이 남아 있지만,
     같은 사고를 반복하지 않도록 같은 방식으로 맞춘다. */
  const { data, error } = await sb.from("proposals").select(P_COLS).order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showLoadError("#pList", error, "pListRetry", loadProposals);
    return;
  }
  PALL = data || [];
  /* 📝 처리메모 칸이 있는지 한 번만 확인한다(A-08 ①).
     ⚠ 목록(P_COLS)에는 넣지 않는다 — 칸이 없으면 목록 전체가 실패하기 때문이다.
     ⚠ 처음 한 번만 물어본다. 화면을 새로 고칠 때마다 물으면 헛 왕복이 늘어난다.
        (칸이 새로 생기면 담당자가 화면을 다시 여는 그때 반영된다) */
  if (!P_LOADED) await detectProposalMemoColumn();
  /* 📝 처리메모 값은 목록에 없다 — 모달을 열 때 «그 한 건만» 따로 읽어야 한다.
     ⛔ 목록 조회에 admin_memo 를 끼워 넣지 말 것(위 P_COLS 머리말 참조). */
  PRT_PENDING = 0; syncRtBanners();    // 새로 불러왔으니 «밀린 알림»도 지운다
  PCATS = [...new Set(PALL.map((r) => r.category).filter(Boolean))].sort();
  P_LOADED = true;
  await loadReportCounts();
  /* 🔴 목록을 «실제로» 받았으므로 임시 주머니를 버리고 PALL 기준으로 다시 센다(신청과 같은 규약). */
  P_NEW.clear();
  await readsLoad(RK_P);              // ⚠ isNew() 는 load() 뒤라야 답한다 — 반드시 «먼저»
  await readsPrune(RK_P, PALL);       // ⚠ 행 객체를 «그대로» 넘긴다(어댑터가 id 를 꺼낸다)
  renderPSummary();
  renderPStatusChips();
  renderPCatChips();
  renderProposals();
  paintTabBadges();
}

// 신고 건수 집계(신고 확인 표시용). 권한 없으면 조용히 건너뜀.
async function loadReportCounts() {
  P_REPORTS = {};
  try {
    const { data, error } = await sb.from("proposal_reports").select("proposal_id");
    if (error) { return; }
    (data || []).forEach((r) => { P_REPORTS[r.proposal_id] = (P_REPORTS[r.proposal_id] || 0) + 1; });
  } catch (e) { /* 무시 */ }
}

/* ══════════════════════════════════════════════════════════════════════
   📝 정책제안 «처리메모» — A-08 ① (2026-08-24)
   ────────────────────────────────────────────────────────────────────
   ⚠⚠ 2026-08-24 현재 proposals 에는 admin_memo 칸이 «없습니다».
      (applications 에는 있습니다 — supabase/applications.sql 69행)
      그래서 이 칸은 «있으면 쓰고, 없으면 아예 그리지 않는» 방식으로 둡니다.
      🩷자물쇠가 `alter table proposals add column admin_memo text;` 와
      공무원 update 권한을 더하면, 앱은 «한 줄도 고치지 않고» 그날부터 이 칸을 보여 줍니다.
   ⛔ P_COLS 에 admin_memo 를 그냥 더하지 마세요 — 칸이 없으면 «목록 전체»가 실패합니다.
      그래서 목록과 따로, 아래처럼 «한 줄만» 물어 확인합니다(benefits 의 detectNoteColumn 과 같은 방식).
   ⚠ 처리메모는 «시민에게 보이지 않는» 내부 기록입니다. 공식 답변(admin_reply)과 절대 섞지 마세요.
   ══════════════════════════════════════════════════════════════════════ */
let P_MEMO_OK = false;
async function detectProposalMemoColumn() {
  try {
    const { error } = await sb.from("proposals").select("admin_memo").limit(1);
    P_MEMO_OK = !error;
  } catch (e) { P_MEMO_OK = false; }   // 못 물어보면 «없는 것으로» 둔다(닫는 쪽으로 실패)
}
/* 📝 처리메모 «한 건»만 읽어 온다 — 다 읽은 뒤에야 칸이 열린다(A-08 ①).
   ⚠ 실패하면 «잠긴 채» 둔다. 열어 두면 빈 칸이 저장돼 남의 메모를 지운다.
   ⚠ 그 사이 모달이 닫혔으면(isConnected) 아무것도 하지 않는다. */
async function loadProposalMemo(id) {
  const ta = $("#pmMemo"); if (!ta) return;
  let row = null, err = null;
  try {
    const res = await sb.from("proposals").select("admin_memo").eq("id", id).maybeSingle();
    row = res.data; err = res.error;
  } catch (e) { err = e; }
  if (!ta.isConnected) return;
  if (err) {
    ta.placeholder = "처리메모를 불러오지 못했습니다 — 창을 닫았다 다시 열어 주세요.";
    return;                                    // 잠긴 채로 둔다(저장에도 실리지 않는다)
  }
  ta.value = (row && row.admin_memo) || "";
  ta.placeholder = "검토 경과·내부 판단을 기록하세요.";
  ta.dataset.loaded = "1";
  ta.disabled = false;
  /* ✍ 이 칸은 «화면이 스스로» 채운 것이지 담당자가 친 것이 아니다 →
     이탈 보호의 기준선에 그대로 반영한다. 이 한 줄이 없으면 처리메모가 적힌 제안은
     «열었다 닫기만 해도» 매번 「작성 중인 내용이 있습니다」가 뜬다(2026-08-26 수정).
     ⛔ 지우지 마세요. ⛔ formSnapshot() 으로 통째로 다시 잡지도 마세요
        (rebaseModalField 머리말 참조 — 담당자가 이미 쓰던 답변까지 지워집니다). */
  rebaseModalField($("#pModal"), ta);
}

// 저장 payload 에서 admin_memo 를 빼야 하는 오류인지(칸 미생성·권한없음) 판정
function isMissingProposalMemo(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  return code === "PGRST204" || code === "42703" ||
         (msg.includes("admin_memo") && /column|schema cache|permission/.test(msg));
}

/* ══════════════════════════════════════════════════════════════════════
   💬 시민 댓글·답글 — ⭐ «읽기 + 관리» 전용 (A-07, 2026-08-24 · 2026-08-25 개정)
   ────────────────────────────────────────────────────────────────────
   ⛔⛔ 2026-08-25 양호창님 결정 — 「공무원앱과 PC앱에서 공무원이 댓글을 다는 기능은
      불필요할 것 같아. 그냥 심사 진행현황을 알려주니까 그것만 있으면 될 것 같아.
      굳이 공무원이 댓글을 다는 거는 부적절해 보여.」
      ⇒ 공무원이 «대화하듯» 글을 쓰는 장치를 «통째로» 걷어냈다.
         · 없앤 것 — 쓰기 상자(cmt-write)·부서명 칸·글자수 상한 검사·
                     add_official_comment / edit_official_comment RPC 호출·답글/수정 단추.
         · 시민에게 하는 답은 proposals.admin_reply(「담당부서 답변」) «한 통»뿐이다.
      ⛔ 되살리지 마세요. DB 의 proposal_comments 표와 두 RPC 는 «그대로 두었을 뿐»이고
         (양호창님: 「코드만 제거, DB 는 둘」), 앱에서 부르지 않는 것이 결정 사항이다.

   ✅ 남긴 것 — 시민들끼리 나눈 의견을 «읽는» 일과, 그 자리를 «관리»하는 일.
      · 시민 댓글 읽기 + 시민끼리 주고받은 «답글 1단 들여쓰기»(대화 흐름을 그대로 보여 준다)
      · 신고 수 표시 · «감추기 / 다시 보이기» · «삭제»
        (양호창님이 시민 댓글을 남기기로 하셨으니 욕설·광고를 치울 수단은 있어야 한다.
         이것은 «글을 쓰는 일»이 아니라 «관리»다.)
      · 옛 자료에 공무원 답글(is_official)이 남아 있으면 «읽기»로는 그대로 보인다 —
        렌더 코드를 지우면 지난 대화가 화면에서 사라지므로 두었다.

   ✅ proposal_comments 는 회수한 칸이 없어 select("*") 를 «써도 됩니다»(🩷자물쇠 확인).
      proposals·proposal_likes 와 규약이 다릅니다 — 헷갈리지 마세요.

   깊이는 «1단»입니다 — 댓글(parent_id 없음) 아래 답글만. 답글의 답글은 DB 트리거가 막습니다.
   ⚠ 지워진 댓글은 내용·닉네임이 «실제로 비어» 있습니다 → 「삭제된 댓글입니다」 자리표시.
      그 자리를 없애면 아래 매달린 답글이 «누구에게 한 말인지» 알 수 없게 됩니다.
   ⚠ 신고가 5명 쌓이면 서버가 «스스로» 감춥니다(제안댓글_260824.sql 584행 v_threshold).
      공무원 화면에서는 그 글도 보이되 「신고로 숨김」이라고 «글자»로 알립니다 —
      공무원이 감춘 것과 신고로 감춰진 것은 뜻이 달라, 되돌릴지 판단이 갈립니다.
   ══════════════════════════════════════════════════════════════════════ */
const CMT_HIDE_THRESHOLD = 5;   // ⚠ 서버(제안댓글_260824.sql v_threshold)와 «같은 값». 한쪽만 고치지 말 것.
let P_CMT_REPORTS = {};         // comment_id → 신고한 «사람» 수(서버와 같은 셈법: reporter_key 중복 제거)
let P_CMT_PID = null;           // 지금 열어 둔 제안 id — 감추기·삭제 뒤 다시 불러오는 데 쓴다
let P_CMT_ROWS = [];            // 마지막으로 받아 온 댓글 원본

async function loadProposalComments(id) {
  const box = $("#pmComments"); if (!box) return;
  P_CMT_PID = id;
  let rows = null, err = null;
  try {
    const res = await sb.from("proposal_comments").select("*")
      .eq("proposal_id", id).order("created_at");
    rows = res.data; err = res.error;
  } catch (e) { err = e; }
  if (!box.isConnected) return;                 // 그 사이 모달이 닫혔다
  if (err) {
    box.innerHTML = `<li class="forms-empty">댓글을 불러오지 못했습니다 — ${esc(writeErrMsg(err, "조회"))}</li>`;
    return;
  }
  P_CMT_ROWS = rows || [];
  await loadCommentReports(P_CMT_ROWS.map((c) => c.id));
  if (!box.isConnected) return;
  renderProposalComments(box, P_CMT_ROWS);
}

/* 🚩 댓글 신고 수 — 「신고로 숨김」인지 「공무원이 감춘 것」인지 가르는 데만 쓴다.
   ⚠ 서버와 «같은 셈법»이어야 한다 — 같은 사람이 여러 번 눌러도 1명이다(reporter_key 중복 제거).
   ⚠ 못 읽어도 조용히 넘어간다(권한·표 미설치). 그때는 「신고로 숨김」 대신 그냥 「가림」으로 뜬다 —
      틀린 말을 하지 않는 쪽으로 떨어진다. */
async function loadCommentReports(ids) {
  P_CMT_REPORTS = {};
  if (!ids || !ids.length) return;
  try {
    const { data, error } = await sb.from("proposal_comment_reports")
      .select("comment_id,reporter_key").in("comment_id", ids);
    if (error) return;
    const seen = {};
    (data || []).forEach((r) => {
      const k = r.comment_id;
      if (!seen[k]) seen[k] = new Set();
      seen[k].add(r.reporter_key || ("row:" + Math.random()));
    });
    Object.keys(seen).forEach((k) => { P_CMT_REPORTS[k] = seen[k].size; });
  } catch (e) { /* 무시 — 배지만 덜 정확해질 뿐 */ }
}

function renderProposalComments(box, rows) {
  box.innerHTML = "";
  // 「시민 댓글 N건」 머리글을 «실제로 받아 온 수»로 다시 적는다(글을 올린 뒤 저절로 맞는다)
  const cap = $("#pmCmtCap");
  if (cap) cap.textContent = rows.length ? `시민 댓글 ${rows.length}건` : "시민 댓글";
  if (!rows.length) {
    box.innerHTML = '<li class="forms-empty">아직 시민 댓글이 없습니다.</li>';
    return;
  }
  // 1단 묶기 — 부모(댓글) 차례대로, 그 아래 자기 답글을 시각순으로.
  const kids = new Map();
  rows.forEach((c) => {
    if (!c.parent_id) return;
    if (!kids.has(c.parent_id)) kids.set(c.parent_id, []);
    kids.get(c.parent_id).push(c);
  });
  const parents = rows.filter((c) => !c.parent_id);
  parents.forEach((c) => {
    box.appendChild(commentLi(c, false));
    (kids.get(c.id) || []).forEach((k) => box.appendChild(commentLi(k, true)));
  });
  /* 부모가 지워져 «고아»가 된 답글이 조용히 사라지지 않게 맨 뒤에 붙인다.
     (DB 는 부모를 지울 때 자식도 함께 지우지만, 옛 자료·중간 상태가 있을 수 있다) */
  const seen = new Set(parents.map((c) => c.id));
  rows.filter((c) => c.parent_id && !seen.has(c.parent_id))
      .forEach((c) => box.appendChild(commentLi(c, true)));
  /* 단추는 «맡김(delegation)»으로 받는다 — 목록을 다시 그려도 연결이 끊기지 않는다.
     ⚠ onclick 대입이라 여러 번 그려도 처리기가 쌓이지 않는다(addEventListener 와 다른 점). */
  box.onclick = onCommentAction;
}

function commentLi(c, isReply) {
  const li = el("li", "cmt" + (isReply ? " cmt-reply" : "") + (c.is_official ? " cmt-official" : ""));
  li.dataset.id = c.id;
  if (c.is_deleted) {
    /* 내용·닉네임이 실제로 비어 있는 «자리표시». 흐린 글씨로 두되 지우지 않는다.
       ⚠ 지워진 글에는 단추를 달지 않는다 — 고칠 것도 감출 것도 남아 있지 않다. */
    li.className += " cmt-gone";
    li.innerHTML = `<div class="cmt-body">삭제된 댓글입니다.</div>`;
    return li;
  }
  const who = c.is_official ? esc(c.official_dept || "담당 부서") : esc(c.author_nick || "익명");
  const reps = P_CMT_REPORTS[c.id] || 0;
  /* 「신고로 숨김」 ↔ 「가림」 — 뜻이 다르다.
       신고로 숨김 = 시민 5명이 신고해 서버가 스스로 감춘 것(되돌릴지 판단이 필요)
       가림        = 공무원이 직접 감춘 것
     ⚠ 신고 수를 못 읽은 경우에는 «신고로»라고 단정하지 않는다(틀린 말을 하지 않는 쪽). */
  const byReport = c.is_hidden && reps >= CMT_HIDE_THRESHOLD;
  /* 🔧 관리 단추 — 🧪 테스트 모드(게스트)에서는 아예 내보내지 않는다.
     이 저장소 원칙: 「눌러 봐야 실패할 조작을 남기지 않는다」(paintGuestLocks 머리말).
     ⛔ 2026-08-25 — 「답글」·「수정」 단추를 없앴다(공무원이 댓글을 다는 기능 폐지, 양호창님).
        남은 둘은 «글을 쓰는 일»이 아니라 욕설·광고를 치우는 «관리»다. */
  /* ⭐ 2026-08-25 — 둘러보기에게 «감추기»는 열고 «삭제»만 막는다.
     기준은 「되돌릴 수 있는가」다 — 감춘 글은 바로 옆 「다시 보이기」로 되돌아오지만,
     삭제는 답글까지 함께 영영 사라진다. */
  const cmtHide = guestSaveBlockedByServer() ? "" : `
        <button type="button" class="mini-btn" data-act="${c.is_hidden ? "show" : "hide"}" data-id="${esc(c.id)}"
            aria-label="${c.is_hidden ? "이 댓글 다시 보이기" : "이 댓글 감추기"}">${c.is_hidden ? "다시 보이기" : "감추기"}</button>`;
  const cmtDel = guestNoDelete() ? "" : `
        <button type="button" class="mini-btn danger" data-act="del" data-id="${esc(c.id)}"
            aria-label="이 댓글 삭제">삭제</button>`;
  const acts = (cmtHide || cmtDel) ? `
      <div class="cmt-acts">${cmtHide}${cmtDel}
      </div>` : "";
  /* 배지 — 색만으로 «공무원 답변»·«숨김»을 알리지 않는다. 글자가 함께 말한다(KWCAG 5.4.1).
     ⚠ 공무원 답글에는 «부서명»만 붙는다(사람 이름·이메일 금지 — DB 주석 규약). */
  li.innerHTML = `
    <div class="cmt-head">
      ${isReply ? `<span class="cmt-arrow" aria-hidden="true">↳</span><span class="sr-only">답글, </span>` : ""}
      ${c.is_official ? `<span class="cmt-badge">공무원 답변</span>` : ""}
      <span class="cmt-who">${who}</span>
      ${c.is_hidden ? `<span class="hide-tag"><span aria-hidden="true">🚫</span> ${byReport ? `신고로 숨김 (${reps}명)` : "가림"}</span>` : ""}
      ${(!c.is_hidden && reps) ? `<span class="report-tag"><span aria-hidden="true">🚩</span> 신고 ${reps}</span>` : ""}
      <span class="cmt-when">${esc(fmtDateTime(c.created_at))}</span>
    </div>
    <div class="cmt-body">${esc(c.body || "")}</div>${acts}`;
  return li;
}

/* 🔧 댓글 관리 단추 한 곳 — 목록에 맡겨 둔 처리기가 어떤 단추가 눌렸는지 가려낸다.
   ⛔ 2026-08-25 — "reply"·"edit" 갈래를 없앴다(공무원 댓글 쓰기 폐지, 양호창님).
      남은 것은 «감추기 / 다시 보이기»와 «삭제» 뿐이다. */
async function onCommentAction(ev) {
  const b = ev.target.closest ? ev.target.closest("button[data-act]") : null;
  if (!b) return;
  ev.preventDefault();
  const id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
  if (act === "hide" || act === "show") {
    const hide = act === "hide";
    /* ⚠ «감추기»는 되돌릴 수 있어 확인창을 두지 않는다(다시 보이기 단추가 바로 옆에 있다).
       되돌릴 수 없는 «삭제»만 묻는다 — 확인 강도를 위험에 맞춘다. */
    /* ⌨ 네번째 인자 = 다시 그린 뒤 초점을 되돌릴 댓글 — 감추기·다시 보이기는
       그 댓글이 그대로 있으므로 «같은 댓글»의 단추로 돌아간다(pCmtRefocus 머리말). */
    await callCommentRpc("set_comment_hidden", { p_id: id, p_hidden: hide },
      hide ? "이 댓글을 감췄습니다. 시민 화면에서 보이지 않습니다."
           : "이 댓글을 다시 보이게 했습니다.", id);
    return;
  }
  if (act === "del") {
    const ok = await askConfirm({
      title: "이 댓글을 삭제할까요?",
      body: "시민이 쓴 글을 «영영» 지웁니다. 되돌릴 수 없습니다.\n"
          + "부적절한 표현이 문제라면 «감추기»를 먼저 생각해 주세요 — 감춘 글은 언제든 되돌릴 수 있습니다.\n"
          + "이 댓글에 달린 답글도 함께 지워집니다.",
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    // ⌨ 삭제는 돌아갈 단추가 «없다» — 댓글 id 를 넘기지 않아 목록 상자로 돌려보낸다.
    await callCommentRpc("delete_comment_admin", { p_id: id }, "댓글을 삭제했습니다.");
  }
}

/* RPC 를 부르고, 끝나면 목록을 다시 그린다. 실패는 «우리 말»로 알린다.
   ⚠ 성공/실패 어느 쪽이든 화면 안내(announce) 가 함께 간다 — 색·움직임만으로 알리지 않는다. */
async function callCommentRpc(fn, args, doneMsg, focusId) {
  markSelfWrite();                    // 🤫 내 글이 되돌아와 «새 제안» 소리를 내지 않게
  try {
    const { error } = await sb.rpc(fn, args);
    if (error) throw error;
  } catch (e) {
    /* ⚠ 실패하면 목록을 다시 그리지 «않는다» = 방금 누른 단추가 그대로 있다.
       초점은 askAlert 이 닫힐 때 그 단추로 스스로 되돌아간다(askDone 의 ASK_LASTFOCUS).
       → 여기서 따로 손대지 않는다. 두 번 옮기면 오히려 자리를 흔든다. */
    const m = writeErrMsg(e, "처리");
    announce(m); askAlert(m); return false;
  }
  announce(doneMsg);
  if (P_CMT_PID) await loadProposalComments(P_CMT_PID);
  pCmtRefocus(focusId);
  return true;
}

/* ⌨ 목록을 다시 그리면 방금 누른 단추가 «사라진다» — 초점이 <body> 로 떨어져
   키보드만 쓰는 이용자가 있던 자리를 잃는다(KWCAG 2.2 «초점 이동»).
     · 감추기·다시 보이기 → 그 댓글은 그대로 있다. 같은 댓글의 단추로 초점을 되돌린다
       (「감추기」가 「다시 보이기」로 바뀌어 있으므로 무엇이 됐는지 손끝으로도 안다).
     · 삭제              → 돌아갈 단추가 없다. 목록 상자(#pmComments · tabindex="0")로 옮긴다.
   ★ PC앱 webui/proposals.js 의 «같은 이름» 함수를 그대로 본뜬 것이다(2026-08-25 · 세 앱 패리티).
     ⛔ 한쪽만 고치지 말 것 — 둘이 같은 결이어야 한다.
   ★ 핵심 — 초점이 «댓글 목록 안»이거나 «이미 잃어버린(body)» 때만 개입한다.
     담당자가 그 사이 다른 칸(처리메모·담당부서 답변)을 만지고 있으면 빼앗지 않는다.
     초점을 함부로 옮기는 것이 안 옮기는 것보다 나쁠 때가 많다.
   ⚠ 통지(announce)와는 별개의 일이다 — 「무슨 일이 있었나」는 #liveStatus 가,
     「초점이 어디로 가나」는 이 함수가 맡는다. 부르는 차례가 announce → 다시 그리기 →
     초점이라 낭독이 겹치지 않는다(같은 말을 두 번 하지 않는다). */
function pCmtRefocus(commentId) {
  try {
    const box = $("#pmComments");
    if (!box || !box.isConnected) return;
    const cur = document.activeElement;
    if (cur && cur !== document.body && box !== cur && !box.contains(cur)) return;
    const back = commentId
      ? box.querySelector('button[data-id="' + String(commentId).replace(/"/g, '\\"') + '"]')
      : null;
    (back || box).focus();
  } catch (e) { /* 초점 되돌리기는 «거들 뿐» — 실패해도 처리 결과에 영향이 없다 */ }
}

/* ⛔⛔ 2026-08-25 — 여기 있던 공무원 «쓰기» 코드 두 덩이를 없앴습니다(양호창님 결정).
     ① setCommentMode()      — 새 댓글 / 답글 / 내 답글 고치기 «모드» 전환
     ② submitOfficialComment() — add_official_comment · edit_official_comment RPC 로 올리기
        (부서명 저장 · 500자 세기 · 「시민에게 공개할까요?」 확인창이 여기 딸려 있었습니다)
   되살리지 마세요 — 「공무원이 댓글을 다는 거는 부적절해 보여」(양호창님).
   시민에게 하는 답은 아래 «담당부서 답변»(proposals.admin_reply) 한 통뿐입니다.
   ⚠ callCommentRpc() 는 «지우지 않았습니다» — 감추기(set_comment_hidden)·
     삭제(delete_comment_admin)가 그 함수를 그대로 씁니다. */

function subscribeProposalsRealtime() {
  sb.channel("proposals-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "proposals" },
        (p) => {
          if (!P_LOADED) return;
          /* 🔴 탭 배지 숫자는 «즉시» 올린다 (2026-08-26)
             ⛔ 이 두 줄을 rtAutoApply() 안으로 옮기지 마세요 — 그 함수는 rtBusy()(모달 열림)면
                적용을 미룹니다. 검토 창을 5분 열어 두면 그동안 배지가 멈춰 버립니다.
             ⚠ 여기서는 «id 만» 담는다. 목록(PALL)은 건드리지 않으므로
               「쓰는 중이면 미룬다」 원칙은 그대로다.
             ⚠ INSERT 만 센다 — 상태 변경(UPDATE)은 «새로 들어온 것»이 아니다.
               (apply_client.js 와 달리 여기는 supabase-js 가 payload 를 원래부터 넘겨 준다) */
          if (p && p.eventType === "INSERT" && p.new && p.new.id != null) {
            P_NEW.add(String(p.new.id)); paintTabBadges();
          }
          PRT_PENDING += 1; syncRtBanners(); rtAutoApply("proposals", loadProposals);
          /* 🔔 소리 — 사업신청과 «같은 규약»(A-12 · 2026-08-24).
             ⚠ 예전에는 이 한 줄이 없어서 정책제안만 소리 없이 들어왔다. 지우지 말 것.
             화면 띠(«새 제안·변경 N건», #pRtText)가 언제나 함께 뜨므로 소리만으로
             정보를 전하지 않는다(KWCAG 5.4.1). P_LOADED 안이라 첫 화면에서는 울리지 않는다.
             ⚠ isSelfEcho() — 내가 방금 저장·답글한 것이 되돌아온 것이면 울리지 않는다. */
          if (!isSelfEcho()) playNewBeep();
        })
    .subscribe((status) => rtChannelStatus("proposals", status));
}

/* ══ 💬 댓글 실시간 — 「제안 검토」 모달을 열어 둔 동안에만 ═══════════════════
   ★ 2026-08-24 (🩷자물쇠 결정 · 🩵물결 검수 · 시민앱 proposals.js 와 «같은 판단»)
   왜 proposals-rt 만으로는 모자라나 —
     제안댓글_260824.sql 의 트리거는 «update of is_hidden, is_deleted» 로 한정돼 있다.
     그래서 댓글 «본문만» 고치면(edit_comment) comment_count 가 그대로라 proposals 에는
     아무 이벤트도 나지 않는다. 시민이 자기 의견을 고쳐도 이 화면은 영영 옛 글자였다.
   ⛔ 고치려고 트리거의 한정을 넓히지 말 것 — 댓글 오타 하나에 proposals 가 통째로
      방송되고, 이 앱의 «최근 변경» 표시가 흔들린다. 고칠 곳은 표가 아니라 화면이다.

   ⚠ 채널을 «상시»로 두지 않는다. 댓글 본문은 모달 안에서만 보이므로, 늘 열어 두면
     시 전체의 모든 댓글이 모든 공무원에게 방송되는 셈이다.
   ⚠ 여닫는 자리는 openModal()·closeModal() 딱 «둘»뿐이다 — 이 앱에서 #pModal 의
     열림 상태를 바꾸는 함수는 그 둘 말고 없다(✕·바깥클릭·Esc·뒤로가기·저장완료가
     모두 그리로 모인다). 나가는 길마다 따로 적으면 언젠가 한 길을 빠뜨린다.
   ⚠ rtChannelStatus() 에 물리지 «않는다» — _rtChanOk 는 상시 채널 3개로 「연결 끊김」
     불빛과 폴백 조회를 판정한다. 모달을 닫을 때마다 사라지는 채널을 거기 끼우면
     불빛이 깜빡이고 20초 폴백이 헛돈다.
   ══════════════════════════════════════════════════════════════════════════ */
let PCMT_SUB = null;
let PCMT_SUB_PID = "";
let PCMT_PENDING = false;       // 「바빠서 미뤄 둔 갱신이 있다」

/* 지금 갈아엎으면 «무엇을 잃는가» — 시민앱 cmtTyping() 과 같은 자리의 판정.
   ① 초점이 댓글 목록 «안»에 있다 — innerHTML 을 갈면 초점이 body 로 튄다.
      낭독기 사용자는 읽던 자리를 통째로 잃는다(KWCAG 6.4.1 «초점 이동»).
   ⛔ 2026-08-25 — 예전에는 ②「공무원이 답글을 쓰는 중」도 함께 봤다. 쓰기 기능을 없애면서
      그 갈래도 사라졌다(PC_MODE·#pmCmtBody). 남은 판정은 ① 하나뿐이다.
   ⚠ 미룬 갱신은 «버리지 않는다» — PCMT_PENDING 에 남겨 두었다가, 초점이 목록을 떠날 때
     openProposal() 이 걸어 둔 focusout 처리기가 흘려보낸다.
     안 그러면 읽는 동안 도착한 댓글이 영영 안 보인다. */
function pcmtBusy() {
  const box = $("#pmComments");
  const a = document.activeElement;
  if (box && a && box.contains(a)) return true;                       // ①
  return false;
}

function applyPCommentRefresh() {
  if (!P_CMT_PID) return;
  if ($("#pModal").classList.contains("hidden")) return;   // 그 사이 모달이 닫혔다
  if (pcmtBusy()) { PCMT_PENDING = true; return; }         // 미뤄 두고 «잊지 않는다»
  PCMT_PENDING = false;
  loadProposalComments(P_CMT_PID).catch(() => {});
}

/* 미뤄 둔 갱신 흘려보내기 — 초점이 댓글 목록을 «떠날» 때 부른다
   (openProposal() 이 #pmComments 에 걸어 둔 focusout 처리기).
   이제 갈아엎어도 잃을 것이 없다 = 읽던 자리를 지킬 필요가 사라졌다. */
function flushPCommentRefresh() {
  if (!PCMT_PENDING) return;
  applyPCommentRefresh();
}

/* ⛔ PRT_PENDING 을 올리지 «않고», playNewBeep() 도 부르지 «않는다».
     새 댓글은 comment_count 를 바꿔 proposals-rt 가 «이미» 세고 «이미» 울린다.
     여기서 또 하면 띠가 「2건」이 되고 소리가 두 번 난다.
     ⚠ 그래서 소리의 자기-에코 방지(isSelfEcho)는 지금처럼 proposals-rt 한 곳에만 둔다.
        공무원이 답글을 쓰면 callCommentRpc() 가 markSelfWrite() 를 먼저 부르므로,
        그 글이 이 채널로 되돌아와도 소리로 이어지지 않는다.
     ⚠ 본문 «수정»은 새로 온 것이 아니므로 소리가 나지 않는 것이 옳다. */
function onPCommentsChanged() {
  rtAutoApply("pcomments", applyPCommentRefresh, { evenWhenBusy: true });
}

/* 화면에 맞춰 구독을 여닫는다 — 멱등이라 몇 번을 불러도 안전하다. */
function syncPCommentSub() {
  const modal = $("#pModal");
  const open = modal && !modal.classList.contains("hidden");
  const wantPid = (open && P_CMT_PID) ? String(P_CMT_PID) : "";
  if (wantPid === PCMT_SUB_PID) return;
  if (PCMT_SUB) {
    try { sb.removeChannel(PCMT_SUB); } catch (e) { /* 무시 */ }
    PCMT_SUB = null;
    PCMT_SUB_PID = "";
    PCMT_PENDING = false;
    clearTimeout(_rtJobs["pcomments"]);        // 닫은 뒤에 예약이 터지지 않게
  }
  if (!wantPid) return;
  try {
    PCMT_SUB = sb
      .channel("pcomments-rt-" + wantPid)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "proposal_comments", filter: "proposal_id=eq." + wantPid },
          onPCommentsChanged)
      .subscribe();
    PCMT_SUB_PID = wantPid;
  } catch (e) {
    PCMT_SUB = null; PCMT_SUB_PID = "";
    console.warn("[정책제안] 댓글 실시간 구독 실패(무시):", e);
  }
}

function renderPStatusChips() {
  const box = $("#pStatusChips"); box.innerHTML = "";
  ["전체", ...P_STATUSES].forEach((st) => {
    const c = el("button", "chip" + (P_STATUS === st ? " on" : ""));
    c.type = "button";
    c.textContent = st;
    c.setAttribute("aria-pressed", P_STATUS === st ? "true" : "false");   // 색만으로 알리지 않음
    c.onclick = () => { P_STATUS = st; pPage = 0; renderPStatusChips(); renderProposals(); };
    box.appendChild(c);
  });
}

function renderPCatChips() {
  const box = $("#pCatChips"); box.innerHTML = "";
  // 분야가 하나도 없으면 이름표만 남으므로 함께 감춘다(사업 탭 renderCats 와 같은 규약)
  const cap = $("#pCatCap"); if (cap) cap.hidden = !PCATS.length;
  PCATS.forEach((cat) => {
    const c = el("button", "chip" + (P_SELCAT.has(cat) ? " on" : ""));
    c.type = "button";
    c.textContent = cat;
    c.setAttribute("aria-pressed", P_SELCAT.has(cat) ? "true" : "false"); // 색만으로 알리지 않음
    c.onclick = () => { P_SELCAT.has(cat) ? P_SELCAT.delete(cat) : P_SELCAT.add(cat); pPage = 0; renderPCatChips(); renderProposals(); };
    box.appendChild(c);
  });
  paintCatFoldSum("pCatFoldSum", P_SELCAT);   // 접힌 줄의 요약을 늘 최신으로
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s); if (isNaN(d)) return String(s).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderProposals() {
  const q = $("#pSearch").value.trim().toLowerCase();
  let rows = PALL.filter((r) => {
    if (P_STATUS !== "전체" && (r.status || "접수") !== P_STATUS) return false;
    if (P_SELCAT.size && !P_SELCAT.has(r.category)) return false;
    if (q) {
      /* ⭐ 2026-08-25 — 검색 대상에 «접수번호(proposal_no)» 를 더했다.
         목록 카드에서 접수번호 배지를 뺐기 때문이다(양호창님 「자리를 과도하게 차지한다」).
         눈으로 훑어 찾던 길을 없앴으면 «찾는 길»은 반드시 남겨 두어야 한다 —
         시민이 전화로 「20260820-101500-01」 을 불러 줄 때 이 칸에 그대로 넣어 찾는다.
         ⛔ 이 한 칸을 지우지 마세요(신청 접수 탭의 receipt_no 검색과 «짝»입니다). */
      const blob = `${r.title || ""} ${r.body || ""} ${r.author_nick || ""} ${r.region || ""} ${r.proposal_no || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  if (pSort === "like") rows.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  else rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#pCount").textContent = `총 ${rows.length}건`;
  const list = $("#pList");
  /* 🈳 빈 화면 — «걸러서 0건»과 «원래 0건»을 가른다 (B-5 · 2026-08-25).
     신청 접수 탭(renderApplications)과 «같은 결»이다. 아무 필터도 안 건 담당자에게
     「조건에 맞는…」 이라고 말하면, 걸지도 않은 조건을 찾아 헤매게 된다. */
  if (!rows.length) {
    const narrowed = (P_STATUS !== "전체") || P_SELCAT.size > 0 || !!q;
    list.innerHTML = narrowed
      ? '<div class="empty">조건에 맞는 제안이 없습니다. 위 «전체»를 누르거나 검색어를 지우면 모든 제안을 볼 수 있습니다.</div>'
      : '<div class="empty">아직 등록된 제안이 없습니다. 시민이 제안하면 이 자리에 바로 나타납니다.</div>';
    $("#pPager").innerHTML = "";
    return;
  }

  const pages = Math.ceil(rows.length / PAGE);
  if (pPage >= pages) pPage = pages - 1; if (pPage < 0) pPage = 0;
  const slice = rows.slice(pPage * PAGE, pPage * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const st = r.status || "접수";
    const reps = P_REPORTS[r.id] || 0;
    const card = el("div", "pcard" + (r.is_hidden ? " hidden-row" : ""));
    // C1: 키보드 접근 — 버튼 의미 + Enter/Space + 상태 포함 접근명
    // C9: 이모지 단독 의미(🚩신고/🚫블라인드 등)를 접근명 텍스트로 보강
    const days = proposalDays(r);            // ⏳ A-09 — 볼 때마다 그 자리에서 센다(저장하지 않는다)
    const cmts = Number(r.comment_count || 0); // 💬 A-07 — 트리거가 맞춰 준 수(화면에서 세지 않는다)
    /* ⚠ 접근명에도 배지와 «같은 정보»를 글자로 넣는다 — 배지는 이모지가 섞여 있어
       낭독기가 「모래시계 3일 경과」처럼 읽으면 뜻이 흐려진다(이모지는 aria-hidden). */
    /* 🔴 «아직 확인하지 않음» — 아무도 이 제안을 열어 본 적이 없으면 「신규」 배지가 붙는다.
       ⚠ 「신규」가 붙는 동안 「N일 경과」는 «화면에서도 접근명에서도» 생략한다
         (P_OVERDUE_DAYS=1 이라 어제 들어온 제안은 둘이 겹치는데, 둘 다 「어제 들어와
          아직 손 안 댄 글」이라는 한 사실이다 — 위 «배지 차례 규약» 참조). */
    const isNew = readsIsNew(RK_P, r.id, r.created_at);
    /* ⛔ 여기에 「신규」를 «맨 앞»으로 한 번 더 넣지 마세요 — 배지의 접근명은 아래 «맨 뒤» 꼬리
         (「, 아직 확인하지 않음」) 하나뿐입니다(세 앱 공통 규약). 앞뒤로 두 번 넣으면 낭독기가
         한 사실을 두 번 읽고, 읽음 처리 때 걷어낼 곳도 두 곳이 되어 한쪽이 남습니다(실측 확인). */
    const aLabel = [
      `상태 ${st}`,
      r.proposal_no ? `접수번호 ${r.proposal_no}` : "",
      (days && !isNew) ? `${days}일 경과` : "",
      r.category ? `분야 ${r.category}` : "",
      r.is_hidden ? "블라인드 처리됨" : "",
      reps ? `신고 ${reps}건` : "",
      cmts ? `댓글 ${cmts}건` : "",
      `제목 ${r.title || ""}`,
      // ⛔ 이 꼬리는 «맨 뒤»여야 한다 — 맨 앞으로 옮기면 음성명령 매칭이 어긋난다(세 앱 공통).
      isNew ? NEW_ALABEL : "",
    ].filter(Boolean).join(", ") + " — 검토 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    // 🔴 상세를 연 뒤 «그 카드만» 찾아 「신규」를 걷어내기 위한 표식(markOpened)
    card.dataset.id = String(r.id);
    /* ⭐⭐ 배지 «차례» 규약 (2026-08-26 개정 · 세 앱 공통)
          (신규) → 상태 → (경과 — 신규가 붙었으면 생략) → 블라인드 → 신고 → 분야
       ⭐ 2026-08-25 양호창님 — 「접수번호 배지가 과도하게 자리를 많이 차지한다. 제거해 줘」
          목록 카드에서 접수번호 배지(.rc-tag)를 뺐다 — 신청 접수 목록과 «같이» 뺀다.
          ⛔ 되살리지 마세요. 접수번호는 검토 창(openProposal) 맨 위와 카드 aria-label 에 그대로 있습니다.
       ⚠ 배지 줄은 «한 줄»이라 넘치면 «맨 뒤»가 …로 줄어든다.
          잘리는 것이 «분야»가 되도록 분야를 맨 뒤에 둔다 —
          분야는 title 속성과 검토 창에서 확인할 수 있지만,
          「🚩 신고 N」이 잘리면 «지금 손봐야 할 글»을 목록에서 놓친다.
       ⛔ 분야를 앞으로 옮기지 마세요(그러면 신고가 대신 잘립니다). */
    card.innerHTML = `<div class="pcard-main">
        <div class="pcard-top">
          ${isNew ? NEW_TAG_HTML : ""}
          <span class="st-badge st-${esc(st)}">${esc(st)}</span>
          ${(days && !isNew) ? `<span class="od-tag"><span aria-hidden="true">⏳</span> ${days}일 경과</span>` : ""}
          ${r.is_hidden ? `<span class="hide-tag" title="담당자가 감춘 글 — 시민에게 보이지 않습니다"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
          ${reps ? `<span class="report-tag"><span aria-hidden="true">🚩</span> 신고 ${reps}</span>` : ""}
          ${r.category ? `<span class="cat-tag" title="${esc(r.category)}"><span>${esc(r.category)}</span></span>` : ""}
        </div>
        <div class="pcard-title" title="${esc(r.title || "")}">${esc(r.title)}</div>
        <div class="pcard-meta">
          <span class="like-tag"><span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}</span>
          ${cmts ? `<span class="cmt-tag"><span aria-hidden="true">💬</span> 댓글 ${cmts}</span>` : ""}
          <span><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(regionLabel(r.region)) : ""}</span>
          <span><span aria-hidden="true">🗓</span> ${esc(fmtDate(r.created_at))}</span>
        </div>
      </div>`;
    const openIt = () => openProposal(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    applyJustChanged(card, r.id);      // 방금 답변·상태를 바꾼 줄 강조(+ «방금 변경» 글자 배지)
    list.appendChild(card);
  });
  staggerCards(list);
  renderPPager(rows.length, pages);
}

// 정책제안 목록 페이지 이동 — 위 renderPager 와 동일한 접근성 규약(nav·aria-label·aria-current)
function renderPPager(total, pages) {
  const wrap = $("#pPager"); wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    if (dis) b.disabled = true; else b.onclick = () => { pPage = p; renderProposals(); };
    bar.appendChild(b);
  };
  mk("‹", pPage - 1, pPage <= 0, false, "이전 페이지");
  let s = Math.max(0, pPage - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === pPage, `${p + 1} 페이지`);
  mk("›", pPage + 1, pPage >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

/* ══════════════════════════════════════════════════════════════════════
   🗑 정책제안 «지우기» — 실행부는 이 함수 «하나»뿐이다 (★ 2026-08-24)
   ────────────────────────────────────────────────────────────────────
   ★★ 2026-08-26 양호창님 결정 — «완전 삭제»로 확정했다. (이전에는 결정 대기 중이었다)
     왜 이렇게 정했나 — 개인정보처리방침 4절이 시민에게 「복구할 수 없도록 파기한다」고
     약속하고 있다. 그런데 시민 본인 삭제(DB 함수 delete_proposal)는 실제로는
     is_hidden=true 만 켜는 «숨김»이어서, 시민 화면에서만 사라지고 자료는 그대로 남아
     방침과 어긋났다(게다가 공무원앱에는 「🚫 블라인드」로 계속 보였다).
     → 같은 날 delete_proposal 을 진짜 delete 로 바꿨고, 이 함수와 «같은 뜻»이 되었다.
       세 앱 어디서 지우든 결과가 하나다 — 시민이 이해하는 「지웠다」와도 맞다.
   ⛔ 「숨김 뒤 N일 보관」으로 되돌리지 말 것 — 방침 문구를 함께 고치지 않으면
      약속 위반이 된다. 되살릴 일이 생기면 방침 4절부터 손대고 오시라.
   ⚠ 다만 이 함수는 «지우는 곳 한 줄»로 계속 남겨 둔다 — 규칙이 또 바뀌더라도
      단추·확인창·목록 갱신 코드는 그대로 쓸 수 있게.

   ★ «성공 판정»은 error 가 아니라 «지워진 행 수»로 한다 (🩷자물쇠 확인 사항)
     RLS 를 세워도, 권한 없는 접속(테스트 모드 anon·세션 만료)의 delete 는
     «0행을 지우고 정상 종료»한다. supabase-js 는 이때 error 를 주지 «않는다».
     res.error 만 보고 넘기면 앱이 「삭제했습니다」라고 «거짓»을 말한다.
   ⚠ .select("id") 를 빼지 말 것 — 빼면 res.data 가 null 이라 판정 자체가 불가능해진다.
   ⚠ 자식 자료(proposal_likes·proposal_reports·proposal_comments)는 DB 가 on delete cascade 로
     함께 지운다 — 담당 부서가 단 «답변»도 의견(proposal_comments)의 하나라 같이 사라진다.
     ⛔ 화면에서 따로 지우려 하지 말 것 — 순서를 잘못 밟으면 «공감만 지워지고 제안은 남는»
        반쪽 상태가 만들어진다. 지우는 곳은 한 줄, 나머지는 DB 가 맡는다.
   반환 — { ok:true } 또는 { ok:false, msg:"사람이 읽을 안내문" }
   ══════════════════════════════════════════════════════════════════════ */
async function deleteProposal(id) {
  const res = await sb.from("proposals").delete().eq("id", id).select("id");
  // 권한(RLS) 거부·연결 끊김·테이블 미설정을 우리 말로 갈라 알리는 기존 함수를 그대로 쓴다
  if (res.error) return { ok: false, msg: writeErrMsg(res.error, "삭제") };
  if (!res.data || res.data.length === 0) {
    // 0행 = 지울 권한이 없었다는 뜻(또는 이미 누가 지웠다). «성공»으로 표시하면 안 된다.
    return { ok: false, msg: "삭제 권한이 없습니다. 로그인 상태를 확인해 주세요. "
                          + "(이미 다른 담당자가 지웠을 수도 있습니다 — 목록을 새로고침해 보세요)" };
  }
  return { ok: true };
}

async function openProposal(r) {
  /* 🔴 읽음 판정 «시점» — 상세를 연 «그 순간»이다(2026-08-26 · 세 앱 공통).
     ⛔ 저장 버튼이나 모달 닫기로 옮기지 마세요 — 「열어 보기만 하고 나중에 처리」가
        가장 흔한 흐름인데, 그때 배지가 안 줄면 「눌러도 안 줄어드는 배지」로 되돌아갑니다.
     ⚠ 첫 줄이어야 한다 — 아래에서 await 로 잠시 멈추므로 뒤에 두면 숫자가 늦게 준다. */
  markOpened(RK_P, r, "#pList");
  $("#pmTitle").textContent = "🗳 정책제안 검토";
  const st = r.status || "접수";
  const reps = P_REPORTS[r.id] || 0;
  const optHtml = P_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  const days = proposalDays(r);                 // ⏳ A-09 — 그 자리에서 센다(저장하지 않는다)
  const cmts = Number(r.comment_count || 0);    // 💬 A-07
  /* 📝 시민이 «나눠 적은» 세 칸 (제안템플릿_260824.sql).
     셋 다 비어 있는 «옛 제안»은 예전처럼 body 한 덩어리로 보여 준다 —
     새 서식이 생겼다고 옛 제안의 내용이 사라지면 안 된다. */
  const tpl = [["무엇이 문제인가요", r.body_problem], ["어떻게 하면 좋을까요", r.body_idea],
               ["무엇이 나아질까요", r.body_effect]].filter((x) => String(x[1] || "").trim());

  $("#pmBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge st-${esc(st)}">${esc(st)}</span>
      ${days ? `<span class="od-tag"><span aria-hidden="true">⏳</span> ${days}일 경과</span>` : ""}
      <!-- 🧾 접수번호 «글자»는 그대로 둔다. 2026-08-25 에 없앤 것은 옆의 「📋 복사」 단추뿐이다
           (양호창님 「불필요해 보인다」 · 신청접수 모달과 «같이» 뺐다). 번호를 지우지 말 것. -->
      ${r.proposal_no ? `<span class="rc-tag"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>${esc(r.proposal_no)}</span>` : ""}
      ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ""}
      ${r.is_hidden ? `<span class="hide-tag" title="담당자가 감춘 글 — 시민에게 보이지 않습니다"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
    </div>
    <!-- 🖨 인쇄 전용 안내 — 화면에는 안 보이고 «종이에만» 찍힌다(style.css .print-only).
         정책제안 인쇄물에도 닉네임·읍면동이 함께 찍히므로 신청접수와 «같은 문구»를 둔다. -->
    <p class="print-only print-note">※ 이 문서에는 개인정보가 포함되어 있습니다.
      담당 업무 목적으로만 사용하고, <b>목적 외 이용·제3자 제공을 금지</b>합니다.
      사용 후에는 지체 없이 파기하십시오.</p>
    <div class="field"><div class="field-label">제목</div><div class="field-value">${esc(r.title)}</div></div>
    <div class="field"><div class="field-label">작성</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(regionLabel(r.region)) : ""} · <span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))} · <span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}${cmts ? ` · <span aria-hidden="true">💬</span> 댓글 ${cmts}` : ""}</div></div>
    ${tpl.length
      ? tpl.map(([lab, v]) => `<div class="field"><div class="field-label">${esc(lab)}</div><div class="pm-body-text">${esc(v)}</div></div>`).join("")
      : `<div class="field"><div class="field-label">내용</div><div class="pm-body-text">${esc(r.body || "")}</div></div>`}
    ${reps ? `<div class="field"><div class="field-label"><span aria-hidden="true">🚩</span> 신고 ${reps}건</div><div id="pmReports" class="pm-reports" role="status" aria-live="polite">불러오는 중…</div></div>` : ""}
    <!-- 💬 시민 댓글·답글 (A-07) — ⭐ «읽고 관리하는» 자리다. 공무원이 «쓰는» 자리가 아니다.
         ⛔ 2026-08-25 양호창님 결정 — 공무원이 대화하듯 댓글·답글을 다는 기능을 없앴다.
            (「그냥 심사 진행현황을 알려주니까 그것만 있으면 될 것 같아.
              굳이 공무원이 댓글을 다는 거는 부적절해 보여」)
            ⛔ 쓰기 상자(cmt-write)·부서명 칸·「댓글 올리기」를 되살리지 마세요.
         ✅ 시민끼리 주고받은 «답글 1단 들여쓰기»는 그대로다 — 대화가 흐름대로 보여야 한다
            (양호창님: 「시민들 간은 열어둬」 · 시민앱의 댓글 쓰기도 그대로 둔다).
         ✅ 시민에게 하는 답은 아래 «담당부서 답변»(admin_reply) «한 통»뿐이다. -->
    <div class="field">
      <div class="field-label"><span aria-hidden="true">💬</span> <span id="pmCmtCap">시민 댓글${cmts ? ` ${cmts}건` : ""}</span> <span class="field-opt">(시민들끼리 나눈 의견을 «읽는 곳»입니다)</span></div>
      <!-- ⛔ tabindex="0" 를 지우지 마세요 — 이 목록은 340px 를 넘으면 «스스로 스크롤»됩니다.
           초점을 받을 수 없는 스크롤 상자는 «키보드만 쓰는 이용자»가 아래 댓글을 영영 못 읽습니다
           (KWCAG 6.1.1 «키보드 사용 보장»). 초점을 받으면 ↑↓·PageDown 으로 읽어 내려갑니다.
           ⚠ 초점 테두리는 파일 위쪽 :focus-visible 공통 규칙이 그려 줍니다. -->
      <ul class="cmt-list" id="pmComments" tabindex="0" role="group" aria-label="시민 댓글 목록" aria-live="polite"><li class="forms-empty">불러오는 중…</li></ul>
      <!-- ⛔ 2026-08-25 양호창님 지시 — 댓글 목록 아래 ⓘ 안내 문단은 세 앱에서 뺐다(불필요). 되살릴 때는 PC앱(webui/proposals.js)에도 함께 넣을 것. -->
    </div>
    <div class="field">
      <label class="field-label" for="pmStatus">진행 상태 변경</label>
      <select id="pmStatus" class="st-select">${optHtml}</select>
    </div>
    ${P_MEMO_OK ? `
    <!-- 📝 처리메모 — 신청접수(#amMemo)와 «같은 자리·같은 말투». 시민에게 보이지 않는다.
         ⚠ proposals.admin_memo 칸이 있을 때만 그린다(detectProposalMemoColumn 머리말 참조). -->
    <div class="field">
      <label class="field-label" for="pmMemo"><span aria-hidden="true">📝</span> 처리메모(공무원 기록용 · 시민에게 보이지 않음)</label>
      <p id="pmMemoHint" class="field-hint">부서 내부 기록입니다. 시민 화면에는 나타나지 않습니다.</p>
      <!-- ⛔ disabled 로 시작하는 것을 지우지 마세요 (2026-08-24 A-08).
           처리메모 «값»은 목록(P_COLS)에 없어 이 칸만 따로 읽어 옵니다. 읽어 오기 «전»에
           담당자가 저장하면 빈 칸이 그대로 덮어써져 «남이 적어 둔 메모가 사라집니다».
           그래서 다 읽어 온 뒤(loadProposalMemo)에만 열리고, 못 읽어 오면 잠긴 채 남습니다.
           저장 코드도 data-loaded="1" 일 때만 이 칸을 보냅니다 — 두 겹으로 막습니다. -->
      <textarea id="pmMemo" class="form-textarea" aria-describedby="pmMemoHint" data-loaded="0" disabled
                placeholder="처리메모를 불러오는 중입니다…"></textarea>
    </div>` : ""}
    <!-- 💬 담당부서 답변 — 시민이 «그대로» 읽는 공식 결론 한 통.
         내부 기록(처리메모)과 «다른 칸·다른 색»으로 둔다. 절대 섞지 말 것. -->
    <div class="field citizen-field">
      <label class="field-label citizen-label" for="pmReply"><span aria-hidden="true">💬</span> 담당부서 답변 / 사유 <span class="req-note">(반영·불채택 전환 시 필수)</span></label>
      <p id="pmReplyWarn" class="citizen-warn"><span aria-hidden="true">⚠</span>
        이 내용은 <b>시민에게 그대로 공개됩니다.</b> 내부 판단은 위의 «처리메모»에 적어 주세요.</p>
      <!-- 💬 자주 쓰는 문장 — 누르면 아래 칸에 «덧붙는다». 신청접수(.reply-presets)와 같은 규약.
           ★ 문구는 PROPOSAL_REPLY_PRESETS 한 곳에만 있다. 화면 코드는 손댈 필요 없다. -->
      <div class="reply-presets" role="group" aria-label="자주 쓰는 답변 넣기">
        <span class="reply-presets-cap">자주 쓰는 문장</span>
        ${PROPOSAL_REPLY_PRESETS.map((x, i) =>
          `<button type="button" class="reply-preset" data-preset="${i}">${esc(x.label)}</button>`).join("")}
      </div>
      <textarea id="pmReply" class="form-textarea" aria-describedby="pmReplyWarn" placeholder="시민에게 공개되는 공식 답변·사유를 입력하세요.">${esc(r.admin_reply || "")}</textarea>
    </div>
    <div class="field">
      <label class="toggle-line"><input type="checkbox" id="pmHidden"${r.is_hidden ? " checked" : ""}> <span aria-hidden="true">🚫</span> 블라인드(부적절 글 숨김) — 체크 시 시민에게 안 보임</label>
    </div>
    <!-- 규격서 §0 «한 화면 버튼 3개 상한» — 삭제·인쇄·저장 정확히 셋.
         ★ 신청접수(#amDelete → #amPrint → #amSave)와 «같은 구성·같은 차례»다(A-08).
           · 되돌릴 수 없는 «삭제»가 맨 왼쪽, 결론인 «저장»이 맨 오른쪽.
           · 「삭제」는 2026-08-24 N-03 에서 이미 만든 것을 그대로 쓴다(새로 만들지 않았다).
           · 규격서 §5 «위험» 버튼(흰 면 · 글자·테두리 #A52714) = .nav-btn.danger 재사용.
           · 아이콘은 인라인 SVG(규격서 §5 — 이모지 금지). -->
    <div class="modal-actions">
      <button id="pmDelete" class="nav-btn danger" type="button" aria-label="이 정책제안 삭제"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg><span>삭제</span></button>
      <button id="pmPrint" class="nav-btn ghostish" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 9V4h10v5"/><path d="M7 18H5v-6h14v6h-2"/><path d="M7 14h10v6H7z"/></svg><span>인쇄</span></button>
      ${guestSaveBlockedByServer() ? `<p class="guest-ro"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2h.01"/></svg>둘러보기(테스트) 중에는 제안을 저장·삭제할 수 없습니다. 담당자 계정으로 로그인해 주세요.</p>`
        : `<button id="pmSave" class="nav-btn" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4"/><path d="M8 20v-6h8v6"/></svg><span>저장</span></button>`}
    </div>`;

  if (reps) loadReportDetail(r.id);
  // 💬 시민 댓글 — 기다리지 않고(await 없이) 띄운다. 못 불러와도 검토 화면은 그대로 돈다.
  P_CMT_ROWS = []; P_CMT_REPORTS = {};        // 앞서 열어 둔 제안의 댓글이 남아 있지 않게 비운다
  loadProposalComments(r.id).catch(() => {});
  /* ⛔ 2026-08-25 — 여기 있던 「댓글 올리기」·「답글 대상 지우기」 연결을 없앴다
        (공무원 댓글 쓰기 폐지 · 양호창님). 단추도 함께 사라졌다.

     ♻ 미뤄 둔 실시간 갱신 흘려보내기 — 예전에는 setCommentMode() 가 «새 글» 상태로 돌아올 때
        흘려보냈다. 그 함수가 사라졌으므로 이제 «초점이 댓글 목록을 떠날 때» 흘려보낸다.
        ⛔ 이 연결을 지우지 마세요 — 지우면 목록을 읽는 «동안» 도착한 새 댓글이
           다음 실시간 알림이 올 때까지 영영 화면에 안 나타난다(pcmtBusy 머리말 ①).
        ⚠ 목록 «안에서» 단추 사이를 오갈 때는 흘려보내지 않는다 — 다시 그리면 초점을 잃는다.
        ⚠ #pmComments 는 모달을 열 때마다 innerHTML 로 새로 만들어지므로 처리기가 쌓이지 않는다. */
  const cmtBox = $("#pmComments");
  if (cmtBox) cmtBox.addEventListener("focusout", () => {
    setTimeout(() => {
      if (cmtBox.isConnected && !cmtBox.contains(document.activeElement)) {
        try { flushPCommentRefresh(); } catch (e) { /* 무시 */ }
      }
    }, 0);
  });
  // 📝 처리메모 — 목록에 없는 칸이라 «이 한 건»만 따로 읽어 온다(위 textarea 주석 참조).
  if (P_MEMO_OK) loadProposalMemo(r.id).catch(() => {});

  /* 💬 상용구 — 누르면 답변 칸에 «덧붙는다»(이미 쓴 글을 지우지 않는다).
     ⚠ 신청접수와 달리 글자 수 상한이 없다(proposals.admin_reply 에 maxlength 가 없다) —
        그래서 «넘침» 안내도 두지 않았다. 상한이 생기면 신청접수 쪽 코드를 그대로 옮겨 온다. */
  document.querySelectorAll("#pmBody .reply-preset").forEach((b) => {
    b.onclick = () => {
      const x = PROPOSAL_REPLY_PRESETS[Number(b.getAttribute("data-preset"))];
      const ta = $("#pmReply");
      if (!x || !ta) return;
      const cur = (ta.value || "").trim();
      const next = cur ? (cur + "\n" + x.text) : x.text;
      ta.value = next;
      ta.focus();
      ta.setSelectionRange(next.length, next.length);
      announce(`«${x.label}» 문장을 넣었습니다. 내용을 확인한 뒤 저장해 주세요.`);
    };
  });

  /* 🖨 인쇄 — 이 제안 «한 건»만 종이로. 신청접수(#amPrint)와 «같은 방식»이다.
     ⚠ style.css @media print 에 #pModal 이 «함께» 적혀 있어야 한다(둘 중 하나만 고치지 말 것). */
  const ppr = $("#pmPrint");
  if (ppr) ppr.onclick = () => {
    document.body.classList.add("printing-modal");
    const off = () => document.body.classList.remove("printing-modal");
    // onafterprint 를 못 받는 브라우저가 있어 시간제한으로도 한 번 더 되돌린다
    window.addEventListener("afterprint", off, { once: true });
    setTimeout(off, 4000);
    announce("인쇄 창을 엽니다. 이 정책제안 한 건만 인쇄됩니다.");
    try { window.print(); } catch (e) { off(); }
  };

  /* 🔒 연타 방어(bindOnce) — 같은 제안에 update 가 두 번 나가지 않게.
     ⚠ 둘러보기(게스트)에서는 위에서 «저장 단추를 그리지 않았다» → $("#pmSave") 가 null.
        bindOnce 는 맨 앞에 `if (!btn) return;` 이 있어 그대로 안전하다(597행 부근). */
  bindOnce($("#pmSave"), async () => {
    const newStatus = $("#pmStatus").value;
    const reply = ($("#pmReply").value || "").trim();
    const isHidden = $("#pmHidden").checked;
    // 반영·불채택 전환 시 답변 필수
    if (REPLY_REQUIRED.has(newStatus) && !reply) {
      const m = `'${newStatus}' 상태로 변경하려면 담당부서 답변/사유를 반드시 입력해야 합니다.`;
      announce(m); askAlert(m);
      $("#pmReply").focus();
      return;
    }
    /* ⛔ updated_at 을 여기에 넣지 마세요 (2026-08-25).
       예전에는 `updated_at: new Date().toISOString()` 로 «클라이언트 시계»를 실어 보냈다.
       그러면 아래 낙관적 잠금이 조건으로 쓸 값을 스스로 덮어써 잠금이 성립하지 않는다.
       서버 트리거(trg_proposals_updated · set_updated_at)가 채우는 것이 정본이다. */
    const patch = {
      status: newStatus,
      admin_reply: reply || null,
      is_hidden: isHidden,
    };
    /* 📝 처리메모 — 칸이 있을 때만 담는다(A-08 ①).
       ⚠ 칸이 없는 서버에 admin_memo 를 보내면 PGRST204 로 «저장 전체»가 실패한다 —
          상태·답변까지 함께 날아간다. 그래서 «있을 때만» 담고, 그래도 거절당하면
          아래에서 그 칸만 빼고 한 번 더 보낸다(benefits 의 note 와 같은 안전망). */
    markSelfWrite();                  // 🤫 이 저장이 실시간으로 되돌아와도 소리는 내지 않는다
    const memoEl = $("#pmMemo");
    // ⛔ dataset.loaded === "1" 검사를 빼지 마세요 — 아직 못 읽어 온 빈 칸을 저장하면
    //    다른 담당자가 적어 둔 처리메모가 «조용히» 지워집니다(위 textarea 주석 참조).
    if (P_MEMO_OK && memoEl && memoEl.dataset.loaded === "1") {
      patch.admin_memo = (memoEl.value || "").trim() || null;
    }
    /* 🔒 낙관적 잠금 — 사업 수정·접수 처리와 «같은 규약»(2026-08-25).
       ⚠ .select("id") 를 반드시 붙인다. 안 붙이면 «몇 행이 바뀌었는지» 알 길이 없어
          충돌을 감지할 수단이 구조적으로 없다(예전이 그랬다). */
    const saveProposal = async () => await sb.from("proposals")
      .update(patch).eq("id", r.id).eq("updated_at", r.updated_at).select("id");
    let { data, error } = await saveProposal();
    if (error && isMissingProposalMemo(error) && "admin_memo" in patch) {
      P_MEMO_OK = false; delete patch.admin_memo;
      ({ data, error } = await saveProposal());
    }
    if (error) { announce(writeErrMsg(error, "저장")); askAlert(writeErrMsg(error, "저장")); return; }
    if (!data || !data.length) {
      await announceSaveConflict("이 정책제안을", "#pModal", loadProposals);
      return;
    }
    closeModal($("#pModal"));
    markJustChanged(r.id);
    const dt = doneText("저장했습니다");            // 🎉 「… · 오늘 N번째」
    showDoneCheck(dt);
    announce("정책제안이 저장되었습니다." + dt.replace("저장했습니다", ""));
    await loadProposals();
  });

  /* 🗑 정책제안 삭제 (★ 2026-08-24) ─────────────────────────────────────
     🧪 테스트 모드에서는 «단추 자체를 내보내지 않는다».
        이 저장소 원칙 — 「눌러 봐야 실패할 조작을 남기지 않는다」(paintGuestLocks 머리말).
        게스트는 쓰기가 통째로 막혀 있어(installGuestReadOnlyGuard) 눌러도 안내문만 뜬다.
        확인창까지 지나온 뒤 「할 수 없습니다」를 만나는 것은 막다른 길이다.
     ⚠ [hidden]{display:none !important} 가 style.css 에 있어 hidden 하나로 확실히 사라진다. */
  const pmDel = $("#pmDelete");
  if (pmDel) pmDel.hidden = guestNoDelete();

  // 🔒 연타 방어(bindOnce) — 확인창을 두 번 띄우거나 delete 를 두 번 보내지 않는다.
  //    (두 번째 delete 는 «이미 없는 행»이라 모달이 닫힌 뒤 엉뚱한 오류가 떴다)
  if (pmDel && !guestNoDelete()) bindOnce(pmDel, async () => {
    // 되돌릴 수 없는 삭제 — 사업 삭제(#mDel)·신청 삭제(#amDelete)와 «같은» 확인창을 쓴다.
    // askConfirm 규약: 초점은 «취소»에 놓인다(엔터 연타로 지워지는 사고 방지).
    const ok = await askConfirm({
      title: "이 정책제안을 삭제할까요?",
      body: `«${r.title || "제목 없음"}»\n\n`
          /* ⭐ 2026-08-26 (㉥) — 예전 문구는 「공감·신고 기록」만 말해, 실제로 함께 사라지는
                «의견(댓글)»과 «담당 부서의 답변»을 빠뜨렸다. 지워지는 것을 다 적지 않으면
                되돌릴 수 없는 조작 앞에서 담당자가 «무엇을 잃는지» 모르고 누르게 된다.
             ⚠ PC앱 webui/proposals.js 의 같은 확인창도 «글자 단위로» 같다(🟠단장). 한쪽만 고치지 말 것. */
          + "삭제하면 시민 화면에서도 사라집니다. 시민이 남긴 공감·의견·신고 기록과 담당 부서의 답변도 함께 지워집니다.\n"
          + "되돌릴 수 없습니다. 부적절한 글이라면 «블라인드»로 감추는 방법도 있습니다.",
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    const out = await deleteProposal(r.id);
    if (!out.ok) { announce(out.msg); askAlert(out.msg); return; }
    closeModal($("#pModal"));
    announce("정책제안이 삭제되었습니다.");
    // 목록과 위쪽 현황 카드(전체·검토 대기·답변 완료)를 함께 다시 그린다
    // — loadProposals() 가 renderPSummary()(#kpiPAll·#kpiPNew·#kpiPDone)까지 맡는다.
    await loadProposals();
  });

  openModal($("#pModal"));
}

async function loadReportDetail(proposalId) {
  const box = $("#pmReports");
  if (!box) return;
  const { data, error } = await sb.from("proposal_reports")
    .select("reason, created_at").eq("proposal_id", proposalId).order("created_at", { ascending: false });
  if (error) { box.textContent = "신고 내역 조회 권한이 없습니다."; return; }
  if (!data || !data.length) { box.textContent = "신고 내역 없음"; return; }
  box.innerHTML = data.map((x) =>
    `<div class="pm-rep-item">• ${esc(x.reason || "(사유 없음)")} <span class="muted-date">(${esc(fmtDate(x.created_at))})</span></div>`
  ).join("");
}

/* ============================================================
   📥 신청 접수 관리 (「앱 직접 접수(실시간)」 ②단계) — applications
   시민앱 신청이 Supabase 로 «직접» 들어와 여기서 실시간 접수·처리된다.
   공용 헬퍼: window.SangjuApply (apply_client.js). 상태값 4종은 PC와 동일.
   ⚠ 2026-08-24 이후 시민앱의 «신청 메일 발송(Web3Forms→PC 자동접수)»은 없어졌다.
   Supabase 직접 접수가 «유일한» 통로다(apply_client.js 머리말 참조).
   Web3Forms 는 시민앱의 «불편신고»에만 남아 있다 — 신청과는 무관하다.
   ============================================================ */
// ⚠ 상태값은 «접수/심사중/승인/반려» 4값(PC config.APPLICATION_STATUSES·SQL CHECK 와 동일)
const A_STATUSES = (window.SangjuApply && SangjuApply.STATUSES) || ["접수", "심사중", "승인", "반려"];
// 📥 접수 탭 «기본 필터 = 전체» (2026-08-19 양호창님 지시).
//    ⛔ 「처리 대기」(접수+심사중을 묶은 «가상» 상태) 칩은 «영구 삭제»했습니다. 되살리지 마세요.
//       왜 뺐나: ① 실제 상태값이 아니라 화면에만 있는 말이라, 승인·반려까지 포함한 전체 건수와
//       머릿속에서 어긋났습니다. ② 기본이 «처리 대기»라 들어오자마자 목록이 비어 보이는 일이
//       잦았고(오늘 처리할 게 없는 날), 그때마다 «자료가 안 들어왔나» 하고 되묻게 됐습니다.
//       손볼 건만 보려면 「접수」·「심사중」 칩을 그대로 쓰면 됩니다.
//    ⚠ 칩 순서는 「전체」가 «맨 앞» — 목록의 기본 상태를 왼쪽 첫 자리에 둔다.
let AALL = [], A_STATUS = "전체", aPage = 0, A_LOADED = false;

/* 🔎 요약 카드로 좁혀보기 (2026-08-19 양호창님 지시) ─────────────────────────
   「오늘 접수 / 심사중 / 이달 승인 / 이달 반려」 카드를 누르면 그 건만 목록에 남는다.
   ⚠ 판정 기준은 여기서 «새로 짜지 않는다» — stats.js 가 카드의 숫자를 셀 때 쓰는
      window.sjScopes[키].test(행) 를 그대로 가져다 쓴다. 그래야 카드에 적힌 숫자와
      목록 건수가 어긋날 수 없다(한 곳만 고치면 양쪽이 함께 바뀐다).
   ⚠ 상태 칩과는 «둘 중 하나»만 걸린다 — 카드를 누르면 칩은 「전체」로, 칩을 누르면
      카드 선택이 풀린다. (예: «이달 승인» + 칩 «반려» 처럼 영영 0건인 조합을 막는다)
   값: "" (전체) | "today" | "review" | "okM" | "noM" */
let A_SCOPE = "";
function aScopeDef() {
  const t = window.sjScopes;
  return (t && A_SCOPE && t[A_SCOPE]) ? t[A_SCOPE] : null;
}

/* ══════════════════════════════════════════════════════════════════════
   🏢 담당팀 «기억되는» 필터 (2026-08-20)
   ────────────────────────────────────────────────────────────────────
   담당자는 늘 자기 팀 것만 본다. 매번 고르지 않게 이 브라우저에 기억해 둔다.
   ⚠⚠ 기억되는 필터의 «단 하나의 위험» — 다음 날 들어와서 목록이 비어 있으면
      「접수가 0건이네」 로 오해한다. 그래서 팀이 걸려 있는 동안에는 목록 위 띠(#aScopeBar)가
      «항상» 「담당팀 ○○ 으로 보는 중」 + 「전체 보기」 를 보여 준다(renderAScopeUI).
      ⛔ 그 띠를 조건부로 감추지 마세요. 감추는 순간 이 기능은 «버그»가 됩니다.
   ⚠ 팀 목록은 지어내지 않는다 — 실제로 들어와 있는 접수의 team 값만 모은다.
   ⚠ 기억한 팀이 오늘 자료에 하나도 없으면(부서 개편 등) 조용히 «전체»로 되돌린다.
   ══════════════════════════════════════════════════════════════════════ */
const A_TEAM_KEY = "sangju_admin_team_filter";
let A_TEAM = "";
function loadTeamPref() {
  try { A_TEAM = localStorage.getItem(A_TEAM_KEY) || ""; } catch (e) { A_TEAM = ""; }
  return A_TEAM;
}
function saveTeamPref() {
  try { A_TEAM ? localStorage.setItem(A_TEAM_KEY, A_TEAM) : localStorage.removeItem(A_TEAM_KEY); } catch (e) {}
}
// 접수 목록에 실제로 있는 담당팀만 모아 <select> 를 채운다(가나다순).
function renderTeamOptions() {
  const sel = $("#aTeam"); if (!sel) return;
  const names = [];
  AALL.forEach((r) => {
    const t = (r && r.team ? String(r.team) : "").trim();
    if (t && names.indexOf(t) < 0) names.push(t);
  });
  names.sort((a, b) => a.localeCompare(b, "ko"));
  // 기억해 둔 팀이 오늘 자료에 없으면 «전체»로 되돌린다(빈 화면 오해 방지).
  if (A_TEAM && names.indexOf(A_TEAM) < 0) { A_TEAM = ""; saveTeamPref(); }
  sel.innerHTML = '<option value="">담당팀 전체</option>' +
    names.map((n) => `<option value="${esc(n)}"${n === A_TEAM ? " selected" : ""}>${esc(n)}</option>`).join("");
  sel.value = A_TEAM;
}

/* ══════════════════════════════════════════════════════════════════════
   ☑ 여러 건 고르기 — 일괄 상태 변경(H)의 «선택 상태» 한 곳
   ⚠ 목록이 달라지면(검색·칩·팀·페이지) 선택은 «반드시» 지운다.
      화면에 보이지 않는 건이 몰래 선택된 채 남아 있으면 «20건인 줄 알았는데 35건이
      바뀌는» 사고가 난다. clearASel() 을 거치지 않는 경로를 만들지 말 것.
   ══════════════════════════════════════════════════════════════════════ */
let A_SEL = new Set();
function clearASel() { A_SEL.clear(); }
// ⛔ 2026-08-21 — 카드를 눌러 좁혀 보던 toggleAScope() 는 삭제했습니다(양호창님 지시).
//    A_SCOPE 자체는 «항상 빈 값»으로 남습니다 — 담당팀 필터 띠(#aScopeBar)가 같은 자리를 쓰기 때문에
//    변수와 renderAScopeUI() 는 그대로 둡니다(지우면 담당팀 띠가 함께 사라집니다).
// 「무엇만 보는 중인지」 한 줄 띠 + 카드의 눌림 표시를 실제 상태에 맞춘다.
// ⚠ renderApplications() 안에서 매번 부른다 — 실시간 접수로 목록을 다시 그려도 표시가 안 풀린다(요건 ⑥).
function renderAScopeUI() {
  // ⛔ 카드에 눌림 표시(aria-pressed)를 하던 줄은 지웠습니다 — 카드는 더 이상 단추가 아닙니다.
  const def = aScopeDef();
  const bar = $("#aScopeBar"), txt = $("#aScopeText");
  if (!bar) return;
  /* 무엇으로 좁혀 보는 중인지 «한 줄»로 모아 알린다.
     ⚠ 담당팀은 이 브라우저에 «기억»되는 필터라, 걸려 있는 동안에는 이 띠가 반드시 떠야 한다
        (안 그러면 다음 날 「접수가 0건이네」 하고 오해한다 — A_TEAM 주석 참조). */
  const parts = [];
  if (A_TEAM) parts.push(`담당팀 «${A_TEAM}» 으로 보는 중입니다`);
  if (def) parts.push(def.note);
  if (txt) txt.textContent = parts.join(" · ");
  bar.hidden = !parts.length;
}

/* 「☑ N건 선택됨」 띠 — 하나라도 고르면 나타나고, 다 풀면 사라진다. */
function renderBulkBar() {
  const bar = $("#aBulkBar"), cnt = $("#aBulkCount");
  if (!bar) return;
  const n = A_SEL.size;
  /* 🧪 둘러보기(게스트)에게는 띠 자체를 내보내지 않는다 (2026-08-25 A-1).
     게스트에게는 «고르기 칸»이 없어 A_SEL 이 늘 비어 있지만, 다른 길로 값이 들어와도
     「눌러 봐야 실패할 조작」이 화면에 나타나지 않도록 여기서 한 번 더 못 박는다. */
  bar.hidden = !n || guestSaveBlockedByServer();
  if (cnt && n) cnt.textContent = `${n}건 선택됨`;
}

function bindApplicationsUI() {
  // 🏢 기억해 둔 담당팀을 «목록을 채우기 전에» 읽어 둔다
  //    (loadApplications → renderTeamOptions 가 이 값으로 선택 상태를 맞춘다)
  loadTeamPref();
  const s = $("#aSearch");
  if (s) s.addEventListener("input", debounce(() => { aPage = 0; clearASel(); renderApplications(); }, 300));
  // ⛔ 2026-08-21 — 요약 카드 네 장의 «클릭해서 좁혀 보기»는 되돌렸습니다(양호창님 지시).
  //    카드는 다시 <div>(보여주기 전용)이라 연결할 클릭이 없습니다. 되살리지 마세요.
  const sc = $("#aScopeClear");
  if (sc) sc.onclick = () => {
    // 「전체 보기」 — 요약 카드 좁힘과 «기억된 담당팀»을 함께 푼다(띠에 적힌 그대로).
    A_SCOPE = ""; A_TEAM = ""; saveTeamPref(); renderTeamOptions();
    aPage = 0; clearASel(); renderAStatusChips(); renderApplications();
  };
  const c = $("#amClose"); if (c) c.onclick = () => requestCloseModal($("#aModal"));
  const m = $("#aModal");
  if (m) m.addEventListener("click", (e) => { if (e.target.id === "aModal") requestCloseModal($("#aModal")); });
  // Esc·포커스 트랩은 공통 _trapKeydown 이 처리(중복 등록 없음)

  // 🏢 담당팀 — 고른 값을 이 브라우저에 기억한다(다음 로그인에도 그대로 걸린다).
  const tm = $("#aTeam");
  if (tm) tm.onchange = () => {
    A_TEAM = tm.value || "";
    saveTeamPref();
    aPage = 0; clearASel();
    renderApplications();          // 띠(#aScopeBar)는 renderApplications → renderAScopeUI 가 갱신
    announce(A_TEAM ? `담당팀 ${A_TEAM} 으로 좁혀 봅니다.` : "담당팀 전체를 봅니다.");
  };

  // ☑ 일괄 상태 변경 — 상태 목록은 A_STATUSES 한 곳에서만 온다(칩·모달과 같은 값)
  const bs = $("#aBulkStatus");
  if (bs && !bs.options.length) {
    bs.innerHTML = A_STATUSES.map((s2) => `<option value="${esc(s2)}">${esc(s2)}</option>`).join("");
  }
  const bc = $("#aBulkClear");
  if (bc) bc.onclick = () => {
    clearASel(); renderApplications();
    announce("선택을 모두 해제했습니다.");
  };
  bindOnce($("#aBulkApply"), applyBulkStatus);   // 🔒 연타 방어 — 20건이 두 번 나가지 않게
}

/* ══════════════════════════════════════════════════════════════════════
   ☑ 여러 건 한꺼번에 상태 바꾸기 (2026-08-20)
   ────────────────────────────────────────────────────────────────────
   이 화면에서 «가장 위험한» 기능이다. 되돌리기가 없고, 한 번에 수십 건이 바뀐다.
   그래서 다음 네 가지를 반드시 지킨다.
     ① 누르기 전 — 「몇 건을 무엇으로」 를 적은 확인 창을 띄운다(초점은 «취소»에).
     ② 한 건씩 차례로 — 동시에 보내지 않는다. 서버 쪽 순서가 뒤엉키지 않게.
     ③ 부분 실패를 숨기지 않는다 — 「20건 중 18건 성공, 2건 실패(접수번호·사유)」 를 그대로 알린다.
     ④ 감사기록 — 상태 변경도 개인정보 처분이므로 건마다 admin_audit 에 남긴다.
        ⛔ 신청자 이름·연락처·문의내용은 절대 넣지 않는다. «접수번호 + 상태 변화» 뿐이다.
        ⛔ 기록에 실패해도 업무(상태 변경)를 멈추지 않는다 — PC앱 access_log.py 와 같은 원칙.
   ⚠ 처리메모·시민 안내문은 건드리지 않는다. 시민에게 나가는 글을 여러 건에 한꺼번에
      뿌리는 길은 «일부러» 만들지 않았다(한 건씩 확인하고 공개해야 한다).
   ══════════════════════════════════════════════════════════════════════ */
async function applyBulkStatus() {
  const ids = Array.from(A_SEL);
  if (!ids.length) return;
  const newStatus = ($("#aBulkStatus") || {}).value || A_STATUSES[0];
  const cnt = $("#aBulkCount");

  // 고른 id 에 해당하는 «지금 화면의» 행을 찾아 둔다(접수번호·이전 상태를 기록에 쓴다)
  const chosen = ids.map((id) => AALL.find((r) => String(r.id) === id)).filter(Boolean);
  /* 이미 그 상태인 건은 «보내지 않는다».
     보내 봐야 바뀌는 것이 없는데도 서버 왕복이 늘고, 감사기록에 「승인 → 승인」 같은
     뜻 없는 줄이 쌓인다(2026-08-20 실측에서 실제로 그랬다). 건너뛴 건수는 확인 창에 밝힌다. */
  const picked = chosen.filter((r) => ((r.status || "접수") !== newStatus));
  const skipped = chosen.length - picked.length;
  if (!picked.length) {
    announce(`고르신 ${chosen.length}건은 이미 «${newStatus}» 상태입니다. 바꿀 것이 없습니다.`);
    askAlert(`고르신 ${chosen.length}건은 이미 «${newStatus}» 상태입니다.\n바꿀 것이 없어 그대로 두었습니다.`);
    return;
  }

  // ① 확인 — 되돌릴 수 없다는 것을 분명히 말한다
  const ok = await askConfirm({
    title: `${picked.length}건의 상태를 «${newStatus}» 로 바꿉니다`,
    body: `고르신 ${chosen.length}건 가운데 ${picked.length}건을 «${newStatus}» 상태로 바꿉니다.\n`
        + (skipped ? `(${skipped}건은 이미 «${newStatus}» 이라 그대로 둡니다)\n` : "")
        + "\n· 처리메모와 시민 안내문은 그대로 둡니다(상태만 바뀝니다).\n"
        + "· 한꺼번에 바꾼 것을 되돌리는 기능은 없습니다.\n"
        + "· 건수와 상태를 다시 한 번 확인해 주세요.",
    cancelText: "취소",
    okText: `${picked.length}건 바꾸기`,
  });
  if (!ok) return;

  // ② 한 건씩 차례로. 진행 상황을 띠에 적어 «멈춘 것»으로 보이지 않게 한다.
  const fails = [];
  let done = 0, auditMiss = 0;   // auditMiss = 개인정보보호법 §29 접속기록을 «남기지 못한» 건수
  for (const r of picked) {
    if (cnt) cnt.textContent = `${done + 1}/${picked.length} 바꾸는 중…`;
    const prev = r.status || "접수";
    try {
      await SangjuApply.updateApplication(r.id, { status: newStatus });
      done += 1;
      // ④ 건마다 감사기록. 실패해도 업무는 계속하되 «몇 건이 안 남았는지» 를 센다(§29).
      if (!(await auditBulkStatus(r.receipt_no, prev, newStatus))) auditMiss += 1;
    } catch (err) {
      fails.push({ rc: r.receipt_no || `내부번호 ${r.id}`, why: writeErrMsg(err, "상태 변경") });
    }
  }

  clearASel();
  await loadApplications();

  // ③ 결과를 «숨김 없이» 알린다
  // 🔒 §29 — 「아직 안 남겼다」와 「남기지 못했다」는 다르다. 조용히 넘기지 않는다.
  const auditNote = auditMiss
    ? `\n\n※ 이 가운데 ${auditMiss}건은 접속기록(§29)을 남기지 못했습니다 — 시스템 담당자에게 알려 주세요.`
    : "";
  if (!fails.length) {
    const tail = skipped ? `(이미 «${newStatus}» 이던 ${skipped}건은 그대로 두었습니다)` : "";
    const dt = doneText(`${done}건을 «${newStatus}» 로 바꿨습니다`);
    showDoneCheck(dt);
    announce(dt + ". " + tail);
    if (auditMiss) askAlert(`${done}건을 «${newStatus}» 로 바꿨습니다.` + auditNote);
  } else {
    const lines = fails.slice(0, 8).map((f) => `· ${f.rc} — ${String(f.why).split("\n")[0]}`);
    if (fails.length > 8) lines.push(`· 그 밖 ${fails.length - 8}건`);
    const msg = `${picked.length}건 중 ${done}건을 «${newStatus}» 로 바꿨습니다.\n`
              + `${fails.length}건은 바꾸지 못했습니다.\n\n${lines.join("\n")}\n\n`
              + "바꾸지 못한 건은 목록에서 하나씩 열어 다시 시도해 주세요." + auditNote;
    announce(`${picked.length}건 중 ${done}건 성공, ${fails.length}건 실패했습니다.`);
    askAlert(msg);
  }
}

/* 🔒 일괄 상태 변경 감사기록 — admin_audit (supabase/application_status_2.sql (라))
   ⛔ 남기는 것: 접수번호 · 「접수 → 승인」 같은 상태 변화뿐.
   ⛔ 남기지 않는 것: 신청자 이름·연락처·문의내용·안내문 본문. 기록하려다 개인정보를
      한 벌 더 만드는 것은 본말전도다(그 표의 설계 원칙 그대로).
   누가·언제는 서버가 채운다(actor_uid = auth.uid()). 표 제약: action ≤ 40자, target ≤ 60자, detail ≤ 200자. */
async function auditBulkStatus(receiptNo, prevStatus, newStatus) {
  try {
    const res = await sb.from("admin_audit").insert({
      action: "BULK_STATUS_CHANGE",
      target: String(receiptNo || "").slice(0, 60),     // ★ 접수번호만
      target_type: "접수(공무원앱)",
      detail: `상태 ${prevStatus} → ${newStatus} (일괄)`,
      result: "성공",
    });
    // ⚠ supabase-js 의 insert 는 실패해도 «예외를 던지지 않는다» — {error} 로 돌려줄 뿐이다.
    //    그래서 예전 try/catch 는 기록 실패를 «한 번도» 잡지 못했다(admin_audit 이 0행인데도 몰랐다).
    if (res && res.error) throw res.error;
    return true;
  } catch (e) {
    console.warn("[감사기록] 상태 변경 기록을 남기지 못했습니다:", e);
    return false;   // 업무는 멈추지 않되, «몇 건이 안 남았는지» 는 호출측이 화면에 알린다
  }
}

/* 🔒 접수 행에서 «자격증명» 열을 떼어 낸다 — supabase/신청첨부.sql [1-A] 규약.
   ────────────────────────────────────────────────────────────────────────
   applications 를 select * 로 읽으면 attach_ticket 이 «함께» 실려 온다.
   이것은 접수 직후 30분 동안 살아 있는 «업로드 통행증»이다. 이 값을 아는 사람은
   그 신청의 첨부 폴더에 파일을 밀어 넣을 수 있다.
   ⛔ 화면·검색 대상·콘솔 로그·admin_audit 어디에도 나가면 안 된다.
      SQL 쪽에서 컬럼 권한으로 막지 «못하는» 이유도 그 파일에 적혀 있다
      (PostgREST 가 select=* 를 열 목록으로 펼쳐 보내므로, 권한을 회수하면
       공무원앱의 접수 목록이 통째로 실패한다) → 그래서 «받는 쪽»이 지운다.
   ★ 여기서 한 번만 지우면 그 뒤 모든 화면(목록·검색·상세·첨부·감사기록)이 안전하다.
     AALL 에 담기기 «전»이 유일한 관문이므로, 새 조회 경로를 만들면 여기를 꼭 거치게 할 것.
   ⛔ 이 목록에서 attach_ticket 을 빼지 마세요. 새 비밀 열이 생기면 여기에 «더하세요». */
const APPLICATION_SECRET_KEYS = ["attach_ticket"];
function scrubApplications(rows) {
  return (rows || []).map((row) => {
    if (!row || typeof row !== "object") return row;
    APPLICATION_SECRET_KEYS.forEach((k) => { if (k in row) delete row[k]; });
    return row;
  });
}

async function loadApplications() {
  showSkeleton("#aList", 4);          // 첫 불러오기에만
  let data;
  try {
    data = await SangjuApply.listApplications();
  } catch (err) {
    console.error(err);
    // 원인(연결/권한/테이블 미생성)별 안내 + 다시 시도 — 테이블 미실행이어도 앱은 안 깨진다
    showLoadError("#aList", err, "aListRetry", loadApplications);
    $("#aCount").textContent = "";
    $("#aPager").innerHTML = "";
    return;
  }
  AALL = scrubApplications(data);     // 🔒 자격증명(attach_ticket) 을 «앱에 들이기 전에» 떼어 낸다
  // ⚠ 자료를 새로 받았으면 선택은 지운다 — 그 사이 지워진 건이 선택에 남아 있을 수 있다.
  clearASel();
  renderTeamOptions();               // 🏢 담당팀 목록도 방금 받은 자료로 다시 채운다
  A_LOADED = true;
  ART_PENDING = 0; syncRtBanners();   // 새로 불러왔으니 «밀린 알림»도 지운다
  /* 🔴 목록을 «실제로» 받았으므로 임시 주머니를 버리고 AALL 기준으로 다시 센다.
     ⚠ prune — 이미 지워진 접수의 읽음 기록을 저장소에서 걷어낸다(무한히 쌓이지 않게). */
  A_NEW.clear();
  await readsLoad(RK_A);              // ⚠ isNew() 는 load() 뒤라야 답한다 — 반드시 «먼저»
  await readsPrune(RK_A, AALL);       // ⚠ 행 객체를 «그대로» 넘긴다(어댑터가 id 를 꺼낸다)
  renderAStatusChips();
  renderApplications();
  paintTabBadges();
}

function subscribeApplicationsRealtime() {
  // 시민앱에서 신청하면 즉시 여기로 온다 → 화면을 갈아엎지 않고 «N건» 알림 띠만 올린다.
  if (!window.SangjuApply) return;
  /* 🧪 둘러보기는 «구독하지 않는다» (2026-08-25)
     ① 게스트 목록은 고정 예시라 새 접수가 와도 바뀔 것이 없다 — 「새 접수 N건」 띠를
        올려 놓고 눌러도 목록이 그대로면 그것이야말로 «그럴듯한 거짓말»이다.
     ② 실시간 방송에는 시민의 이름·연락처가 그대로 실린다. 쓰지도 않을 개인정보를
        게스트 브라우저로 흘려보낼 이유가 없다(안 받는 것이 가장 확실한 차단이다). */
  if (IS_GUEST) return;
  SangjuApply.subscribeApplications((p) => {
    if (A_LOADED) {
      /* 🔴 탭 배지 숫자는 «즉시» 올린다 (2026-08-26 · 정책제안 구독과 같은 규약)
         ⛔ rtAutoApply() 에 태우지 마세요 — 모달을 열어 둔 동안 배지가 멈춥니다.
         ⚠ payload(p) 는 apply_client.js subscribeApplications 가 넘겨 준다.
           예전에는 그 함수가 인자를 삼켜 INSERT/UPDATE 를 구분할 수 없었다(2026-08-26 수정). */
      if (p && p.eventType === "INSERT" && p.new && p.new.id != null) {
        A_NEW.add(String(p.new.id)); paintTabBadges();
      }
      ART_PENDING += 1; syncRtBanners(); rtAutoApply("applications", loadApplications);
      // 🔔 소리 — 켜 둔 사람에게만. 화면 띠(«새 접수 N건»)가 언제나 함께 뜨므로
      //    소리만으로 정보를 전하지 않는다(KWCAG 5.4.1). A_LOADED 안이라 첫 화면에서는 울리지 않는다.
      //    ⚠ isSelfEcho() — 내가 방금 저장한 것이 되돌아온 것이면 울리지 않는다.
      if (!isSelfEcho()) playNewBeep();
    }
  }, (status) => rtChannelStatus("applications", status));
}

function renderAStatusChips() {
  const box = $("#aStatusChips"); if (!box) return;
  box.innerHTML = "";
  // 「전체」가 맨 앞 — 기본 상태를 첫 자리에(2026-08-19 양호창님 지시). 뒤는 실제 상태값 4종 순서.
  ["전체", ...A_STATUSES].forEach((st) => {
    const c = el("button", "chip" + (A_STATUS === st ? " on" : ""));
    c.type = "button";
    c.textContent = st;
    // 색만으로 필터 상태를 알리지 않도록 접근명에 «선택됨»을 함께 넣는다
    c.setAttribute("aria-pressed", A_STATUS === st ? "true" : "false");
    // 칩을 고르면 요약 카드로 좁혀둔 것은 푼다(둘이 겹쳐 영영 0건이 되는 일을 막는다)
    c.onclick = () => { A_STATUS = st; A_SCOPE = ""; aPage = 0; clearASel(); renderAStatusChips(); renderApplications(); };
    box.appendChild(c);
  });
}

// 신청일시: 날짜+시각(KST 표시). created_at 은 UTC 이므로 로컬(KST) 로 변환해 보여준다.
function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s); if (isNaN(d)) return String(s).slice(0, 16);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 🧪 둘러보기 «예시 자료입니다» 알림 — 목록 «바로 위»에 글자로 밝힌다 (2026-08-25)
   ⭐ 예시를 «가려서» 될 일이 아니라 «말해야» 할 일이다. 이름이 「김○○」이라 눈으로도
     구분되지만, 실제 접수 현황으로 오해하면 그 화면이 그대로 시정 판단이 된다
     (인수인계 2-4 「가장 무서운 결함은 멈추는 것이 아니라 그럴듯한 거짓말」).
   ⚠ 게스트라도 «한 건도 못 읽었으면» 띄우지 않는다 — 그때는 아래 빈 상태 안내가 말한다.
   ⚠ 로그인한 공무원 화면에는 어떤 경우에도 뜨지 않는다. */
function paintDemoNote() {
  const box = $("#aDemoNote");
  if (!box) return;
  box.hidden = !(guestUsesDemoList() && AALL.length > 0);
}

function renderApplications() {
  const list = $("#aList"); if (!list) return;
  const q = ($("#aSearch") ? $("#aSearch").value : "").trim().toLowerCase();
  const scope = aScopeDef();          // 요약 카드로 좁혀보는 중이면 그 판정 함수
  renderAScopeUI();
  let rows = AALL.filter((r) => {
    const rst = r.status || "접수";
    if (scope && !scope.test(r)) return false;
    if (A_STATUS !== "전체" && rst !== A_STATUS) return false;
    // 🏢 담당팀 — 기억되는 필터. 걸려 있으면 위 #aScopeBar 띠가 반드시 함께 뜬다.
    if (A_TEAM && String(r.team || "").trim() !== A_TEAM) return false;
    if (q) {
      // 📍 읍·면·동도 검색 대상 — 별도 «지역 필터»를 늘리지 않는 대신 여기서 찾게 한다(규격서 §0)
      const blob = `${r.benefit_name || ""} ${r.applicant_name || ""} ${r.phone || ""} ${r.receipt_no || ""} ${r.team || ""} ${regionLabel(r.region)}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  // 최신순(신청일시 내림차순) — listApplications 가 이미 정렬하지만 필터 후에도 유지
  rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#aCount").textContent = `총 ${rows.length}건`;
  renderBulkBar();
  paintDemoNote();            // 🧪 둘러보기면 «예시 자료입니다» 를 목록 위에 글자로 밝힌다
  if (!rows.length) {
    /* 🧪 테스트 모드 — 둘러보기는 진짜 신청 자료를 «아예 읽지 않는다»(apply_client.js).
       대신 demo_applications() 예시를 읽는데, 그 함수가 아직 안 심겼거나 지워졌으면
       한 건도 오지 않는다. 그때 빈 화면으로 두면 「접수가 없구나」로 오해한다 →
       «0건»이 아니라 «여기서는 그것을 볼 수 없다»가 사실이므로 그렇게 적는다.
       ⚠ 붉은 오류판을 띄우지 않는다 — 게스트가 할 수 있는 일이 없고, 고장도 아니다. */
    if (guestUsesDemoList() && !AALL.length) {
      list.innerHTML =
        '<div class="empty">둘러보기 예시 자료가 아직 준비되지 않았습니다. '
        + '실제 신청 접수 내역은 시민의 이름·연락처가 담긴 개인정보라, 담당자 계정으로 로그인하셔야 열립니다.<br>'
        + '사업 관리·시민 정책제안 탭은 그대로 둘러보실 수 있습니다.</div>';
      $("#aCount").textContent = "";
      $("#aPager").innerHTML = "";
      announce("둘러보기 예시 자료가 아직 준비되지 않았습니다.");
      return;
    }
    /* 빈 화면에도 «다음 행동»을 알려 준다(규격서 0절).
       ★ 2026-08-20 — 「심사중」이 0건이 되는 순간은 «허탕»이 아니라 «다 처리한 것»이다.
         그때만 상상주도 캐릭터가 아래에서 살짝 떠오르며 축하한다(규격서 §14② «빈 화면 캐릭터»).
         ⚠ 접수 자체가 0건인 «아직 아무 일도 없는» 화면에는 띄우지 않는다 — 축하할 일이 아니다.
         ⚠ 캐릭터는 원색 그대로·형태 변형 없이 쓴다(규격서 §18). 뜻은 뒤따르는 글자가 전하므로 alt="". */
    const cleared = (AALL.length > 0) && (A_STATUS === "심사중" || A_SCOPE === "review");
    if (cleared) {
      list.innerHTML =
        '<div class="empty empty-cheer">' +
          '<img src="assets/sangsang1.png" class="empty-mascot" alt="" width="112" height="112">' +
          '<b class="cheer-title">심사중인 접수가 없습니다. 다 처리하셨어요.</b>' +
          '<span class="cheer-sub">새 신청이 들어오면 이 자리에 바로 나타납니다. ' +
            '위 «전체»를 누르면 처리한 건까지 모두 볼 수 있습니다.</span>' +
        '</div>';
      announce("심사중인 접수가 없습니다. 모두 처리하셨습니다.");
    } else {
      list.innerHTML = scope
        ? `<div class="empty">${esc(scope.empty)} 위 «전체 보기»를 누르면 모든 접수를 볼 수 있습니다.</div>`
        : (A_STATUS === "전체"
          ? (A_TEAM
            ? `<div class="empty">담당팀 «${esc(A_TEAM)}» 으로 들어온 신청이 없습니다. 위 «전체 보기»를 누르면 모든 담당팀의 접수를 볼 수 있습니다.</div>`
            : '<div class="empty">아직 들어온 신청이 없습니다. 시민이 신청하면 이 자리에 바로 나타납니다.</div>')
          : `<div class="empty">«${esc(A_STATUS)}» 상태인 신청이 없습니다. 위 «전체»를 누르면 모든 접수를 볼 수 있습니다.</div>`);
    }
    $("#aPager").innerHTML = "";
    return;
  }

  const pages = Math.ceil(rows.length / PAGE);
  if (aPage >= pages) aPage = pages - 1;
  if (aPage < 0) aPage = 0;
  const slice = rows.slice(aPage * PAGE, aPage * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const st = r.status || "접수";
    const od = overdueDays(r);         // ⏳ 처리 기한 경과(0 이면 아직 기한 안)
    const rid = String(r.id);
    const card = el("div", "pcard");
    // 키보드 접근: role=button + Enter/Space. 상태·사업명·신청자를 접근명에 포함(색 의존 금지).
    /* 🔴 «아직 확인하지 않음» — 아무도 이 접수를 열어 본 적이 없으면 「신규」 배지가 붙는다.
       ⚠ 「신규」가 붙는 동안 「N일 경과」는 생략한다(세 앱 공통 «배지 차례 규약»).
         신청은 OVERDUE_DAYS=7 이라 정책제안(1일)처럼 매번 겹치지는 않는다.
       🧪 둘러보기(게스트)에게는 아예 붙지 않는다 — readsIsNew() 안에서 걸러진다. */
    const isNew = readsIsNew(RK_A, r.id, r.created_at);
    /* ⛔ 「신규」를 «맨 앞»에 한 번 더 넣지 마세요 — 정책제안 카드와 같은 까닭입니다(그쪽 주석 참조). */
    const aLabel = [
      `상태 ${st}`,
      (od && !isNew) ? `접수 후 ${od}일 경과` : "",   // ⏳ 색이 아니라 «글자»로도 알린다
      `사업 ${r.benefit_name || ""}`,
      `신청자 ${r.applicant_name || ""}`,
      `읍면동 ${regionLabel(r.region)}`,        // 📍 값이 없으면 「미기재」로 읽힌다
      r.receipt_no ? `접수번호 ${r.receipt_no}` : "",
      r.citizen_reply ? "시민 안내문 공개중" : "",
      // ⛔ 이 꼬리는 «맨 뒤»여야 한다 — 맨 앞으로 옮기면 음성명령 매칭이 어긋난다(세 앱 공통).
      isNew ? NEW_ALABEL : "",
    ].filter(Boolean).join(", ") + " — 접수 처리 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    // 🔴 상세를 연 뒤 «그 카드만» 찾아 「신규」를 걷어내기 위한 표식(markOpened)
    card.dataset.id = rid;
    /* ☑ 맨 앞 «고르기» 칸 — 여러 건 한꺼번에 상태를 바꾸기 위한 것.
       ⚠ 이 칸을 누르는 것은 «줄 열기»가 아니다 → 아래에서 클릭·키 이벤트를 반드시 멈춘다.
       ⚠ 낭독기에는 접수번호(없으면 사업명)로 «무엇을 고르는지» 밝힌다. */
    const pickName = r.receipt_no || r.benefit_name || "이 접수";
    /* ⚠ <span> 이 아니라 <label> 이다 — 체크상자는 보이는 크기가 20x20 이라 손가락 규격(44px)에
       모자란데, <input> 에는 ::after 가 «생기지 않아»(대체 요소) 투명 확장판을 못 붙인다.
       label 로 감싸면 그 44x44 판 어디를 눌러도 브라우저가 체크상자를 대신 눌러 준다(JS 불필요).
       ⚠ 보이는 체크상자 크기·칸 폭(26px)은 그대로다 — 확장판은 style.css .pick-wrap::after. */
    /* 🧪 둘러보기(게스트)에게는 «고르기 칸»을 아예 그리지 않는다 (2026-08-25 A-1).
       고르는 목적이 「일괄 상태 바꾸기」 하나뿐인데, 그 저장이 게스트에게는 반드시 실패한다.
       예전에는 20건을 고르고 확인창까지 다 지난 뒤에야 「20건 중 0건 성공」을 만났다 —
       되돌릴 수 없는 조작에 붙은 확인창을 «헛되이» 지나게 하는 것은 막다른 길이다.
       ⚠ 아래 `card.querySelector(".row-pick")` 는 이미 `if (chk)` 로 감싸여 있어 그대로 안전하다. */
    card.innerHTML = (guestSaveBlockedByServer() ? `` :
      `<label class="pick-wrap">` +
        `<input type="checkbox" class="row-pick" data-id="${esc(rid)}"` +
        ` aria-label="${esc(pickName)} 선택"${A_SEL.has(rid) ? " checked" : ""}></label>`) +
      `<div class="pcard-main">
        <!-- ⭐⭐ 배지 «차례» 규약 (2026-08-26 개정 · 세 앱 공통)
                (신규) → 상태 → (경과 — 신규가 붙었으면 생략) → (안내 공개중) → 분류(담당팀)
             ⭐ 2026-08-25 양호창님 — 「접수번호 배지가 과도하게 자리를 많이 차지한다. 제거해 줘」
                그래서 «목록 카드»에서 🧾 접수번호 배지(.rc-tag)를 뺐다.
                ⛔ 되살리지 마세요. 접수번호가 필요한 자리는 이미 셋 다 살아 있습니다 —
                   ① 접수 처리 창(openApplication) 맨 위 🧾 배지 · ② 검색창(접수번호로 찾기)
                   · ③ 카드 aria-label(낭독기가 「접수번호 …」로 읽는다).
             ⚠ 배지 줄은 «한 줄»로 못 박혀 있다(style.css .pcard-top{flex-wrap:nowrap}).
                좁은 폭에서 다 못 담으면 «맨 뒤»가 …로 줄어든다.
                그래서 뒤로 갈수록 «없어도 덜 아쉬운 것»을 둔다 —
                담당팀은 접수 처리 창과 title 속성에서 온전히 볼 수 있고,
                상태·경과는 목록에서 «그 자리에서» 판단해야 하는 값이라 앞에 둔다.
             ⛔ 담당팀을 앞으로 옮기지 마세요 — 그러면 「⏳ N일 경과」가 대신 잘립니다. -->
        <div class="pcard-top">
          ${isNew ? NEW_TAG_HTML : ""}
          <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
          ${(od && !isNew) ? `<span class="od-tag"><span aria-hidden="true">⏳</span> ${od}일 경과</span>` : ""}
          ${r.citizen_reply ? `<span class="cr-tag" title="시민 안내문 공개중"><span aria-hidden="true">💬</span> <span>시민 안내문 공개중</span></span>` : ""}
          ${r.team ? `<span class="cat-tag" title="${esc(r.team)}"><span>${esc(r.team)}</span></span>` : ""}
        </div>
        <!-- ⚠ title 속성 — 제목은 «두 줄»에서 …로 잘린다. 온전한 사업명을 여기에 남겨
             마우스를 올리거나 낭독기로 읽을 때 전문이 나오게 한다(2026-08-25). -->
        <div class="pcard-title" title="${esc(r.benefit_name || "")}">${esc(r.benefit_name || "(사업명 없음)")}</div>
        <div class="pcard-meta">
          <span><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}</span>
          ${r.phone ? `<span><span aria-hidden="true">📞</span> ${esc(r.phone)}</span>` : ""}
          <span><span aria-hidden="true">📍</span> ${esc(regionLabel(r.region))}</span>
          <span><span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))}</span>
        </div>
        <!-- ⭐ 처리메모 — «있고 없고»에 따라 카드가 19.5px 씩 달라지던 것을 막는다.
             없으면 빈 자리만 둔다(보이지 않고 낭독기도 읽지 않는다 · style.css .pcard-memo.is-empty).
             ⛔ 이 빈 칸을 지우지 마세요 — 지우면 카드 높이가 다시 갈립니다. -->
        ${r.memo ? `<div class="pcard-memo"><span aria-hidden="true">💬</span> ${esc(r.memo)}</div>`
                 : `<div class="pcard-memo is-empty" aria-hidden="true"></div>`}
      </div>`;
    const openIt = () => openApplication(r);
    card.onclick = (ev) => {
      // 고르기 칸(과 그 손가락 영역)에서 시작한 누름은 «줄 열기»가 아니다
      if (ev.target && ev.target.closest && ev.target.closest(".pick-wrap")) return;
      openIt();
    };
    card.addEventListener("keydown", (ev) => {
      if (ev.target !== card) return;                     // 체크상자의 Space 는 그쪽 몫
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    const chk = card.querySelector(".row-pick");
    if (chk) {
      chk.addEventListener("click", (ev) => ev.stopPropagation());
      chk.addEventListener("change", () => {
        if (chk.checked) A_SEL.add(rid); else A_SEL.delete(rid);
        renderBulkBar();
      });
    }
    applyJustChanged(card, r.id);      // 방금 상태를 바꾼 줄이면 «방금 변경» 배지 + 은은한 강조
    list.appendChild(card);
  });
  staggerCards(list);                  // 카드 순차 등장(최대 8장 지연)
  renderAPager(rows.length, pages);
}

// 신청 접수 페이지 이동 — 정책제안·사업목록과 동일한 접근성 규약(nav·aria-label·aria-current)
function renderAPager(total, pages) {
  const wrap = $("#aPager"); if (!wrap) return;
  wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    // ⚠ 쪽을 옮기면 «보이지 않는 건이 선택된 채» 남지 않도록 선택을 지운다(일괄 처리 사고 방지)
    if (dis) b.disabled = true; else b.onclick = () => { aPage = p; clearASel(); renderApplications(); };
    bar.appendChild(b);
  };
  mk("‹", aPage - 1, aPage <= 0, false, "이전 페이지");
  let s = Math.max(0, aPage - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === aPage, `${p + 1} 페이지`);
  mk("›", aPage + 1, aPage >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

async function openApplication(r) {
  /* 🔴 읽음 판정 «시점» — 상세를 연 «그 순간»(openProposal 과 같은 규약). 첫 줄에 둔다. */
  markOpened(RK_A, r, "#aList");
  $("#amTitle").textContent = "📥 신청 접수 처리";
  const st = r.status || "접수";
  const optHtml = A_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  $("#amBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
      ${overdueDays(r) ? `<span class="od-tag"><span aria-hidden="true">⏳</span> ${overdueDays(r)}일 경과</span>` : ""}
      <!-- 🧾 접수번호 «글자»는 그대로 둔다. 2026-08-25 에 없앤 것은 옆의 「📋 복사」 단추뿐이다
           (양호창님 「불필요해 보인다」 · 정책제안 모달과 «같이» 뺐다). 번호를 지우지 말 것. -->
      ${r.receipt_no ? `<span class="rc-tag"><span aria-hidden="true">🧾</span> ${esc(r.receipt_no)}</span>` : ""}
    </div>
    <!-- 🖨 인쇄 전용 안내 — 화면에는 보이지 않고 «종이에만» 찍힌다(style.css .print-only).
         개인정보가 종이로 나가는 순간이라 목적 외 이용을 못 박는다(개인정보보호법 §19). -->
    <p class="print-only print-note">※ 이 문서에는 개인정보가 포함되어 있습니다.
      담당 업무 목적으로만 사용하고, <b>목적 외 이용·제3자 제공을 금지</b>합니다.
      사용 후에는 지체 없이 파기하십시오.</p>
    <div class="field"><div class="field-label">사업명</div><div class="field-value">${esc(r.benefit_name || "")}</div></div>
    <div class="field"><div class="field-label">신청자</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}${r.phone ? ` · <span aria-hidden="true">📞</span> <a href="tel:${esc((r.phone || "").replace(/[^0-9+]/g, ""))}">${esc(r.phone)}</a>` : ""}</div></div>
    <!-- 📍 읍·면·동 — 시민앱이 신청서에서 «골라» 보낸 값(applications.region).
         옛 신청에는 없을 수 있어 그때는 「미기재」로 둔다(숨기면 왜 없는지 알 수 없다). -->
    <div class="field"><div class="field-label">읍·면·동</div><div class="field-value"><span aria-hidden="true">📍</span> ${esc(regionLabel(r.region))}${
      /* ⚠ REGION_READY 를 «반드시» 함께 본다. 목록(data.json)을 못 받은 상태에서는
         normalizeRegion() 이 무엇이든 "" 를 돌려주므로, 멀쩡한 「남원동」에도 경고가 붙는다
         (2026-08-20 실측에서 실제로 그랬다). 판정할 수 없을 때는 «아무 말도 하지 않는다». */
      (REGION_READY && String(r.region || "").trim() && !normalizeRegion(r.region))
        ? ` <span class="rg-warn">— 표준 읍·면·동이 아니어서 통계에서는 「${esc(REGION_UNKNOWN)}」로 셉니다</span>` : ""
    }</div></div>
    <div class="field"><div class="field-label">담당팀</div><div class="field-value">${esc(r.team || "-")}${r.manager_email ? ` · ${esc(r.manager_email)}` : ""}</div></div>
    <div class="field"><div class="field-label">문의사항</div><div class="pm-body-text">${esc(r.memo || "(없음)")}</div></div>
    <div class="field"><div class="field-label">신청일시</div><div class="field-value"><span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))}${r.source ? ` · ${esc(r.source)}` : ""}</div></div>
    <!-- 📎 시민이 신청할 때 낸 첨부파일 — supabase/신청첨부.sql 이 «적용된 뒤에만» 나타난다.
         적용 전(테이블 없음)·권한 없음·첨부 0건이면 이 칸은 통째로 감춘 채 나머지 기능은 그대로 돈다.
         ⚠ 이 파일들은 «비공개» submissions 버킷에 있다 — 공개 URL 이 아예 없고,
            열 때마다 5분짜리 서명 URL 을 새로 발급받는다. 링크를 복사해 두어도 곧 죽는다. -->
    <div class="field" id="amFilesField" hidden>
      <div class="field-label">📎 신청 첨부파일 <span class="req-note">(개인정보 — 여는 기록이 남습니다)</span></div>
      <p class="field-hint">누르면 새 창으로 내려받습니다. 내려받은 파일은 업무에 쓴 뒤 지워 주세요.</p>
      <ul class="forms-list" id="amFiles" aria-live="polite"></ul>
      <p class="forms-status" id="amFilesStatus" role="status" aria-live="polite"></p>
    </div>
    <div class="field">
      <label class="field-label" for="amStatus">처리 상태 변경</label>
      <select id="amStatus" class="st-select">${optHtml}</select>
    </div>
    <div class="field">
      <label class="field-label" for="amMemo"><span aria-hidden="true">📝</span> 처리메모(공무원 기록용 · 시민에게 보이지 않음)</label>
      <p id="amMemoHint" class="field-hint">부서 내부 기록입니다. 신청자 화면에는 나타나지 않습니다.</p>
      <textarea id="amMemo" class="form-textarea" aria-describedby="amMemoHint"
                placeholder="처리 경과·내부 판단을 기록하세요.">${esc(r.admin_memo || "")}</textarea>
    </div>
    <!-- 💬 시민 안내문 — 신청자가 「내 신청 현황」에서 «그대로» 읽는 글.
         내부 메모(admin_memo)와 «다른 칸·다른 색»으로 둔다. 절대 섞지 말 것. -->
    <div class="field citizen-field">
      <label class="field-label citizen-label" for="amReply"><span aria-hidden="true">💬</span> 시민 안내문 (신청자에게 공개)</label>
      <p id="amReplyWarn" class="citizen-warn"><span aria-hidden="true">⚠</span>
        이 내용은 <b>신청자에게 그대로 보입니다.</b> 내부 판단·개인정보는 위의 «처리메모»에 적어 주세요.
        한 번 공개한 글은 되돌릴 수 없습니다.</p>
      <!-- 💬 자주 쓰는 문장(상용구) — 누르면 아래 칸에 «덧붙는다». 저절로 저장되지 않는다.
           ★ 문구는 CITIZEN_REPLY_PRESETS 한 곳에만 있다(app.js 위쪽). 화면 코드는 손댈 필요 없다.
           ⚠ 넣은 뒤에도 «공개» 확인 창은 그대로 뜬다 — 상용구라고 검토를 건너뛰지 않는다. -->
      <div class="reply-presets" role="group" aria-label="자주 쓰는 안내문 넣기">
        <span class="reply-presets-cap">자주 쓰는 문장</span>
        ${CITIZEN_REPLY_PRESETS.map((p, i) =>
          `<button type="button" class="reply-preset" data-preset="${i}">${esc(p.label)}</button>`).join("")}
      </div>
      <textarea id="amReply" class="form-textarea" maxlength="300" aria-describedby="amReplyWarn amReplyLimit"
                placeholder="예) 서류 확인이 끝났습니다. 8월 25일까지 심사 결과를 문자로 안내드리겠습니다.">${esc(r.citizen_reply || "")}</textarea>
      <p id="amReplyLimit" class="field-hint">300자까지 쓸 수 있습니다. 안내에 필요한 내용만 간단히 적어 주세요.</p>
    </div>
    <!-- 규격서 §0 «한 화면 버튼 3개 상한» — 삭제·인쇄·저장 정확히 셋. 여기에 더 늘리지 말 것.
         ※ 둘러보기(게스트)는 «삭제·저장»이 빠져 「인쇄」 하나다(2026-08-25 A-1).
           빈 자리만 남기지 않도록 그 자리에 .guest-ro 안내 한 줄을 둔다. -->

    <div class="modal-actions">
      ${guestNoDelete() ? "" : `<button id="amDelete" class="nav-btn danger" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg><span>삭제</span></button>`}
      <button id="amPrint" class="nav-btn ghostish" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 9V4h10v5"/><path d="M7 18H5v-6h14v6h-2"/><path d="M7 14h10v6H7z"/></svg><span>인쇄</span></button>
      ${guestSaveBlockedByServer() ? `<p class="guest-ro"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2h.01"/></svg>둘러보기(테스트) 중에는 접수를 저장·삭제할 수 없습니다. 담당자 계정으로 로그인해 주세요.</p>`
        : `<button id="amSave" class="nav-btn" type="button"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4"/><path d="M8 20v-6h8v6"/></svg><span>저장</span></button>`}
    </div>`;

  // 📎 첨부 목록 — 있을 때만 나타난다. 어떤 이유로 실패해도 접수 처리 화면은 멀쩡해야 하므로
  //    기다리지 않고(await 없이) 띄우되, 남은 오류도 삼켜 «처리되지 않은 거부»가 나지 않게 한다.
  renderApplicationFiles(r).catch(() => {});

  // 💬 상용구 — 누르면 안내문 칸에 «덧붙는다»(이미 쓴 글을 지우지 않는다).
  //    300자를 넘게 되면 넣지 않고 그 사실을 알린다(칸의 상한을 몰래 넘기지 않는다).
  document.querySelectorAll("#amBody .reply-preset").forEach((b) => {
    b.onclick = () => {
      const p = CITIZEN_REPLY_PRESETS[Number(b.getAttribute("data-preset"))];
      const ta = $("#amReply");
      if (!p || !ta) return;
      const cur = (ta.value || "").trim();
      const next = cur ? (cur + "\n" + p.text) : p.text;
      if (next.length > 300) {
        announce(`이미 쓰신 글에 더하면 300자를 넘습니다(${next.length}자). 글을 줄인 뒤 다시 눌러 주세요.`);
        ta.focus();
        return;
      }
      ta.value = next;
      ta.focus();
      ta.setSelectionRange(next.length, next.length);
      announce(`«${p.label}» 문장을 넣었습니다. 내용을 확인한 뒤 저장해 주세요.`);
    };
  });

  // 🖨 인쇄 — 이 접수 «한 건»만 종이로. 화면의 다른 것은 인쇄되지 않는다(style.css @media print).
  //    ⚠ 개인정보가 종이로 나가므로, 인쇄물 맨 위에 목적 외 이용 금지 문구가 함께 찍힌다.
  const pr = $("#amPrint");
  if (pr) pr.onclick = () => {
    document.body.classList.add("printing-modal");
    const off = () => document.body.classList.remove("printing-modal");
    // onafterprint 를 못 받는 브라우저가 있어 시간제한으로도 한 번 더 되돌린다
    window.addEventListener("afterprint", off, { once: true });
    setTimeout(off, 4000);
    announce("인쇄 창을 엽니다. 이 접수 한 건만 인쇄됩니다.");
    try { window.print(); } catch (e) { off(); }
  };

  // 🔒 연타 방어(bindOnce) — 시민 안내문 «공개 확인창»이 두 번 뜨거나
  //    같은 접수에 update·감사기록이 두 번 나가지 않게 한다.
  bindOnce($("#amSave"), async () => {
    const newStatus = $("#amStatus").value;
    const memo = ($("#amMemo").value || "").trim();
    // 💬 시민 안내문 — 내부 메모와 «별도 필드»로 보낸다(절대 합치지 않는다).
    const reply = ($("#amReply").value || "").trim();
    const prevReply = (r.citizen_reply || "").trim();

    // ── 공개 전 확인 (2026-08-18, 🩷 security-privacy 지적) ───────────────
    //   왜: 삭제에는 확인창이 있는데 «공개»에는 없었다 — 확인 강도가 거꾸로다.
    //   삭제는 되돌릴 수 있지만, 공개는 신청자가 이미 읽었으면 회수할 수 없다.
    //   처리메모를 복사해 안내문 칸에 붙여넣는 실수가 클릭 한 번으로 시민 화면에 걸린다.
    //   → 안내문이 «새로 생기거나 달라졌을 때만» 확인한다(상태·메모만 고칠 때는 묻지 않는다).
    if (reply && reply !== prevReply) {
      if (reply.length > 300) {
        askAlert(`시민 안내문은 300자까지 쓸 수 있습니다.\n지금은 ${reply.length}자입니다. 줄여 주세요.`);
        $("#amReply").focus();
        return;
      }
      // 개인정보로 «보이는» 숫자 패턴이 있으면 한 번 더 묻는다(주민번호·휴대전화·계좌 형식).
      const RE_JUMIN = /\d{6}[- ]?\d{7}/;
      const RE_PHONE = /01\d[- ]?\d{3,4}[- ]?\d{4}/;
      const RE_ACCT  = /(?:^|[^0-9])\d{2,6}-\d{2,6}-\d{2,6}(?!\d)/;
      if (RE_JUMIN.test(reply) || RE_PHONE.test(reply) || RE_ACCT.test(reply)) {
        const okPii = await askConfirm({
          title: "개인정보로 보이는 숫자가 있습니다",
          body: "시민 안내문에 연락처 또는 주민등록번호로 보이는 숫자가 들어 있습니다.\n"
              + "이 글은 신청자에게 그대로 공개됩니다. 그래도 저장할까요?",
          cancelText: "다시 보기",
          okText: "그대로 저장"
        });
        if (!okPii) { $("#amReply").focus(); return; }
      }
      const okOpen = await askConfirm({
        title: "이 글을 신청자에게 공개할까요?",
        body: "아래 글이 신청자 화면에 「그대로」 보입니다.\n\n"
            + "────────────────\n" + reply + "\n────────────────\n\n"
            + "신청자 본인 외 다른 사람의 이름·연락처가 들어 있지는 않은지, 내부 판단이 섞이지는 않았는지 확인해 주세요.\n"
            + "한 번 공개하면 신청자가 이미 읽었을 수 있어 되돌릴 수 없습니다.",
        cancelText: "다시 보기",
        okText: "공개"
      });
      if (!okOpen) { $("#amReply").focus(); return; }
    }
    // 💬 시민 안내문은 «달라졌을 때만» 보낸다.
    //    같은 값을 다시 보내면 서버 쪽 감사기록(admin_audit)이 «직전 값»을 읽느라
    //    왕복이 한 번 더 늘고, 남길 일도 없는 저장에서 헛일을 한다.
    //    (상태·처리메모만 고치는 저장은 예전과 똑같이 왕복 1회다)
    const patch = { status: newStatus, admin_memo: memo || null };
    if (reply !== prevReply) patch.citizen_reply = reply || null;
    markSelfWrite();                  // 🤫 이 저장이 실시간으로 되돌아와도 소리는 내지 않는다
    /* 🔒 낙관적 잠금 — «내가 이 창을 열 때» 의 updated_at 을 함께 보낸다 (2026-08-25).
       두 담당자가 같은 접수를 열어 두고 차례로 저장하면 예전에는 나중 사람이
       앞사람의 처리·시민 안내문을 «말없이» 덮었다. 사업 수정(saveBenefit)이 이미
       쓰던 규약을 그대로 옮긴 것이다 — 안내문·새로고침도 같은 함수를 쓴다.
       ⚠ r 은 목록 캐시 행이라 r.updated_at 이 «창을 열 때의 값»이다. 그것이 바로 필요한 값이다. */
    let saved = null;
    try {
      saved = await SangjuApply.updateApplication(r.id, patch, r.updated_at);
    } catch (err) {
      const m = writeErrMsg(err, "저장");
      announce(m); askAlert(m); return;
    }
    if (saved && saved.kind === "conflict") {
      await announceSaveConflict("이 접수를", "#aModal", loadApplications);
      return;
    }
    closeModal($("#aModal"));
    markJustChanged(r.id);              // 다시 그릴 때 그 줄이 «방금 변경»으로 보이게
    const dt = doneText("저장했습니다");            // 🎉 「… · 오늘 N번째」
    showDoneCheck(dt);
    /* 🔒 접속기록(개인정보보호법 §29) — 「아직 안 남겼다」와 「남기지 못했다」는 다르다.
       시민 안내문 공개는 개인정보 처분이라 반드시 admin_audit 에 남아야 하는데,
       그 기록만 실패하는 일이 있다(표 미설치·권한·일시적 통신 장애).
       저장 자체는 이미 끝났으므로 «되돌리지도, 되풀이시키지도» 않고 사실만 알린다.
       ⚠ 일괄 상태 변경(applyBulkStatus 의 auditNote)·첨부(auditAttachment)와 같은 문구 규약. */
    const auditMissed = saved && saved._auditOk === false;
    announce((reply
      ? "신청 접수가 저장되었습니다. 시민 안내문은 신청자 화면에 그대로 공개됩니다."
      : "신청 접수가 저장되었습니다.") + dt.replace("저장했습니다", "")
      + (auditMissed ? " 다만 접속기록을 남기지 못했습니다." : ""));
    if (auditMissed) {
      askAlert("저장은 끝났습니다.\n\n"
        + "※ 이 저장의 접속기록(§29)을 남기지 못했습니다 — 시스템 담당자에게 알려 주세요.\n"
        + "다시 저장하실 필요는 없습니다.");
    }
    await loadApplications();
  });

  // 🔒 연타 방어(bindOnce) — 첨부 파기 → 접수 삭제 순서가 두 번 겹치지 않게.
  bindOnce($("#amDelete"), async () => {
    const ok = await askConfirm({
      title: "이 신청을 삭제할까요?",
      body: `접수번호 ${r.receipt_no || "-"} 신청을 지웁니다.\n첨부파일이 있으면 «먼저» 파기합니다 — 첨부를 다 지우지 못하면 접수도 지우지 않습니다.\n되돌릴 수 없습니다.`,
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    // 📎 ★ 순서가 «정해져 있다» (supabase/신청첨부.sql [7]·B-5).
    //    application_files 는 접수를 지우면 cascade 로 함께 사라진다. 그러면 storage_path 를
    //    «잃어버려» 창고(submissions 버킷)의 실제 파일을 지울 방법이 없어진다
    //    → 주인 없는 개인정보 파일이 남는다(개인정보보호법 §21 파기 의무 위반).
    //    그래서 «파일 먼저, 접수 나중». 이 순서를 바꾸지 마세요.
    //    ★ 그래서 첨부를 «다 지웠을 때만» 접수를 지운다. 하나라도 못 지웠으면 여기서 멈춘다
    //      — 접수를 남겨 두는 쪽은 언제든 다시 지울 수 있지만, 먼저 지우면 되돌릴 수 없다.
    //      (PC앱 cloud_sync.delete_application 과 «같은» 규약이다.)
    if (!(await purgeApplicationFiles(r))) return;
    try {
      await SangjuApply.deleteApplication(r.id);
    } catch (err) {
      const m = writeErrMsg(err, "삭제");
      announce(m); askAlert(m); return;
    }
    closeModal($("#aModal"));
    announce("신청이 삭제되었습니다.");
    await loadApplications();
  });

  openModal($("#aModal"));
}

/* ════════════════════════════════════════════════════════════════════════
   📎 시민 신청 첨부파일 열람 (접수 상세 안)
   ────────────────────────────────────────────────────────────────────────
   설계·규약 출처: supabase/신청첨부.sql 머리말 (B) 항목. 그대로 따른다.

   🔒 이 화면은 «개인정보 그 자체»를 다룬다.
      · 파일명("장애인등록증.jpg")만으로도 민감정보의 실마리가 된다.
      · 파일은 비공개(submissions) 버킷에 있고 공개 URL 이 아예 없다.
        열 때마다 5분짜리 서명 URL 을 새로 받는다 — 그 링크 자체가 «열쇠»다.
      · 여는 순간 admin_audit 에 기록을 남긴다(개인정보보호법 §29 접속기록).
        ⛔ 기록에 파일명·저장경로·서명 URL 을 남기지 않는다. 접수번호 + 확장자 + 건수만.
           (저장경로에는 통행증이 박혀 있어 로그에 남기면 그 자체가 자격증명 유출이다)

   🛡 방어 원칙 — 서버에 신청첨부.sql 이 «아직 적용되지 않았을 수 있다».
      테이블이 없거나(PGRST205) 권한이 없으면 첨부 칸을 «조용히 감춘 채» 넘어간다.
      접수 처리(상태 변경·메모·안내문)는 어떤 경우에도 멀쩡히 돌아가야 한다.

   ⛔ file_name 을 날것으로 innerHTML 에 넣지 마세요 — 시민이 «자기 기기에서 지은 이름»이라
      꺾쇠가 들어올 수 있고, 여기는 로그인 세션을 가진 화면이라 피해가 가장 큽니다.
      아래는 전부 esc() 를 거칩니다.
   ════════════════════════════════════════════════════════════════════════ */
const ATTACH_BUCKET = "submissions";
const ATTACH_URL_SEC = 300;          // 서명 URL 수명 5분. ⛔ 더 늘리지 마세요.

function afSetStatus(msg, isErr) {
  const box = $("#amFilesStatus");
  if (box) { box.textContent = msg || ""; box.classList.toggle("err", !!isErr); }
  if (msg) announce(msg);
}

/* 확장자만 뽑는다 — 감사기록(admin_audit)에 «파일명 대신» 남길 값.
   🩷 2026-08-25 자물쇠 — 「모양 검사」를 「닫힌 목록」으로 바꿨습니다.
   ⛔ 앞선 판(점 유무만 보기 / `^[a-z0-9]{1,6}$` 모양 검사)에는 구멍이 남습니다:
        "이름.1234" → 「1234」 · "메모.txt2" → 「txt2」
      점 뒤가 우연히 영숫자면 «시민이 지은 글자»가 그대로 기록에 실립니다.
      정규식은 「어떤 모양이 위험한가」를 계속 맞혀야 합니다 — 맞히는 일을 없앱니다.
   ⇒ 목록에서 «고르면» 출력이 아래 낱말 아니면 「기타」뿐이라,
      파일명에서 온 글자가 기록에 닿는 일이 «구조적으로» 불가능합니다.
   ★ 이 목록은 PC앱 audit_cloud.ATTACH_EXTS 와 «글자 그대로» 같아야 합니다
     — 두 앱 기록을 한 표로 대조하려면 같은 낱말을 써야 합니다.
   ★ 서버(supabase/신청첨부.sql:388)가 애초에 이 확장자들만 받으므로 잃는 것이 없습니다
     (2026-08-25 실측 — 실제 첨부 57건 전부 이 안에 듭니다. 「기타」로 떨어진 것 0건).
   ⚠ 이 함수는 목록 화면의 「PDF 파일」 표시에도 쓰입니다. 모르는 확장자는 이제
     「기타 파일」로 보입니다 — «의도된 변화»입니다. 파일명 전체는 그 옆에 그대로 보이므로
     정보 손실이 아닙니다.
   ⛔ 정규식으로 되돌리거나 목록을 넓히지 마세요. 목록을 한 글자라도 바꾸면 파이썬과 갈립니다. */
const ATTACH_EXTS = new Set([
  "hwp", "hwpx", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "heic", "zip", "txt",
]);

function attachExt(name) {
  const s = String(name || "");
  if (s.indexOf(".") < 0) return "기타";        // 점이 없으면 확장자가 아니라 «파일명 전체»다
  const e = s.slice(s.lastIndexOf(".") + 1).trim().toLowerCase();
  return ATTACH_EXTS.has(e) ? e : "기타";
}

/* 🔒 접속기록(개인정보보호법 §29) — 업무를 멈추지는 않지만 «조용히» 넘기지도 않는다.
   ⚠ 2026-08-20 확인 — supabase-js 의 insert 는 실패해도 «예외를 던지지 않는다».
      {data, error} 로 돌려줄 뿐이라, 예전의 try/catch 는 기록 실패를 한 번도 잡지 못했다.
      admin_audit 이 0행인데도 아무도 몰랐던 까닭이다. 반드시 res.error 를 본다.
   반환 true = 남겼다 / false = 남기지 못했다. 실패하면 «화면에 한 줄» 남긴다
        — 「아직 안 다뤘다」와 「기록이 실패했다」를 담당자가 구별할 수 있어야 한다.
   ⛔ 남기는 것은 접수번호 · 건수 · 확장자뿐. 파일명 · 저장경로 · 서명 URL 금지. */
async function auditAttachment(action, receiptNo, detail, result) {
  try {
    const res = await sb.from("admin_audit").insert({
      action: action,                    // VIEW_ATTACHMENT · DELETE_ATTACHMENT (영문 대문자 규약)
      target: String(receiptNo || "").slice(0, 60),   // ★ 접수번호만. 이름 · 연락처 금지
      target_type: "접수(공무원앱)",
      detail: String(detail || "").slice(0, 200),     // ★ 건수 · 확장자만. 파일명 · 경로 · URL 금지
      result: String(result || "성공").slice(0, 20),
    });
    if (res && res.error) throw res.error;
    return true;
  } catch (e) {
    console.warn("[첨부] 접속기록을 남기지 못했습니다:", e);
    const why = errKind(e) === "setup"
      ? "기록 표(admin_audit)가 아직 준비되지 않았습니다."
      : "기록 서버가 응답하지 않았습니다.";
    afSetStatus("⚠️ 이 작업의 접속기록(§29)을 남기지 못했습니다 — " + why
              + " 업무는 계속하셔도 되지만, 시스템 담당자에게 알려 주세요.", true);
    return false;
  }
}

/* 📎 접수 한 건의 첨부 목록을 읽는다.
   ★ «첨부 없음» 과 «못 읽음» 을 «반드시» 구분해 돌려준다 — 이 둘을 같게 다루면
     (예전처럼 실패에도 [] 를 돌려주면) 첨부가 있는데도 «없다» 고 판단해 한 건도 안 지운 채
     접수를 지우게 되고, 남은 파일을 찾을 단서가 통째로 사라진다.
   반환 {ok, files, kind, msg} — PC앱 cloud_sync.list_application_files 와 같은 계약.
     · ok:true, files:[]  → 첨부가 «없다»(또는 신청첨부.sql 미적용 = 지울 첨부가 없는 상태)
     · ok:false          → «확인하지 못했다». 파기 · 삭제를 시작하면 안 된다. */
async function listApplicationFiles(receiptNo) {
  const rc = String(receiptNo == null ? "" : receiptNo).trim();
  if (!rc) {
    return { ok: false, files: [], kind: "other",
             msg: "어떤 접수 건인지 알 수 없어 첨부를 불러오지 않았습니다." };
  }
  try {
    const res = await sb.from("application_files")
      .select("id,receipt_no,file_name,storage_path,size,content_type,created_at")
      .eq("receipt_no", rc)
      .order("created_at", { ascending: true });
    if (res && res.error) throw res.error;
    return { ok: true, files: (res && res.data) || [], kind: "", msg: "" };
  } catch (e) {
    const kind = errKind(e);
    if (kind === "setup") {
      // PGRST205(표 없음) = 아직 신청첨부.sql 미적용. 첨부를 «담을 곳» 자체가 없으므로
      // 지울 첨부도 없다 — PC앱 cloud_sync.delete_application 의 kind=="setup" 처리와 같다.
      console.warn("[첨부] 목록 표가 아직 없습니다(신청첨부.sql 미적용):", (e && e.message) || e);
      return { ok: true, files: [], kind: "setup", msg: "" };
    }
    console.warn("[첨부] 목록 조회 실패:", e);
    return { ok: false, files: [], kind: kind,
             msg: (e && e.message) || "첨부 목록을 읽지 못했습니다." };
  }
}

async function renderApplicationFiles(r) {
  const field = $("#amFilesField"), list = $("#amFiles");
  if (!field || !list) return;
  const listed = await listApplicationFiles(r && r.receipt_no);

  // ★ «못 읽음» 을 감추면 담당자는 «첨부가 없다» 고 믿는다. 모른다는 사실을 그대로 알린다.
  if (!listed.ok) {
    field.hidden = false;
    list.innerHTML = "";
    afSetStatus(listed.kind === "perm"
      ? "이 계정에는 첨부파일 목록을 볼 권한이 없습니다. 첨부가 있는지 «확인하지 못한» 상태입니다 — 시스템 담당자에게 계정 권한을 확인해 주세요."
      : "첨부파일 목록을 불러오지 못했습니다. 첨부가 있는지 «확인하지 못한» 상태입니다 — 잠시 뒤 이 창을 닫았다 다시 열어 보시고, 계속되면 시스템 담당자에게 알려 주세요.", true);
    return;
  }

  const rows = listed.files;
  if (!rows.length) { field.hidden = true; return; }   // 첨부 «없음» · 신청첨부.sql 미적용 → 조용히 감춘다
  field.hidden = false;
  afSetStatus("");
  list.innerHTML = rows.map((row) => {
    const nm = String(row.file_name || "첨부파일");
    const ext = attachExt(nm).toUpperCase();
    // ⚠ 전역 SangjuForms 를 «맨이름»으로 부르면 forms.js 가 없을 때 ReferenceError 로 화면이 죽는다
    const size = (window.SangjuForms && SangjuForms.formatSize) ? SangjuForms.formatSize(row.size) : "";
    const meta = (ext ? ext + " 파일" : "파일") + (size ? " · " + size : "");
    // ⚠ KWCAG 2.2 6.4.2 — 이 단추는 클릭 시 새 창을 미리 연다(아래 handler). 접근명에 알린다.
    return `<li class="forms-item" data-id="${esc(String(row.id))}">
        <span class="forms-item-main"><span class="forms-item-name">📄 ${esc(nm)}</span>
          <span class="forms-item-meta">${esc(meta)}</span></span>
        <button type="button" class="forms-open" aria-label="${esc(nm)} (${esc(meta)}) 내려받기, 새 창에서 열림">내려받기</button>
      </li>`;
  }).join("");
  const byId = {};
  rows.forEach((row) => { byId[String(row.id)] = row; });
  list.querySelectorAll(".forms-item").forEach((li) => {
    const row = byId[li.dataset.id];
    const btn = li.querySelector(".forms-open");
    if (!btn || !row) return;
    btn.onclick = async () => {
      // ★ 새 창은 «누른 그 순간» 미리 열어 둔다.
      //   서명 URL 을 받아 온 «뒤에» window.open 을 부르면 브라우저가 «사용자가 누른 결과»로
      //   보지 않아 팝업 차단에 걸린다(await 를 건너면 사용자 동작 표식이 풀린다).
      //   ⚠ 세 번째 인자에 "noopener" 를 주면 «창 핸들이 null 로» 돌아와 주소를 넣을 수 없다.
      //      그래서 열어 두고 opener 를 직접 끊는다(같은 효과).
      const win = window.open("", "_blank");
      if (win) { try { win.opener = null; } catch (_) { /* 브라우저가 막으면 그대로 둔다 */ } }
      btn.disabled = true;
      afSetStatus("파일을 여는 중…");
      try {
        const res = await sb.storage.from(ATTACH_BUCKET)
          .createSignedUrl(row.storage_path, ATTACH_URL_SEC, { download: row.file_name });
        if (res && res.error) throw res.error;
        const url = res && res.data && res.data.signedUrl;
        if (!url) throw new Error("파일 주소를 받지 못했습니다.");
        // 🔒 «여는 순간» 기록한다 — 개인정보에 접근했다는 사실 자체가 남아야 한다.
        //    기다리지 않고 창을 띄우되, 기록이 «실패하면» auditAttachment 가 아래 안내 위에
        //    경고 한 줄을 덮어써 알린다(먼저 성공 문구가 찍히고, 뒤이어 경고가 남는다).
        auditAttachment("VIEW_ATTACHMENT", row.receipt_no, `파일 1건(${attachExt(row.file_name)})`);
        if (win) {
          win.location.replace(url);
          afSetStatus("새 창에서 내려받습니다. 이 링크는 5분 뒤 만료됩니다.");
        } else {
          // 팝업이 막힌 경우 — 한 번 더 시도하고, 그래도 안 되면 «무엇을 해야 하는지» 알린다.
          const w2 = window.open(url, "_blank", "noopener");
          afSetStatus(w2 ? "새 창에서 내려받습니다. 이 링크는 5분 뒤 만료됩니다."
                         : "브라우저가 새 창을 막았습니다. 주소창 오른쪽의 «팝업 허용»을 켠 뒤 다시 눌러 주세요.", !w2);
        }
      } catch (e) {
        if (win) { try { win.close(); } catch (_) { /* 이미 닫혔으면 그만 */ } }
        const m = errKind(e) === "perm"
          ? "이 계정에는 첨부파일 열람 권한이 없습니다. 시스템 담당자에게 확인해 주세요."
          : ((e && e.message) || "파일을 열지 못했습니다.");
        afSetStatus(m, true);
      } finally {
        btn.disabled = false;
      }
    };
  });
}

/* 📎 접수 «삭제» 전에 첨부 실물부터 파기한다 (신청첨부.sql B-5).
   ───────────────────────────────────────────────────────────────────────
   ⚠ 반드시 접수 행을 지우기 «전»에 부를 것 — application_files 는 applications 를
      on delete cascade 로 참조한다. 접수를 먼저 지우면 첨부 목록이 «함께» 사라져
      storage_path 를 영영 잃고, 창고에 주인 없는 개인정보 파일이 남는다(§21 파기 의무).

   ★ 반환 true  = 다 지웠다(또는 지울 것이 없었다) → 접수를 지워도 된다.
      반환 false = 하나라도 못 지웠다 → «접수를 지우지 말 것».
      — 접수를 남겨 두는 쪽은 언제든 다시 지울 수 있다. 먼저 지우는 쪽은 되돌릴 수 없다.
      — 「시스템 담당자에게 파기를 요청하세요」 는 안내가 될 수 없다. 그 시점엔 경로를 이미
         잃어 담당자도 «무엇을» 지워야 할지 알 수 없기 때문이다.
      — PC앱 cloud_sync.delete_application · delete_submission_files_of 와 «같은» 규약이다.
         두 앱의 파기 규칙은 반드시 같아야 한다 — 한쪽만 바꾸지 말 것. */
async function purgeApplicationFiles(r) {
  const receiptNo = (r && r.receipt_no) || "";
  const listed = await listApplicationFiles(receiptNo);

  // ① 목록을 «못 읽었다» — 첨부가 있는지조차 모른다. 시작조차 하지 않는다.
  if (!listed.ok) {
    const logged = await auditAttachment("DELETE_ATTACHMENT", receiptNo,
                                         "첨부 목록 조회 실패 — 파기를 시작하지 않음", "실패");
    await askAlert("⚠️ 첨부파일 목록을 읽지 못해 «접수 삭제를 멈췄습니다».\n"
      + "첨부가 있는지 확인하지 못한 채 접수를 지우면, 남은 파일을 찾을 수 없게 됩니다.\n"
      + "잠시 뒤 다시 시도하거나 시스템 담당자에게 알려 주세요.\n"
      + `(접수번호 ${receiptNo || "-"})`
      + (logged ? "" : "\n\n※ 이 작업의 접속기록(§29)도 남기지 못했습니다 — 함께 알려 주세요."));
    return false;
  }

  const rows = listed.files;
  if (!rows.length) return true;          // 지울 첨부가 없다 = 성공(«없음» 은 실패가 아니다)

  // storage_path 가 비어 있으면 «무엇을 지울지» 알 수 없다 → 실패로 센다(PC앱과 같다).
  const paths = [];
  let failed = 0;
  rows.forEach((x) => {
    const p = String((x && x.storage_path) || "").trim();
    if (p) paths.push(p); else failed += 1;
  });

  if (paths.length) {
    try {
      const res = await sb.storage.from(ATTACH_BUCKET).remove(paths);
      // ⚠ «이미 없는 파일» 은 실패가 아니다 — 원하던 상태다. remove 는 그런 경로를 error 없이
      //    넘기므로 여기서는 error 만 실패로 본다(PC앱 delete_submission_file 의 404 규칙과 같다).
      //    이 규칙이 없으면 이미 지워진 파일 하나 때문에 접수를 «영영» 못 지우게 된다.
      if (res && res.error) throw res.error;
    } catch (e) {
      console.warn("[첨부] 파기 실패:", e);
      failed += paths.length;
    }
  }

  const total = rows.length;
  const logged = await auditAttachment("DELETE_ATTACHMENT", receiptNo,
      `파일 ${total}건 중 ${total - failed}건 파기(실패 ${failed}건)`, failed ? "실패" : "성공");
  const logNote = logged ? ""
    : "\n\n※ 이 작업의 접속기록(§29)도 남기지 못했습니다 — 함께 알려 주세요.";

  // ② 하나라도 못 지웠으면 접수를 «그대로 둔다».
  if (failed) {
    await askAlert(`⚠️ 첨부파일 ${failed}건을 지우지 못해 «접수 삭제를 멈췄습니다».\n`
      + "지금 접수를 지우면 남은 파일을 찾을 수 없게 됩니다.\n"
      + "잠시 뒤 다시 시도하거나 시스템 담당자에게 알려 주세요.\n"
      + `(접수번호 ${receiptNo || "-"})` + logNote);
    return false;
  }
  // 파기는 끝났으나 «기록» 이 안 남았다면 그 사실은 반드시 알린다(§29).
  if (!logged) {
    await askAlert(`첨부파일 ${total}건을 파기했습니다. 이어서 접수를 삭제합니다.` + logNote);
  }
  return true;
}
