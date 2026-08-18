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
//    useClient, benefitKey, genReceiptNo,
//    submitApplication, listApplications, updateApplication, deleteApplication,
//    subscribeApplications, errKind, TABLE, STATUSES
//  }
//
//  방어 원칙: applications.sql 이 아직 실행 안 됐으면(테이블 없음·PGRST205)
//    · listApplications 는 «원인 있는 오류» 를 throw → 공무원앱이 안내(showLoadError)
//    · submitApplication 실패는 throw → 시민앱이 안내(메일 전송과 «독립»)
//    · subscribeApplications 는 실패해도 조용히 무시(앱 무손상)
//  → 어떤 경우에도 앱의 다른 기능(사업목록·정책제안·메일신청)은 멀쩡해야 한다.
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

  // ── 시민 신청 INSERT (anon) — 성공 시 저장된 행(receipt_no 포함) 반환 ──
  //   실패는 throw → 호출부(시민앱)가 안내. «메일 전송과 독립» 으로 처리한다.
  async function submitApplication(payload) {
    var sb = client();
    if (!sb) throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    var row = _clean(payload || {});
    var res = await sb.from(TABLE).insert(row).select().single();
    if (res.error) throw res.error;
    return res.data;
  }

  // ── 공무원 조회 — 최신순 전체. 실패는 throw(호출부가 원인별 안내) ──
  async function listApplications() {
    var sb = client();
    if (!sb) return [];
    var res = await sb.from(TABLE).select("*").order("created_at", { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  // ── 공무원 상태변경 · 처리메모 · 시민 안내문 — patch = {status?, admin_memo?, citizen_reply?} ──
  //   허용 필드만 추린다. updated_at 은 서버 트리거가 갱신(클라가 넣지 않음).
  //   ⚠ admin_memo(내부 기록)와 citizen_reply(신청자에게 그대로 보임)는 «다른 칸»이다.
  //      절대 한쪽 값을 다른 쪽에 복사하거나 합치지 말 것 — 내부 메모가 시민에게 새어 나간다.
  //      citizen_reply 는 시민앱이 check_application_status(조회코드) 로 읽어 화면에 띄운다.
  // 🔒 「시민 안내문 공개」 감사기록 — supabase/application_status_2.sql 의 admin_audit
  //    ⛔ 본문은 절대 보내지 않는다. 누가·언제는 서버가 채운다(actor_uid=auth.uid()).
  //    ⛔ 기록 실패로 업무(저장)를 멈추지 않는다 — PC앱 access_log.py 와 같은 원칙.
  async function _auditReply(sb, receiptNo, prevReply, newReply) {
    var was = String(prevReply || "").trim(), now = String(newReply || "").trim();
    if (was === now) return;                       // 같은 값 재저장은 남기지 않는다
    var detail = !now ? "안내문 공개 취소(내용 지움)"
               : was  ? ("공개중인 안내문 수정(" + now.length + "자)")
                      : ("안내문 신규 공개(" + now.length + "자)");
    try {
      await sb.from("admin_audit").insert({
        action: "PUBLISH_CITIZEN_REPLY",
        target: receiptNo || "",                   // ★ 접수번호만. 이름·연락처 금지
        target_type: "접수(공무원앱)",
        detail: detail,                            // ★ 길이만. 본문 금지
        result: "성공"
      });
    } catch (e) { /* 기록 실패는 조용히 넘어간다 */ }
  }

  async function updateApplication(id, patch) {
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
    var res = await sb.from(TABLE).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    // ② 저장이 «성공한 뒤에» 남긴다
    //    admin_audit 테이블은 아직 Supabase 에 없을 수 있다(양호창님 대시보드 실행 전).
    //    없어도 위 저장은 이미 끝났고, _auditReply 가 실패를 삼키므로 업무는 멈추지 않는다.
    if (patch.citizen_reply !== undefined) {
      await _auditReply(sb, receiptNo, prevReply, res.data && res.data.citizen_reply);
    }
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
  function subscribeApplications(cb) {
    var sb = client();
    if (!sb) return null;
    try {
      return sb.channel("applications-rt")
        .on("postgres_changes",
            { event: "*", schema: "public", table: TABLE },
            function () { try { if (cb) cb(); } catch (e) {} })
        .subscribe();
    } catch (e) {
      console.warn("[신청접수] 실시간 구독 실패(무시):", e);
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
