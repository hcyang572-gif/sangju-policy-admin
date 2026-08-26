// ════════════════════════════════════════════════════════════════════════
//  신청 접수 공용 헬퍼 (SangjuApply) — 「앱 직접 접수(실시간)」 ②단계
//  규약 출처: _workspace/신청접수_클라이언트_규약.md  (🟢 data-engineer)
//  백엔드: supabase/applications.sql (테이블·RLS·Realtime, 양호창님이 대시보드 실행)
//
//  ⚠ 세 앱(cloudui·모바일웹·webui) 공통. 이 파일은 «byte-identical» 로 각 앱에 둔다.
//     규칙(매칭키·접수번호·insert 페이로드·상태값)을 바꾸면 규약문서 + SQL 주석 +
//     세 앱의 apply_client.js 를 «동시에» 갱신하고 검수 담당에게 알린다.
//
//  노출: window.SangjuApply = {
//    useClient, setGuestMode, isGuestMode, benefitKey, genReceiptNo,
//    submitApplication, listApplications, updateApplication, deleteApplication,
//    subscribeApplications, errKind, TABLE, STATUSES, DEMO_RPC
//  }
//
//  ⚠ 2026-08-25 — 이 사본(공무원앱)에만 «둘러보기 분기»가 들어갔습니다.
//     setGuestMode(true) 이면 listApplications 가 applications 표를 «읽지 않고»
//     demo_applications() 예시 10건을 읽습니다. 시민앱에는 listApplications 자체가
//     없고, PC앱은 파이썬 통로로 읽으므로 이 분기가 필요하지 않습니다.
//     → webui/apply_client.js 와 이 대목이 다른 것이 «정상»입니다.
//
//  방어 원칙: applications.sql 이 아직 실행 안 됐으면(테이블 없음·PGRST205)
//    · listApplications 는 «원인 있는 오류» 를 throw → 공무원앱이 안내(showLoadError)
//    · submitApplication 실패는 throw → 시민앱이 «접수되지 않았습니다»로 안내한다.
//      ⚠ 2026-08-24 이후 시민앱의 신청 메일 발송이 «없어졌다» — 이 통로가 «유일한» 접수 경로다.
//    · subscribeApplications 는 실패해도 조용히 무시(앱 무손상)
//  → 어떤 경우에도 앱의 다른 기능(사업목록·정책제안)은 멀쩡해야 한다.
//
//  ⚠ 상태값은 «접수 / 심사중 / 승인 / 반려» 4값(PC config.APPLICATION_STATUSES 와 동일).
// ════════════════════════════════════════════════════════════════════════
window.SangjuApply = (function () {
  "use strict";

  var TABLE = "applications";
  // PC config.APPLICATION_STATUSES 와 «반드시» 동일한 4값. SQL CHECK 제약과도 일치.
  var STATUSES = ["접수", "심사중", "승인", "반려"];

  // ── Supabase 클라이언트 (지연 초기화) ──────────────────────────────
  // 앱이 이미 만든 클라이언트를 useClient(sb) 로 넘기면 그걸 쓰고,
  // 아니면 window / 전역 const 의 URL·anon key 로 직접 만든다(forms.js 와 동일 패턴).
  var _sb = null;
  function useClient(c) { if (c) _sb = c; }
  function client() {
    if (_sb) return _sb;
    try {
      var url =
        (typeof window !== "undefined" && window.SUPABASE_URL) ||
        (typeof SUPABASE_URL !== "undefined" && SUPABASE_URL) || "";
      var key =
        (typeof window !== "undefined" && window.SUPABASE_ANON_KEY) ||
        (typeof SUPABASE_ANON_KEY !== "undefined" && SUPABASE_ANON_KEY) || "";
      if (!window.supabase || !url || !key) return null;
      _sb = window.supabase.createClient(url, key);
      return _sb;
    } catch (e) {
      console.warn("[신청접수] Supabase 초기화 실패:", e);
      return null;
    }
  }

  // ── 매칭 키 — forms.js benefitKey 와 «값이 같아야» 함 ──
  //   «공백을 모두 제거한 사업명». ★ 절대 정책번호를 쓰지 말 것 (2026-08-04 확정)
  //   이미 쌓인 benefit_key 가 전부 사업명 기준이라, 바꾸면 기존 서식·접수 연결이 끊긴다.
  //   cloud benefits 는 {name}, 모바일 data.json 은 {사업명} — 둘 다 읽음.
  function benefitKey(b) {
    b = b || {};
    var nm = b.name != null ? b.name : (b.사업명 != null ? b.사업명 : "");
    return String(nm).replace(/\s+/g, "");
  }

  // ── 접수번호 — PC(applications_io) 포맷 'YYYYMMDD-HHMMSS-NN' (KST 가정) ──
  //   단일 사업 신청이면 -01, 한 제출에서 N개면 -01,-02… 비우면 서버 트리거가 폴백.
  function genReceiptNo(idx) {
    idx = idx || 1;
    var d = new Date();                              // 사용자 브라우저 로컬(KST 가정)
    function p(n, w) { w = w || 2; return String(n).padStart(w, "0"); }
    var base = "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
             + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return base + "-" + p(idx);
  }

  // 서버가 관리하는 필드는 클라가 절대 넣지 않는다(RLS with check 위반 방지).
  //   status·admin_memo·created_at·updated_at·id 를 방어적으로 제거.
  //   receipt_no 가 비어 있으면 클라에서 채운다(서버 트리거는 안전망).
  function _clean(payload) {
    var out = {};
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
    }
    delete out.status;
    delete out.admin_memo;
    delete out.created_at;
    delete out.updated_at;
    delete out.id;
    if (!out.receipt_no || String(out.receipt_no).trim() === "") {
      out.receipt_no = genReceiptNo(1);
    }
    return out;
  }

  // ── (미사용) 신청 INSERT — 이 앱에서는 «아무도 부르지 않는다» ────────────
  //   공무원앱/PC앱은 신청을 «접수»할 뿐 «제출»하지 않는다. 시민앱과 파일을 맞춰
  //   두려고 남겨 둔 함수다. 실패는 throw → 호출부가 안내.
  //
  //  ⛔⛔ 이 함수를 시민앱(모바일웹/apply_client.js)으로 «그대로» 옮기지 마세요.
  //     아래 .select().single() 은 서버에서 `INSERT … RETURNING` 이 된다.
  //     PostgreSQL 은 RETURNING 이 붙는 순간 INSERT 권한뿐 아니라 그 행의
  //     «SELECT 정책»까지 함께 요구한다. applications 는 이름·연락처가 든
  //     개인정보 표라 익명(anon)에게 SELECT 정책이 «없는 것이 정상»이므로,
  //     시민앱에서 이 모양으로 부르면 저장이 통째로 거부된다.
  //     (2026-08-18 실제 장애. 2026-08-20 재실측: RETURNING 없이 201 / 붙이면 401 42501)
  //     ⚠ 그때 나오는 문구가 하필 "new row violates row-level security policy" 라
  //       «INSERT 정책이 없다»로 오인하기 쉽다 — 그 함정에 빠지지 말 것.
  //     ⛔ 해결책으로 «익명 SELECT 정책을 여는» 방법은 금지다(🩷 자물쇠 확정).
  //       RETURNING 을 통과시키는 SELECT 정책은 보통의 조회도 함께 통과시켜,
  //       다른 시민의 이름·연락처·문의내용이 누구에게나 열린다.
  //     → 시민앱 쪽 올바른 모양: 모바일웹/apply_client.js 의 submitApplication 참조.
  //   ※ 이 앱은 공무원이 로그인한 «authenticated» 로 돌기 때문에 RETURNING 이 통한다.
  //     로그인 «전»에 부르면 익명이 되어 똑같이 401 이 난다.
  async function submitApplication(payload) {
    var sb = client();
    if (!sb) throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    var row = _clean(payload || {});
    var res = await sb.from(TABLE).insert(row).select().single();
    if (res.error) throw res.error;
    return res.data;
  }

  /* ══════════════════════════════════════════════════════════════════════
     🧪 둘러보기(게스트) — «진짜 신청 자료를 아예 읽지 않는다» (2026-08-25)
     ─────────────────────────────────────────────────────────────────────
     지금까지 「로그인 없이 둘러보기」는 아래 listApplications 를 그대로 타서
     applications 표를 «익명으로» 읽고 있었다. 그것이 되는 까닭은 단 하나 —
     supabase/테스트모드_익명조회_260821.sql 이 그 표를 익명에게 통째로 열어 두었기
     때문이다. 그 문에는 이름·연락처·문의내용·조회코드·처리메모가 다 들어 있다.
     ⇒ 실제 시민 신청을 받기 «전»에 그 문은 반드시 닫힌다
       (supabase/테스트모드_되돌리기_260824.sql). 닫히는 순간 둘러보기는 401 로 깨진다.

     그래서 둘러보기는 «표»가 아니라 «지어낸 예시 10건»을 본다.
       supabase/둘러보기_예시자료_260825.sql 의 demo_applications() —
       select ... from 이 한 줄도 없는 values 목록이라, 표에 무엇이 들어오든
       이 통로로는 «구조적으로» 샐 수가 없다.

     ⛔ 이 분기를 «로그인한 공무원»에게 적용하지 마세요. 공무원은 진짜 표를 봐야 합니다.
     ⛔ 게스트 쪽에 select(TABLE) 을 되살리지 마세요 — 문을 닫는 순간 깨집니다.
     ⚠ 예시 함수가 «아직 DB 에 없을 수 있다»(2026-08-25 현재 미실행). 그때는
       throw 하지 «않고» 빈 목록을 돌려준다 → 화면은 오류판이 아니라 «빈 상태 안내»가 뜬다.
       (게스트에게 붉은 오류를 보이는 것은 사실도 아니고 할 수 있는 일도 없다)
     ══════════════════════════════════════════════════════════════════════ */
  var DEMO_RPC = "demo_applications";
  var _guest = false;
  function setGuestMode(on) { _guest = (on === true); }
  function isGuestMode() { return _guest; }

  async function _listDemo(sb) {
    var res = null;
    try { res = await sb.rpc(DEMO_RPC); }
    catch (e) { res = { error: e }; }
    if (!res || res.error) {
      // 아직 안 심겼거나(PGRST202·404) 권한이 없어도 «조용히» 빈 목록.
      console.warn("[둘러보기] 예시 자료를 불러오지 못했습니다(빈 목록으로 진행):",
                   res && res.error);
      return [];
    }
    var rows = res.data;
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    // 아래 진짜 조회와 «같은 기준»으로 취소건을 거른다(예시에는 없지만 규칙을 갈라 두지 않는다)
    return rows.filter(function (r) { return !(r && r.canceled_at); });
  }

  // ── 공무원 조회 — 최신순 전체. 실패는 throw(호출부가 원인별 안내) ──
  async function listApplications() {
    var sb = client();
    if (!sb) return [];
    if (_guest) return await _listDemo(sb);
    /* ⛔ 아래 select("*") 를 «칸 목록»으로 좁히지 마세요 (2026-08-25 판단).
       ㉠ 여기는 로그인한 공무원(authenticated)만 지나갑니다 — 게스트는 위에서 갈라졌습니다.
       ㉡ 칸 이름을 적어 두면, 그 SQL 이 아직 안 돌아간 환경에서 «없는 칸» 하나로
          42703 이 나 목록이 통째로 죽습니다(바로 아래 canceled_at 주석과 같은 사연). */
    var res = await sb.from(TABLE).select("*").order("created_at", { ascending: false });
    if (res.error) throw res.error;
    // 🗑 시민이 스스로 취소한 접수는 «없는 것»으로 본다 (2026-08-21)
    //    supabase/신청취소_260821.sql — applications.canceled_at 이 채워지면 취소된 건.
    //    행 자체는 남겨 둔다(감사기록·복구용). 시민앱·PC앱도 같은 기준으로 거른다.
    //    ⚠ 서버 쿼리(.is("canceled_at", null))로 거르지 «않는» 이유: 그 SQL 을 아직
    //      실행하지 않은 환경에서는 컬럼이 없어 42703 으로 목록 전체가 죽는다.
    //      여기서 걸러 두면 컬럼이 있든 없든 목록은 언제나 뜬다.
    return (res.data || []).filter(function (r) { return !(r && r.canceled_at); });
  }

  // ── 공무원 상태변경 · 처리메모 · 시민 안내문 — patch = {status?, admin_memo?, citizen_reply?} ──
  //   허용 필드만 추린다. updated_at 은 서버 트리거가 갱신(클라가 넣지 않음).
  //   ⚠ admin_memo(내부 기록)와 citizen_reply(신청자에게 그대로 보임)는 «다른 칸»이다.
  //      절대 한쪽 값을 다른 쪽에 복사하거나 합치지 말 것 — 내부 메모가 시민에게 새어 나간다.
  //      citizen_reply 는 시민앱이 check_application_status(조회코드) 로 읽어 화면에 띄운다.
  // 🔒 「시민 안내문 공개」 감사기록 — supabase/application_status_2.sql 의 admin_audit
  //    ⛔ 본문은 절대 보내지 않는다. 누가·언제는 서버가 채운다(actor_uid=auth.uid()).
  //    ⛔ 기록 실패로 업무(저장)를 멈추지 않는다 — PC앱 access_log.py 와 같은 원칙.
  //
  //  ⭐ 반환 true = 남겼다(또는 남길 것이 없었다) / false = 남기지 못했다 (2026-08-25 B-6)
  //     예전에는 `catch (e) { /* 조용히 */ }` 로 «통째로» 삼켜, admin_audit 이 0행인데도
  //     아무도 몰랐다. 같은 앱의 auditAttachment·auditBulkStatus 는 2026-08-20 에 이미
  //     화면에 알리도록 고쳤는데 이 한 곳만 옛 방식으로 남아 있었다.
  //  ⚠ supabase-js 의 insert 는 실패해도 «예외를 던지지 않는다» — {data,error} 로 돌려줄 뿐이다.
  //     그래서 try/catch 만으로는 실패를 «한 번도» 잡지 못한다. 반드시 res.error 를 본다.
  async function _auditReply(sb, receiptNo, prevReply, newReply) {
    var was = String(prevReply || "").trim(), now = String(newReply || "").trim();
    if (was === now) return true;                  // 같은 값 재저장은 남기지 «않는 것이 정상»
    var detail = !now ? "안내문 공개 취소(내용 지움)"
               : was  ? ("공개중인 안내문 수정(" + now.length + "자)")
                      : ("안내문 신규 공개(" + now.length + "자)");
    try {
      var res = await sb.from("admin_audit").insert({
        action: "PUBLISH_CITIZEN_REPLY",
        target: receiptNo || "",                   // ★ 접수번호만. 이름·연락처 금지
        target_type: "접수(공무원앱)",
        detail: detail,                            // ★ 길이만. 본문 금지
        result: "성공"
      });
      if (res && res.error) throw res.error;
      return true;
    } catch (e) {
      // 업무(저장)는 이미 끝났다 — 멈추지 않되, «조용히»도 넘어가지 않는다.
      // 호출부(updateApplication → app.js)가 화면에 한 줄로 알린다.
      try { console.warn("[감사기록] 시민 안내문 공개 기록을 남기지 못했습니다:", e); } catch (e2) {}
      return false;
    }
  }

  /* ⭐ 낙관적 잠금(optimistic lock) — 2026-08-25
       세 번째 인자 expectUpdatedAt 을 주면 «내가 화면을 연 그 순간의 값»일 때만 저장한다.
       두 담당자가 같은 접수를 열어 두고 차례로 저장하면, 예전에는 나중 사람이 앞사람의
       처리·시민 안내문을 «말없이» 덮었다(PC앱이 방금 남긴 처리도 마찬가지였다).
     ★ 새로 설계한 것이 아니라 «같은 앱 안에 이미 있던» 사업 수정의 규약을 그대로 옮긴 것이다
       (app.js saveBenefit 의 .eq("id", …).eq("updated_at", …) → 0행이면 충돌).
     반환 —
       · 성공  : 저장된 행(예전과 같다). 비열거 속성 _auditOk 가 얹혀 온다.
       · 충돌  : { ok:false, kind:"conflict" }   ← 행에는 kind 가 없으므로 구별된다.
     ⚠ expectUpdatedAt 을 «주지 않으면» 예전처럼 조건 없이 저장한다.
        일괄 상태 변경(applyBulkStatus)이 일부러 그 길로 부른다 — 여러 건을 훑는 작업에서
        조건을 걸면 남이 건드린 한 건 때문에 20건이 통째로 멈춘다(PC앱도 같은 판단).
     ⚠ updated_at 은 «서버 트리거»(trg_applications_updated)가 채운다. 클라이언트가 넣으면
        조건으로 쓸 값을 스스로 덮어 잠금이 성립하지 않는다 — 절대 patch 에 넣지 말 것. */
  async function updateApplication(id, patch, expectUpdatedAt) {
    var sb = client();
    if (!sb) throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    patch = patch || {};
    var upd = {};
    if (patch.status !== undefined) upd.status = patch.status;
    if (patch.admin_memo !== undefined) upd.admin_memo = patch.admin_memo;
    if (patch.citizen_reply !== undefined) upd.citizen_reply = patch.citizen_reply;
    // ① 바꾸기 «직전» 값을 먼저 읽는다 (신규공개/수정/취소 구분에 필요)
    //    ⚠ 안내문을 «건드리는 저장»일 때만 읽는다 — 상태·처리메모만 고치는 저장에서는
    //      왕복이 늘지 않는다(호출부도 안내문이 달라졌을 때만 citizen_reply 를 담아 보낸다).
    var prevReply = null, receiptNo = "";
    if (patch.citizen_reply !== undefined) {
      var pre = await sb.from(TABLE).select("citizen_reply,receipt_no").eq("id", id).single();
      if (!pre.error && pre.data) { prevReply = pre.data.citizen_reply; receiptNo = pre.data.receipt_no || ""; }
    }
    var q = sb.from(TABLE).update(upd).eq("id", id);
    if (expectUpdatedAt) q = q.eq("updated_at", expectUpdatedAt);
    /* ⚠ .single() 을 쓰지 «않는다» — 조건이 안 맞아 0행이면 .single() 은 오류(PGRST116)를 던져
       「충돌」과 「진짜 오류」가 뒤섞인다. 배열로 받아 길이로 가른다. */
    var res = await q.select();
    if (res.error) throw res.error;
    var rows = res.data || [];
    if (!rows.length) {
      // 조건을 걸고 0행 = 내가 연 뒤 누군가 먼저 저장했다. 업무 오류가 아니므로 던지지 않는다.
      if (expectUpdatedAt) return { ok: false, kind: "conflict" };
      throw new Error("저장할 접수를 찾지 못했습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.");
    }
    res = { data: rows[0] };
    // ② 저장이 «성공한 뒤에» 남긴다
    //    admin_audit 테이블은 아직 Supabase 에 없을 수 있다(양호창님 대시보드 실행 전).
    //    없어도 위 저장은 이미 끝났고, 기록 실패가 업무를 멈추지는 않는다.
    var auditOk = true;
    if (patch.citizen_reply !== undefined) {
      auditOk = await _auditReply(sb, receiptNo, prevReply, res.data && res.data.citizen_reply);
    }
    /* 🔒 «기록을 남겼는지»를 저장된 행에 얹어 돌려준다 (2026-08-25 B-6).
       ⚠ enumerable:false — JSON.stringify·전개(...)·Object.keys 어디에도 끼지 않는다.
          그래야 이 행을 그대로 다시 서버로 보내는 코드가 생겨도 «없는 칸» 오류가 안 난다.
       호출부(app.js #amSave)가 `out && out._auditOk === false` 로 보고 화면에 한 줄 알린다.
       ⛔ 이 값을 «예외»로 바꾸지 마세요 — 저장은 이미 성공했으므로, 던지면 담당자가
          「저장이 실패했다」고 오해해 같은 저장을 되풀이합니다. */
    try {
      if (res.data && typeof res.data === "object") {
        Object.defineProperty(res.data, "_auditOk", {
          value: auditOk, enumerable: false, configurable: true, writable: true
        });
      }
    } catch (e) { /* 얹지 못해도 저장 결과는 그대로 돌려준다 */ }
    return res.data;
  }

  // ── 공무원 삭제(오접수 정리) ──
  async function deleteApplication(id) {
    var sb = client();
    if (!sb) throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    var res = await sb.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
  }

  // ── 실시간 구독(공무원앱) — proposals-rt 와 동일 방식 ──
  //   새 접수·변경이 오면 cb() 호출(화면 자동 교체가 아니라 «알림» 목적). 실패는 무시.
  //   onStatus(status) 를 주면 구독 상태(SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED)를
  //   그대로 넘긴다 — 호출측이 «끊김»을 알고 폴백 조회로 물러날 수 있게 하기 위함이다.
  function subscribeApplications(cb, onStatus) {
    var sb = client();
    if (!sb) { try { if (onStatus) onStatus("CHANNEL_ERROR"); } catch (e) {} return null; }
    try {
      return sb.channel("applications-rt")
        .on("postgres_changes",
            { event: "*", schema: "public", table: TABLE },
            /* ⭐ 2026-08-26 — payload(p) 를 «그대로» 넘긴다.
               예전에는 `function () { cb(); }` 라 INSERT / UPDATE / DELETE 를 구분할 수 없었다.
               탭의 «확인하지 않은 접수 N건» 배지는 «새로 들어온 것(INSERT)»만 세야 하므로
               구독자가 p.eventType · p.new 를 볼 수 있어야 한다.
               ⛔ 다시 인자를 삼키지 마세요 — 삼키면 배지가 상태 변경까지 새 접수로 셉니다.
               ⚠ 기존 구독자는 인자를 안 쓰면 그만이라 «되돌림 없이» 안전하다. */
            function (p) { try { if (cb) cb(p); } catch (e) {} })
        .subscribe(function (status) { try { if (onStatus) onStatus(status); } catch (e) {} });
    } catch (e) {
      console.warn("[신청접수] 실시간 구독 실패(무시):", e);
      try { if (onStatus) onStatus("CHANNEL_ERROR"); } catch (e2) {}
      return null;
    }
  }

  // ── 오류 원인 분류(호출부 안내·다시시도 판단용) ──
  //   conn=연결/서버 · perm=권한(RLS) · setup=테이블 미생성 · other=그밖
  function errKind(e) {
    if (!e) return "other";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "conn";
    var msg = String((e && (e.message || e.error)) || e || "").toLowerCase();
    var code = String((e && (e.code || e.status || e.statusCode)) || "");
    if (e.name === "TypeError" && msg.indexOf("fetch") >= 0) return "conn";
    if (/failed to fetch|networkerror|network error|load failed|timeout|timed out|fetch failed/.test(msg)) return "conn";
    if (/^(5\d\d|0|429)$/.test(code)) return "conn";
    if (/service unavailable|bad gateway|gateway timeout|temporarily unavailable|paused/.test(msg)) return "conn";
    if (code === "42501" || code === "401" || code === "403" ||
        /row-level security|permission denied|not authorized|jwt|api key/.test(msg)) return "perm";
    if (code === "42P01" || code === "PGRST205" || code === "PGRST204" || code === "404" ||
        /does not exist|could not find the (table|column)|schema cache/.test(msg)) return "setup";
    return "other";
  }

  return {
    TABLE: TABLE,
    STATUSES: STATUSES,
    useClient: useClient,
    setGuestMode: setGuestMode,     // 🧪 둘러보기 여부 — 화면(app.js showApp)이 한 번만 알려 준다
    isGuestMode: isGuestMode,
    DEMO_RPC: DEMO_RPC,
    benefitKey: benefitKey,
    genReceiptNo: genReceiptNo,
    submitApplication: submitApplication,
    listApplications: listApplications,
    updateApplication: updateApplication,
    deleteApplication: deleteApplication,
    subscribeApplications: subscribeApplications,
    errKind: errKind
  };
})();
