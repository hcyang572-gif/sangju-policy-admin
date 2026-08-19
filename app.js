// 상주시 정책 플랫폼 — 클라우드(Supabase) 사업 관리
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// 📎 서식 스토리지 공용 헬퍼(forms.js)가 같은 클라이언트를 쓰도록 넘겨준다(중복 생성 방지).
if (window.SangjuForms) SangjuForms.useClient(sb);
// 📥 신청 접수 공용 헬퍼(apply_client.js)도 같은 클라이언트를 쓰도록 넘겨준다.
if (window.SangjuApply) SangjuApply.useClient(sb);
const $ = (s) => document.querySelector(s);

let ALL = [], CATS = [], SELCATS = new Set(), sortKey = "seq", page = 0;
const PAGE = 12;
// ⛔ IS_GUEST(로그인 없이 입장)는 2026-08-04 «영구 제거»했습니다.
//    이 앱은 시민 신청자의 개인정보(성명·연락처·문의내용)를 다루므로
//    «세션이 있어야만» 화면에 들어갈 수 있습니다. 우회 플래그를 되살리지 마세요.
let LOGGING_OUT = false;   // 로그아웃 진행 중(onAuthStateChange 중복 처리 방지)
// 🔑 비밀번호 변경 진행 중. 이 동안에는 «본인 확인용 재로그인»과 «비밀번호 저장» 때문에
//    세션이 잠깐 갈릴 수 있어, 세션 만료 안내(showSessionExpired)가 끼어들지 않도록 막는다.
//    (LOGGING_OUT 과 같은 자리에서 선언 — onAuthStateChange 콜백이 먼저 실행돼도 TDZ 오류가 없도록)
let PW_CHANGING = false;

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
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
  modal._sjNav = true;
  // 첫 포커스: 닫기 버튼이 아닌 첫 입력요소 우선, 없으면 첫 포커스 대상
  const focusables = [...modal.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
  const target = focusables.find((n) => !n.classList.contains("modal-close")) || focusables[0];
  if (target) setTimeout(() => target.focus(), 30);
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
  if (_lastFocus && typeof _lastFocus.focus === "function") { try { _lastFocus.focus(); } catch (e) {} }
  _lastFocus = null;
  // ★ 모달이 열려 있는 동안 도착한 알림은 rtBusy() 때문에 띠가 «숨겨진 채» 카운트만 쌓인다.
  //   닫을 때 다시 계산해 주지 않으면 다음 실시간 이벤트가 올 때까지 알림이 영영 안 뜬다.
  try { syncRtBanners(); } catch (e) { /* 초기화 전이면 무시 */ }
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
   ══════════════════════════════════════════════════════════════════════ */
const DIRTY_GUARD_IDS = new Set(["modal", "aModal", "pModal"]);   // 읽기 전용 모달(방침·버전)은 제외
// 🔑 비밀번호 모달은 제외 — 닫을 때 비밀번호 칸을 «반드시» 비우는 보안 규약이 있어 되물을 게 없다.

function formSnapshot(modal) {
  if (!modal || !DIRTY_GUARD_IDS.has(modal.id)) return null;
  const out = [];
  modal.querySelectorAll("input, textarea, select").forEach((n) => {
    if (n.type === "password") { out.push(""); return; }
    if (n.type === "checkbox" || n.type === "radio") out.push(n.checked ? "1" : "0");
    else out.push(String(n.value == null ? "" : n.value));
  });
  return JSON.stringify(out);   // 칸 경계가 섞이지 않도록 배열 그대로 직렬화
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
  const m = document.getElementById("askModal");
  // 안전망 — 마크업이 없는(캐시된 구버전 HTML) 화면에서도 «묻기»는 살아 있어야 한다.
  if (!m) return Promise.resolve(window.confirm((opts.title || "") + "\n\n" + (opts.body || "")));
  if (ASK_RESOLVE) return Promise.resolve(false);   // 이미 떠 있으면 중복으로 열지 않는다
  const t = $("#askTitle").querySelector("span") || $("#askTitle");
  t.textContent = opts.title || "확인";
  $("#askBody").textContent = opts.body || "";
  $("#askKeep").textContent = opts.cancelText || "취소";
  $("#askGo").textContent = opts.okText || "확인";
  ASK_LASTFOCUS = document.activeElement;
  m.classList.remove("hidden");
  return new Promise((resolve) => {
    ASK_RESOLVE = resolve;
    setTimeout(() => { const b = $("#askKeep"); if (b) b.focus(); }, 30);   // 초점 = 안전한 쪽
  });
}
// 확인 창을 닫으며 결과를 넘긴다. Esc·바깥클릭·두 단추가 모두 여기로 모인다.
function askDone(v) {
  const r = ASK_RESOLVE;
  ASK_RESOLVE = null;
  const m = document.getElementById("askModal");
  if (m) m.classList.add("hidden");
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
  if (session) { showApp(); return; }
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
  if (warnIn <= 0) { showSessionExpiring(); return; }
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
// 현재 주소 복사(클립보드 API 실패 시 임시 input 폴백)
async function copyCurrentUrl() {
  const url = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else { throw new Error("no clipboard api"); }
    announce("주소를 복사했어요. 브라우저에 붙여넣어 열어주세요.");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); announce("주소를 복사했어요."); }
    catch (e2) { announce("주소 복사에 실패했어요. 주소창을 길게 눌러 복사해 주세요."); }
    document.body.removeChild(ta);
  }
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
  showApp();
}

async function showApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
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

// 화면을 처음 상태로 되돌리고 연다(직전 입력·안내가 남지 않게).
function openChangePw() {
  ["#pwCur", "#pwNew", "#pwChk"].forEach((s) => { const n = $(s); if (n) n.value = ""; });
  const rule = $("#pwNewRule");
  if (rule) { rule.textContent = ""; rule.className = "pw-rule"; }
  pwSetMsg("");
  const btn = $("#pwSave");
  if (btn) { btn.disabled = false; btn.textContent = "🔑 변경하기"; btn.onclick = submitChangePw; }
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
  const label = btn.textContent;
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
    location.reload();                  // 초기 상태(로그인 화면)로 — 열람하던 데이터도 사라짐
  };
  // C2: 닫기/바깥클릭은 closeModal로 통일(포커스 복귀). Esc는 _trapKeydown이 일괄 처리.
  $("#mClose").onclick = () => requestCloseModal($("#modal"));
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") requestCloseModal($("#modal")); });

  // 🔑 비밀번호 변경 모달 (열기/닫기/바깥클릭) — Esc는 공통 트랩에서 처리
  const pwm = $("#pwModal");
  if (pwm) {
    $("#btnChangePw").onclick = openChangePw;
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
      if (open) { const f = acctPop.querySelector("button"); if (f) f.focus(); }
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
function rtAutoApply(kind, fn) {
  clearTimeout(_rtJobs[kind]);
  _rtJobs[kind] = setTimeout(() => {
    if (rtBusy()) { syncRtBanners(); return; }
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
    .subscribe((status) => setRealtimeDot(status === "SUBSCRIBED"));
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
  box.textContent = ALL.length ? `사업 ${ALL.length}건 · ${state}` : `사업 관리 (${state})`;
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
function renderBSummary() {
  const box = $("#bSummary"); if (!box) return;
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
  if (sortKey === "name") rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  // 🕘 최신순 — «마지막으로 고친 시각» 내림차순. 방금 등록·수정한 사업이 맨 위로 온다.
  //    (기본순 seq 는 엑셀 순번 그대로라, 새로 올린 사업이 목록 한복판에 묻혀 찾기 어려웠다)
  else if (sortKey === "new") rows.sort((a, b) => benefitTime(b) - benefitTime(a));
  $("#count").textContent = `총 ${rows.length}건`;
  const list = $("#list");
  if (!rows.length) { list.innerHTML = '<div class="empty">조건에 맞는 사업이 없습니다.</div>'; $("#pager").innerHTML = ""; return; }
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
    card.innerHTML = `<div class="card-main">
        <div class="card-title">📂 ${esc(r.name)}</div>
        <div class="card-desc">${esc(content.slice(0, 90)) || "—"}</div>
        ${note ? `<div class="card-note">${NOTE_LABEL} · ${esc(note)}</div>` : ""}
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

   ⚠⚠ 단일 출처 주의 — 아래 표는 PC `config.py` 의 POLICY_CATEGORIES 를 옮긴 «사본»이다.
      정적 웹앱이라 파이썬을 부를 방법이 없어 어쩔 수 없이 둔 사본이며,
      config.py 를 고치면 «여기도 같이» 고쳐야 한다(한쪽만 고치면 PC·시민앱과 분류가 갈린다).
      ⛔ 여기서 카테고리 «이름»을 새로 지어내지 마세요 — 이름이 한 글자라도 다르면
         시민앱 분야 버튼과 안 맞아 그 사업이 검색에서 사라집니다.
      ⛔ config.py 의 CATEGORY_OVERRIDES(사업명별 교체 보정맵 100여 건)는 옮기지 않았다.
         그것은 «엑셀에서 들어오는 기존 사업명»을 바로잡는 표라, 담당자가 손으로 올리는
         새 사업에는 해당이 없다. 필요하면 담당자가 칩으로 직접 고르면 된다.
   ════════════════════════════════════════════════════════════════════════ */
const POLICY_CATEGORIES = {
  "👶 임신·출산": ["임신", "임산부", "임신부", "출산", "출생", "난임", "산모", "산후"],
  "🧸 영유아·보육": ["영유아", "아동", "어린이", "보육", "유아", "어린이집", "유치원", "아이돌봄", "영유아돌봄", "아동돌봄"],
  "📚 청소년·교육": ["청소년", "학생", "대학생", "초등", "중등", "고등학교", "고등학생", "학교", "장학", "교육비", "교육활동비", "방과후", "학용품", "교복", "수업료",
               "입학준비", "돌봄교실", "진로", "체험학습"],
  "🎓 청년": ["청년", "20대", "30대", "대학생", "대학교", "취준생"],
  "👩 여성": ["여성", "경력단절", "여성기업"],
  "👴 노인·어르신": ["노인", "어르신", "65세 이상", "고령", "경로", "치매", "장수사진"],
  "♿ 장애인": ["장애", "장애인", "발달장애", "중증장애"],
  "👨‍👩‍👧‍👦 다자녀·가족": ["다자녀", "셋째", "둘째", "세자녀", "다둥이", "가족", "입양"],
  "👤 1인가구": ["1인가구", "1인 가구", "독거"],
  "👩‍👦 한부모·조손": ["한부모", "조손", "미혼모", "미혼부"],
  "🌏 다문화·외국인": ["다문화", "결혼이주", "외국인", "이민자", "귀화"],
  "💰 저소득·기초수급": ["기초생활", "기초수급", "수급자", "수급권자", "차상위", "저소득", "빈곤", "생계", "소득재산", "소득,재산", "소득·재산"],
  "🏥 건강·의료": ["의료", "질환", "환자", "입원", "보건", "건강", "수술", "요양", "의료급여", "예방접종", "접종", "진료비", "검사비", "재활", "치료비", "약제비",
              "구강"],
  "🌾 농림축수산업": ["농업", "축산", "임업", "어업", "농가", "농민", "농산물", "영농", "농지", "농기계", "농장"],
  "🏡 귀농·귀촌": ["귀농", "귀촌", "귀어", "귀산촌", "농촌 정착", "농촌정착", "전원생활", "농촌 이주", "농촌이주"],
  "🏪 소상공인·기업": ["소상공인", "중소기업", "스타트업", "소기업", "창업", "시장상인", "상인회", "전통시장", "자영업", "가맹점", "점포", "기업체", "공장", "제조업"],
  "💼 일자리·구직": ["구직", "실업", "실직", "근로자", "재직자", "일자리", "고용", "취업", "노동", "자격증", "직업훈련", "채용", "면접", "인턴", "구인"],
  "🏠 주거·부동산": ["무주택", "전세", "월세", "주거", "주택", "임대", "집수리", "집 마련", "이사비", "이사지원", "이주비", "기숙사", "빈집", "슬레이트",
               "화장실 개선"],
  "🎖️ 보훈·유공자": ["유공자", "보훈", "참전", "제대군인", "독립유공자"],
  "🎨 문화·체육·관광": ["문화예술", "문화행사", "문화시설", "체육", "관광", "예술", "도서관", "스포츠", "여행", "공연", "전시", "평생학습", "문화강좌", "문화누리"],
  "🚌 교통·안전": ["교통", "안전", "자동차", "대중교통", "자전거", "재난", "피해", "방범", "폭염", "한파", "차량", "운전면허", "횡단보도", "방재", "소방"],
  "🌱 환경·에너지": ["환경", "에너지", "탄소", "친환경", "쓰레기", "폐기물", "종량제", "폐건전지", "종이팩", "페트병", "재활용", "분리배출", "자원순환", "전기차",
               "수소차", "경유차", "폐차", "태양광", "도시가스", "새활용", "그린리모델링"],
  "🎉 행사·축제·공연": ["행사", "축제", "공연", "전시", "박람회", "페스티벌", "체험행사"],
  "📢 모집·공모": ["모집", "공모", "공모전", "선발", "참가자", "참가 신청"],
};
const CATEGORY_KEYS = Object.keys(POLICY_CATEGORIES);

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
  CATEGORY_NOISE_RES.forEach((pair) => { text = text.replace(pair[0], pair[1]); });
  const extra = new Set();
  let m;
  MEDIAN_INCOME_RE.lastIndex = 0;
  while ((m = MEDIAN_INCOME_RE.exec(text)) !== null) {
    const pct = parseInt(m[1], 10);
    if (!isNaN(pct) && pct <= 100) { extra.add("💰 저소득·기초수급"); break; }
  }
  return CATEGORY_KEYS.filter((cat) =>
    extra.has(cat) || POLICY_CATEGORIES[cat].some((k) => text.indexOf(k) !== -1));
}

// 편집 모달에서 «지금 골라 둔» 분야. 모달을 열 때마다 새로 채운다.
let EDIT_CATS = new Set();

// 칩으로 보여 줄 분야 목록 — 기본 26종 + «이미 붙어 있는데 목록에 없는» 것.
//   왜 더하나: 목록에 없는 분야를 그냥 버리면, 그 사업을 한 번 수정하는 것만으로
//   시민앱에서 그 분야로 찾던 길이 «조용히» 끊긴다. 모르는 값도 보여 주고 지키게 한다.
function editCatKeys() {
  const extra = [...EDIT_CATS, ...CATS].filter((c) => c && CATEGORY_KEYS.indexOf(c) === -1);
  return CATEGORY_KEYS.concat([...new Set(extra)].sort());
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
  const btn = retryId ? `<button id="${retryId}" class="err-retry" type="button">🔄 다시 시도</button>` : "";
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

function openEdit(r) {
  $("#mTitle").textContent = r ? "✏ 사업 수정" : "➕ 새 사업 추가";
  let html = "";
  editFields().forEach(([label, key, multi, hint, notice]) => {
    const v = r ? (r[key] || "") : "";
    // C8: field-label → <label for> 로 input/textarea id와 연결
    const fid = `f_${key}`, hid = hint ? `h_${key}` : "";
    const aria = hint ? ` aria-describedby="${hid}"` : "";
    html += `<div class="field${notice ? " notice-field" : ""}">` +
      `<label class="field-label" for="${fid}">${label}</label>` +
      (hint ? `<p class="field-hint" id="${hid}">${esc(hint)}</p>` : ``) +
      (multi ? `<textarea id="${fid}" class="form-textarea" data-k="${key}"${aria}>${esc(v)}</textarea>`
             : `<input id="${fid}" class="form-input" data-k="${key}"${aria} value="${esc(v)}">`) + `</div>`;
  });
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
        <button type="button" id="editCatAuto" class="top-btn ghost">🔄 자동 분류로 채우기</button>
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
  html += `<div class="modal-actions"><button id="mSave" class="top-btn solid">💾 저장</button>` +
    (r ? `<button id="mDel" class="top-btn danger">🗑 삭제</button>` : ``) + `</div>`;
  // 📎 필요서류 서식 — 저장된 사업(r)은 «바로 등록», 새 사업은 «저장 시 함께 올림».
  //    새 사업에서 곧바로 올릴 수 없는 이유: 서식은 benefit_key(= 공백 뺀 사업명)로 이어지는데,
  //    사업명은 저장 버튼을 누르는 순간까지 얼마든지 바뀐다. 먼저 올리면 «옛 이름»에 붙어
  //    영영 찾을 수 없는 파일이 된다. → 목록에 담아 뒀다가 저장이 성공한 «뒤에» 올린다.
  if (window.SangjuForms) {
    html += `<div class="forms-section" id="formsSection">
      <div class="field-label">📎 필요서류 서식</div>
      <p class="field-hint">시민이 상세 화면에서 내려받을 서식 파일입니다. 허용: hwp·hwpx·pdf·doc(x)·xls(x)·ppt(x)·jpg·png·zip·txt · 최대 10MB.${
        r ? "" : "<br>새 사업은 <b>저장한 뒤에</b> 자동으로 함께 올라갑니다(사업명이 정해져야 파일을 이을 수 있습니다)."}</p>
      <ul class="forms-list" id="formsList" aria-live="polite"><li class="forms-empty">${r ? "불러오는 중…" : "아직 고른 서식이 없습니다."}</li></ul>
      <div class="forms-upload">
        <input type="file" id="formsFile" class="forms-file"
          accept=".hwp,.hwpx,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.txt"
          aria-label="등록할 서식 파일 선택">
        <button type="button" id="formsUpload" class="top-btn solid">${r ? "⬆ 서식 등록" : "➕ 목록에 담기"}</button>
      </div>
      <p class="forms-status" id="formsStatus" role="status" aria-live="polite"></p>
    </div>`;
  }
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

  $("#mSave").onclick = async () => {
    const saveBtn = $("#mSave");
    const obj = {};
    document.querySelectorAll("#mBody [data-k]").forEach((e) => { obj[e.dataset.k] = e.value; });
    if (!(obj.name || "").trim()) { announce("사업명을 입력하세요."); alert("사업명을 입력하세요."); const nm = $("#f_name"); if (nm) nm.focus(); return; }
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
      if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
      if (!data || !data.length) {
        announce("다른 담당자가 먼저 수정했습니다. 새로고침합니다.");
        alert("⚠️ 다른 담당자가 먼저 이 사업을 수정했습니다.\n최신 내용으로 새로고침하니, 다시 확인 후 수정해 주세요.");
        closeModal($("#modal"));
        await loadBenefits();
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
      if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
      // 📎 「저장 시 함께 올림」으로 담아 둔 서식을 «지금» 올린다(사업명이 확정된 뒤).
      //    ⚠ 여기서 실패해도 사업 저장은 이미 끝났다 — 되돌리지 않고 «무엇이 안 올라갔는지»만 알린다.
      const saved = (data && data[0]) || { name: obj.name };
      await uploadPendingForms(saved);
    }
    closeModal($("#modal"));
    showDoneCheck("저장했습니다");
    announce("저장되었습니다.");
    await loadBenefits();
  }
  if (r) $("#mDel").onclick = async () => {
    // 되돌릴 수 없는 삭제 — 초점은 «취소»에 놓인다(askConfirm 규약).
    const ok = await askConfirm({
      title: "이 사업을 삭제할까요?",
      body: "삭제하면 시민 화면에서도 사라집니다.",
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    const res = await sb.from("benefits").delete().eq("id", r.id);
    if (res.error) { announce(writeErrMsg(res.error, "삭제")); alert(writeErrMsg(res.error, "삭제")); return; }
    closeModal($("#modal"));
    announce("삭제되었습니다.");
    await loadBenefits();
  };
  PENDING_FORMS = [];                       // 「저장 시 함께 올림」 목록은 모달을 열 때마다 비운다
  if (window.SangjuForms) initFormsSection(r);
  openModal($("#modal"));
}

/* ── 📎 필요서류 서식 등록/삭제 (편집 모달 내부) ─────────────────────
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
    const url = String(row.public_url || "");
    const nameHtml = url
      ? `<a class="forms-item-name" href="${esc(url)}" target="_blank" rel="noopener noreferrer">📄 ${esc(nm)}</a>`
      : `<span class="forms-item-name">📄 ${esc(nm)}</span>`;
    return `<li class="forms-item" data-id="${esc(String(row.id))}">
        <span class="forms-item-main">${nameHtml}<span class="forms-item-meta">${esc(meta)}</span></span>
        <button type="button" class="forms-del" aria-label="${esc(nm)} 서식 삭제">🗑 삭제</button>
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
        fSetStatus(m, true); alert(m);
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
        <button type="button" class="forms-del" aria-label="${esc(f.name)} 목록에서 빼기">🗑 빼기</button>
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
    alert(m);
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
    if (bad) { fSetStatus(bad, true); alert(bad); return; }
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
      fSetStatus(m, true); alert(m);
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
const REPLY_REQUIRED = new Set(["반영", "불채택"]); // 전환 시 답변/사유 필수
let PALL = [], PCATS = [], P_SELCAT = new Set(), P_STATUS = "전체";
let pSort = "new", pPage = 0, P_LOADED = false;
let P_REPORTS = {}; // proposal_id -> 신고 건수
// 첫 화면(루트) 탭 = 신청 접수. index.html 의 .tab-btn.on / 보이는 섹션과 «반드시» 같아야
// 뒤로가기가 엉뚱한 탭으로 가지 않는다.
let pCurrentTab = "applications";

function bindProposalsUI() {
  // 실시간 알림 띠의 «새로고침» — 목록 갱신은 오직 이 클릭으로만 일어난다
  const rtb = $("#rtBtn"); if (rtb) rtb.onclick = () => { RT_PENDING = 0; syncRtBanners(); loadBenefits(); };
  const prtb = $("#pRtBtn"); if (prtb) prtb.onclick = () => { PRT_PENDING = 0; syncRtBanners(); loadProposals(); };
  const artb = $("#aRtBtn"); if (artb) artb.onclick = () => { ART_PENDING = 0; syncRtBanners(); loadApplications(); };

  // 탭: 클릭 + 좌우/Home/End 화살표 이동(WAI-ARIA tablist 표준 조작).
  // PC앱(webui)과 같은 규약 — 탭바는 Tab 키 «한 번»으로 진입하고(로빙 tabindex),
  // 그 안에서는 화살표로 이동한다. 마우스 없이도 탭을 모두 쓸 수 있게 하는 것이 목적.
  const WHICH = ["applications", "benefits", "proposals"];
  const TABS = [$("#tabApplications"), $("#tabBenefits"), $("#tabProposals")];
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
  // 탭 3종: 신청 접수 · 사업 관리 · 정책제안 관리. 선택된 하나만 보이고 나머지는 숨긴다.
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
  const { data, error } = await sb.from("proposals").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showLoadError("#pList", error, "pListRetry", loadProposals);
    return;
  }
  PALL = data || [];
  PRT_PENDING = 0; syncRtBanners();    // 새로 불러왔으니 «밀린 알림»도 지운다
  PCATS = [...new Set(PALL.map((r) => r.category).filter(Boolean))].sort();
  P_LOADED = true;
  await loadReportCounts();
  renderPSummary();
  renderPStatusChips();
  renderPCatChips();
  renderProposals();
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

function subscribeProposalsRealtime() {
  sb.channel("proposals-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "proposals" },
        () => { if (P_LOADED) { PRT_PENDING += 1; syncRtBanners(); rtAutoApply("proposals", loadProposals); } })
    .subscribe();
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
      const blob = `${r.title || ""} ${r.body || ""} ${r.author_nick || ""} ${r.region || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  if (pSort === "like") rows.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  else rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#pCount").textContent = `총 ${rows.length}건`;
  const list = $("#pList");
  if (!rows.length) { list.innerHTML = '<div class="empty">조건에 맞는 제안이 없습니다.</div>'; $("#pPager").innerHTML = ""; return; }

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
    const aLabel = [
      `상태 ${st}`,
      r.category ? `분야 ${r.category}` : "",
      r.is_hidden ? "블라인드 처리됨" : "",
      reps ? `신고 ${reps}건` : "",
      `제목 ${r.title || ""}`,
    ].filter(Boolean).join(", ") + " — 검토 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    card.innerHTML = `<div class="pcard-main">
        <div class="pcard-top">
          <span class="st-badge st-${esc(st)}">${esc(st)}</span>
          ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ""}
          ${r.is_hidden ? `<span class="hide-tag"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
          ${reps ? `<span class="report-tag"><span aria-hidden="true">🚩</span> 신고 ${reps}</span>` : ""}
        </div>
        <div class="pcard-title">${esc(r.title)}</div>
        <div class="pcard-meta">
          <span class="like-tag"><span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}</span>
          <span><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(r.region) : ""}</span>
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

async function openProposal(r) {
  $("#pmTitle").textContent = "🗳 정책제안 검토";
  const st = r.status || "접수";
  const reps = P_REPORTS[r.id] || 0;
  const optHtml = P_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  $("#pmBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge st-${esc(st)}">${esc(st)}</span>
      ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ""}
      ${r.is_hidden ? `<span class="hide-tag"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
    </div>
    <div class="field"><div class="field-label">제목</div><div class="field-value">${esc(r.title)}</div></div>
    <div class="field"><div class="field-label">작성</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(r.region) : ""} · <span aria-hidden="true">🗓</span> ${esc(fmtDate(r.created_at))} · <span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}</div></div>
    <div class="field"><div class="field-label">내용</div><div class="pm-body-text">${esc(r.body || "")}</div></div>
    ${reps ? `<div class="field"><div class="field-label"><span aria-hidden="true">🚩</span> 신고 ${reps}건</div><div id="pmReports" class="pm-reports" role="status" aria-live="polite">불러오는 중…</div></div>` : ""}
    <div class="field">
      <label class="field-label" for="pmStatus">진행 상태 변경</label>
      <select id="pmStatus" class="st-select">${optHtml}</select>
    </div>
    <div class="field">
      <label class="field-label" for="pmReply"><span aria-hidden="true">💬</span> 담당부서 답변 / 사유 <span class="req-note">(반영·불채택 전환 시 필수)</span></label>
      <textarea id="pmReply" class="form-textarea" placeholder="시민에게 공개되는 공식 답변·사유를 입력하세요.">${esc(r.admin_reply || "")}</textarea>
    </div>
    <div class="field">
      <label class="toggle-line"><input type="checkbox" id="pmHidden"${r.is_hidden ? " checked" : ""}> <span aria-hidden="true">🚫</span> 블라인드(부적절 글 숨김) — 체크 시 시민에게 안 보임</label>
    </div>
    <div class="modal-actions">
      <button id="pmSave" class="nav-btn">💾 저장</button>
    </div>`;

  if (reps) loadReportDetail(r.id);

  $("#pmSave").onclick = async () => {
    const newStatus = $("#pmStatus").value;
    const reply = ($("#pmReply").value || "").trim();
    const isHidden = $("#pmHidden").checked;
    // 반영·불채택 전환 시 답변 필수
    if (REPLY_REQUIRED.has(newStatus) && !reply) {
      const m = `'${newStatus}' 상태로 변경하려면 담당부서 답변/사유를 반드시 입력해야 합니다.`;
      announce(m); alert(m);
      $("#pmReply").focus();
      return;
    }
    const patch = {
      status: newStatus,
      admin_reply: reply || null,
      is_hidden: isHidden,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("proposals").update(patch).eq("id", r.id);
    if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
    closeModal($("#pModal"));
    markJustChanged(r.id);
    showDoneCheck("저장했습니다");
    announce("정책제안이 저장되었습니다.");
    await loadProposals();
  };

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
   메일(Web3Forms→PC 자동접수) 경로와 «독립» — 이 모듈은 클라우드 접수만 다룬다.
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

function bindApplicationsUI() {
  const s = $("#aSearch");
  if (s) s.addEventListener("input", debounce(() => { aPage = 0; renderApplications(); }, 300));
  const c = $("#amClose"); if (c) c.onclick = () => requestCloseModal($("#aModal"));
  const m = $("#aModal");
  if (m) m.addEventListener("click", (e) => { if (e.target.id === "aModal") requestCloseModal($("#aModal")); });
  // Esc·포커스 트랩은 공통 _trapKeydown 이 처리(중복 등록 없음)
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
  A_LOADED = true;
  ART_PENDING = 0; syncRtBanners();   // 새로 불러왔으니 «밀린 알림»도 지운다
  renderAStatusChips();
  renderApplications();
}

function subscribeApplicationsRealtime() {
  // 시민앱에서 신청하면 즉시 여기로 온다 → 화면을 갈아엎지 않고 «N건» 알림 띠만 올린다.
  if (!window.SangjuApply) return;
  SangjuApply.subscribeApplications(() => {
    if (A_LOADED) { ART_PENDING += 1; syncRtBanners(); rtAutoApply("applications", loadApplications); }
  });
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
    c.onclick = () => { A_STATUS = st; aPage = 0; renderAStatusChips(); renderApplications(); };
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

function renderApplications() {
  const list = $("#aList"); if (!list) return;
  const q = ($("#aSearch") ? $("#aSearch").value : "").trim().toLowerCase();
  let rows = AALL.filter((r) => {
    const rst = r.status || "접수";
    if (A_STATUS !== "전체" && rst !== A_STATUS) return false;
    if (q) {
      const blob = `${r.benefit_name || ""} ${r.applicant_name || ""} ${r.phone || ""} ${r.receipt_no || ""} ${r.team || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  // 최신순(신청일시 내림차순) — listApplications 가 이미 정렬하지만 필터 후에도 유지
  rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#aCount").textContent = `총 ${rows.length}건`;
  if (!rows.length) {
    // 빈 화면에도 «다음 행동»을 알려 준다(규격서 0절).
    //   · 「전체」인데 0건 = 아직 접수 자체가 없는 것 → 기다리면 된다고 알린다.
    //   · 상태 칩을 좁혀서 0건 = 조건을 넓히면 된다고 알린다.
    list.innerHTML = A_STATUS === "전체"
      ? '<div class="empty">아직 들어온 신청이 없습니다. 시민이 신청하면 이 자리에 바로 나타납니다.</div>'
      : `<div class="empty">«${esc(A_STATUS)}» 상태인 신청이 없습니다. 위 «전체»를 누르면 모든 접수를 볼 수 있습니다.</div>`;
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
    const card = el("div", "pcard");
    // 키보드 접근: role=button + Enter/Space. 상태·사업명·신청자를 접근명에 포함(색 의존 금지).
    const aLabel = [
      `상태 ${st}`,
      `사업 ${r.benefit_name || ""}`,
      `신청자 ${r.applicant_name || ""}`,
      r.receipt_no ? `접수번호 ${r.receipt_no}` : "",
      r.citizen_reply ? "시민 안내문 공개중" : "",
    ].filter(Boolean).join(", ") + " — 접수 처리 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    card.innerHTML = `<div class="pcard-main">
        <div class="pcard-top">
          <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
          ${r.team ? `<span class="cat-tag">${esc(r.team)}</span>` : ""}
          ${r.receipt_no ? `<span class="rc-tag"><span aria-hidden="true">🧾</span> ${esc(r.receipt_no)}</span>` : ""}
          ${r.citizen_reply ? `<span class="cr-tag"><span aria-hidden="true">💬</span> 시민 안내문 공개중</span>` : ""}
        </div>
        <div class="pcard-title">${esc(r.benefit_name || "(사업명 없음)")}</div>
        <div class="pcard-meta">
          <span><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}</span>
          ${r.phone ? `<span><span aria-hidden="true">📞</span> ${esc(r.phone)}</span>` : ""}
          <span><span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))}</span>
        </div>
        ${r.memo ? `<div class="pcard-memo"><span aria-hidden="true">💬</span> ${esc(r.memo)}</div>` : ""}
      </div>`;
    const openIt = () => openApplication(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
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
    if (dis) b.disabled = true; else b.onclick = () => { aPage = p; renderApplications(); };
    bar.appendChild(b);
  };
  mk("‹", aPage - 1, aPage <= 0, false, "이전 페이지");
  let s = Math.max(0, aPage - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === aPage, `${p + 1} 페이지`);
  mk("›", aPage + 1, aPage >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

async function openApplication(r) {
  $("#amTitle").textContent = "📥 신청 접수 처리";
  const st = r.status || "접수";
  const optHtml = A_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  $("#amBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
      ${r.receipt_no ? `<span class="rc-tag"><span aria-hidden="true">🧾</span> ${esc(r.receipt_no)}</span>` : ""}
    </div>
    <div class="field"><div class="field-label">사업명</div><div class="field-value">${esc(r.benefit_name || "")}</div></div>
    <div class="field"><div class="field-label">신청자</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}${r.phone ? ` · <span aria-hidden="true">📞</span> <a href="tel:${esc((r.phone || "").replace(/[^0-9+]/g, ""))}">${esc(r.phone)}</a>` : ""}</div></div>
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
      <textarea id="amReply" class="form-textarea" maxlength="300" aria-describedby="amReplyWarn amReplyLimit"
                placeholder="예) 서류 확인이 끝났습니다. 8월 25일까지 심사 결과를 문자로 안내드리겠습니다.">${esc(r.citizen_reply || "")}</textarea>
      <p id="amReplyLimit" class="field-hint">300자까지 쓸 수 있습니다. 안내에 필요한 내용만 간단히 적어 주세요.</p>
    </div>
    <div class="modal-actions">
      <button id="amDelete" class="nav-btn danger" type="button">🗑 삭제</button>
      <button id="amSave" class="nav-btn" type="button">💾 저장</button>
    </div>`;

  // 📎 첨부 목록 — 있을 때만 나타난다. 어떤 이유로 실패해도 접수 처리 화면은 멀쩡해야 하므로
  //    기다리지 않고(await 없이) 띄우되, 남은 오류도 삼켜 «처리되지 않은 거부»가 나지 않게 한다.
  renderApplicationFiles(r).catch(() => {});

  $("#amSave").onclick = async () => {
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
        alert(`시민 안내문은 300자까지 쓸 수 있습니다.\n지금은 ${reply.length}자입니다. 줄여 주세요.`);
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
    try {
      await SangjuApply.updateApplication(r.id, patch);
    } catch (err) {
      const m = writeErrMsg(err, "저장");
      announce(m); alert(m); return;
    }
    closeModal($("#aModal"));
    markJustChanged(r.id);              // 다시 그릴 때 그 줄이 «방금 변경»으로 보이게
    showDoneCheck("저장했습니다");
    announce(reply
      ? "신청 접수가 저장되었습니다. 시민 안내문은 신청자 화면에 그대로 공개됩니다."
      : "신청 접수가 저장되었습니다.");
    await loadApplications();
  };

  $("#amDelete").onclick = async () => {
    const ok = await askConfirm({
      title: "이 신청을 삭제할까요?",
      body: `접수번호 ${r.receipt_no || "-"} 신청을 지웁니다.\n첨부파일이 있으면 함께 파기됩니다.\n되돌릴 수 없습니다.`,
      cancelText: "취소",
      okText: "삭제"
    });
    if (!ok) return;
    // 📎 ★ 순서가 «정해져 있다» (supabase/신청첨부.sql [7]·B-5).
    //    application_files 는 접수를 지우면 cascade 로 함께 사라진다. 그러면 storage_path 를
    //    «잃어버려» 창고(submissions 버킷)의 실제 파일을 지울 방법이 없어진다
    //    → 주인 없는 개인정보 파일이 남는다(개인정보보호법 §21 파기 의무 위반).
    //    그래서 «파일 먼저, 접수 나중». 이 순서를 바꾸지 마세요.
    await purgeApplicationFiles(r);
    try {
      await SangjuApply.deleteApplication(r.id);
    } catch (err) {
      const m = writeErrMsg(err, "삭제");
      announce(m); alert(m); return;
    }
    closeModal($("#aModal"));
    announce("신청이 삭제되었습니다.");
    await loadApplications();
  };

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

// 확장자만 뽑는다(감사기록에 «파일명 대신» 남길 값)
function attachExt(name) {
  const e = String(name || "").split(".").pop();
  return (e && e.length <= 6) ? e.toLowerCase() : "기타";
}

// 🔒 접속기록 — 실패해도 업무를 멈추지 않는다(PC앱 access_log.py 와 같은 원칙).
async function auditAttachment(action, receiptNo, detail) {
  try {
    await sb.from("admin_audit").insert({
      action: action,                    // VIEW_ATTACHMENT · DELETE_ATTACHMENT (영문 대문자 규약)
      target: receiptNo || "",           // ★ 접수번호만. 이름·연락처 금지
      target_type: "접수(공무원앱)",
      detail: detail || "",              // ★ 건수·확장자만. 파일명·경로·URL 금지
      result: "성공",
    });
  } catch (e) { /* 기록 실패는 조용히 넘어간다 */ }
}

// 접수 한 건의 첨부 목록을 읽는다. 못 읽으면 «빈 배열»(원인은 콘솔에만) — 화면은 감춘다.
async function listApplicationFiles(receiptNo) {
  if (!receiptNo) return [];
  try {
    const res = await sb.from("application_files")
      .select("id,receipt_no,file_name,storage_path,size,content_type,created_at")
      .eq("receipt_no", receiptNo)
      .order("created_at", { ascending: true });
    if (res.error) {
      // PGRST205(테이블 없음) = 아직 신청첨부.sql 미적용. 정상 상황으로 취급한다.
      console.warn("[첨부] 목록 조회 생략:", res.error.message || res.error);
      return [];
    }
    return res.data || [];
  } catch (e) {
    console.warn("[첨부] 목록 조회 실패:", e);
    return [];
  }
}

async function renderApplicationFiles(r) {
  const field = $("#amFilesField"), list = $("#amFiles");
  if (!field || !list) return;
  const rows = await listApplicationFiles(r && r.receipt_no);
  if (!rows.length) { field.hidden = true; return; }   // 첨부 없음·미적용·권한없음 → 조용히 감춘다
  field.hidden = false;
  list.innerHTML = rows.map((row) => {
    const nm = String(row.file_name || "첨부파일");
    const ext = attachExt(nm).toUpperCase();
    // ⚠ 전역 SangjuForms 를 «맨이름»으로 부르면 forms.js 가 없을 때 ReferenceError 로 화면이 죽는다
    const size = (window.SangjuForms && SangjuForms.formatSize) ? SangjuForms.formatSize(row.size) : "";
    const meta = (ext ? ext + " 파일" : "파일") + (size ? " · " + size : "");
    return `<li class="forms-item" data-id="${esc(String(row.id))}">
        <span class="forms-item-main"><span class="forms-item-name">📄 ${esc(nm)}</span>
          <span class="forms-item-meta">${esc(meta)}</span></span>
        <button type="button" class="forms-open" aria-label="${esc(nm)} 내려받기">내려받기</button>
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
   ⚠ 반드시 접수 행을 지우기 «전»에 부를 것 — 접수를 먼저 지우면 cascade 로 목록이 사라져
      storage_path 를 잃고, 창고에 주인 없는 개인정보 파일이 남는다(§21 파기 의무).
   ⚠ 실패해도 삭제 자체는 막지 않는다. 다만 «남은 파일이 있다»는 사실은 담당자에게 알린다. */
async function purgeApplicationFiles(r) {
  const receiptNo = r && r.receipt_no;
  const rows = await listApplicationFiles(receiptNo);
  if (!rows.length) return;
  const paths = rows.map((x) => x.storage_path).filter(Boolean);
  let failed = 0;
  try {
    const res = await sb.storage.from(ATTACH_BUCKET).remove(paths);
    if (res && res.error) failed = paths.length;
  } catch (e) { failed = paths.length; }
  auditAttachment("DELETE_ATTACHMENT", receiptNo, `파일 ${paths.length}건 파기(실패 ${failed}건)`);
  if (failed) {
    alert(`⚠️ 첨부파일 ${failed}건을 저장소에서 지우지 못했습니다.\n`
        + `접수는 그대로 삭제합니다만, 남은 파일은 시스템 담당자에게 파기를 요청해 주세요.\n`
        + `(접수번호 ${receiptNo || "-"})`);
  }
}
