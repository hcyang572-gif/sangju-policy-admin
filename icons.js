/* 상주정책(공무원용) — 이모지를 인라인 SVG 로 바꾸는 «시각 레이어»
 * ────────────────────────────────────────────────────────────────
 * 공통 디자인 규격서 §5: 「아이콘은 인라인 SVG 만. 이모지 금지(세 앱 전 화면)」.
 *
 * index.html 의 이모지는 마크업에서 직접 SVG 로 바꿨다. 그런데 목록 카드·모달 본문처럼
 * app.js 가 «만들어 내는» 화면에도 이모지가 남아 있다. app.js 는 로직 무수정이 원칙이므로,
 * 여기서 그려진 뒤의 글자만 바꿔 끼운다.
 *
 * ⚠ 안전 규칙 (이 파일이 업무 로직을 건드리지 않도록)
 *   · innerHTML 을 다시 쓰지 않는다 — «글자 마디(text node)»만 쪼개고 그 자리에 <svg> 를 끼운다.
 *     그래서 app.js 가 요소에 달아 둔 onclick·이벤트가 절대 떨어지지 않는다.
 *   · 입력칸(input·textarea)·스크립트·이미 만든 SVG 안은 건드리지 않는다.
 *   · aria-label / 접근명은 손대지 않는다 — 낭독기에는 원래 문구가 그대로 남는다.
 *     (이모지 옆의 «글자 라벨»도 그대로 두므로 뜻이 사라지지 않는다)
 *   · 이모지 글자를 없애면서 SVG 로 바꾸므로 두 번 돌려도 결과가 같다(멱등).
 */
(function () {
  "use strict";

  // 선 아이콘 — 24 격자 · 굵기 1.8 · currentColor (규격서 §5)
  var D = {
    "🧾": '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',            // 🧾 접수번호
    "💬": '<path d="M21 14.5a3 3 0 0 1-3 3H8l-5 4V5.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',                                     // 💬 안내문·메모
    "🙍": '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',                                           // 🙍 사람
    "📞": '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>', // 📞 연락처
    "🗓": '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',                            // 🗓 날짜
    "👍": '<path d="M7 21V10l4.5-7a2 2 0 0 1 2.9 2.4L13 10h5.5a2 2 0 0 1 2 2.4l-1.3 6A2.5 2.5 0 0 1 16.8 21z"/><path d="M7 10H4v11h3"/>', // 👍 공감
    "🚩": '<path d="M5.5 21V3.5"/><path d="M5.5 4.5h11l-2 3.5 2 3.5h-11z"/>',                                                    // 🚩 신고
    "🚫": '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',                                                             // 🚫 블라인드
    "🔔": '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',                   // 🔔 알림
    "📂": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',                               // 📂 사업
    "📌": '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z"/><path d="M12 14v7"/>',                                                          // 📌 접수 안내
    "📎": '<path d="M20 11.5 11.3 20a5 5 0 0 1-7-7l8.4-8.5a3.3 3.3 0 1 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',      // 📎 서식
    "📄": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',                          // 📄 파일
    "🗑": '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',                                        // 🗑 삭제
    "💾": '<path d="M4 6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 4v5h7M8 20v-6h8v6"/>',              // 💾 저장
    "✏":       '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',                                                             // ✏ 수정
    "➕":       '<path d="M12 5v14M5 12h14"/>',                                                                                          // ➕ 추가
    "⬆":       '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',                                                                         // ⬆ 올리기
    "🔄": '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 19v-4h-4"/>', // 🔄 다시 시도
    "🔒": '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',                              // 🔒 권한
    "🔑": '<circle cx="8" cy="14" r="4"/><path d="m11.2 10.8 8.8-8.8M17 5l2.4 2.4M14.2 7.8l2.4 2.4"/>',                            // 🔑 비밀번호
    "📥": '<path d="M4 5h16l2 8v6H2v-6z"/><path d="M2 13h5l1.5 3h7L17 13h5"/>',                                                    // 📥 접수
    "🗳": '<path d="M21 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',                                            // 🗳 정책제안
    "🛠": '<path d="M14.5 3.5a5 5 0 0 0 6 6l-11 11a2.8 2.8 0 0 1-4-4z"/>',                                                        // 🛠 설정
    "📝": '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',                                                             // 처리메모
    "⚠": '<path d="M12 3.5 22 20H2z"/><path d="M12 10v4.5M12 17.4h.01"/>',                                                     // 주의
    // ⚠ 위 "⬆"(올리기)가 이 자리에 «한 번 더» 적혀 있었다 — 같은 키를 두 번 쓰면
    //   뒤엣것이 앞엣것을 덮을 뿐 아무 효과가 없다(2026-08-25 정리). 되살리지 말 것.
    "🏷": '<path d="M11 3.5h9.5V13L12 21.5l-9-9z"/><path d="M16.6 7.4h.01"/>',                                                    // 🏷 분야(카테고리)
    "📍": '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',                       // 📍 읍·면·동
    "✅":       '<circle cx="12" cy="12" r="8.5"/><path d="m8 12 3 3 5-6"/>',                                                            // ✅ 완료
  };

  function svg(key) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("class", "ico ico-inline");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "1.8");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("focusable", "false");
    el.innerHTML = D[key];
    return el;
  }

  // 이 태그 «안»의 글자는 건드리지 않는다(값이 바뀌거나 그림이 깨진다)
  var SKIP = { INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, SCRIPT: 1, STYLE: 1, svg: 1 };

  function skipped(node) {
    for (var p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (SKIP[p.tagName] || SKIP[p.nodeName]) return true;
      if (p.namespaceURI === "http://www.w3.org/2000/svg") return true;
    }
    return false;
  }

  function firstEmoji(text) {
    for (var k in D) if (text.indexOf(k) !== -1) return k;
    return null;
  }

  function swap(root) {
    if (!root || root.nodeType !== 1) return;
    var walker, texts = [], n;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    } catch (e) { return; }
    while ((n = walker.nextNode())) {
      if (n.nodeValue && firstEmoji(n.nodeValue) && !skipped(n)) texts.push(n);
    }
    for (var i = 0; i < texts.length; i++) {
      var node = texts[i], key;
      // 한 마디 안에 여러 개가 있을 수 있으므로 앞에서부터 하나씩 떼어 낸다
      while (node && (key = firstEmoji(node.nodeValue))) {
        var at = node.nodeValue.indexOf(key);
        var after = node.splitText(at);            // after 는 이모지로 시작한다
        after.nodeValue = after.nodeValue.slice(key.length);
        /* ⭐ «보이지 않는 한 글자» 제거 (2026-08-25)
           표의 키는 "⚠"(U+26A0) 인데 화면 문구는 "⚠️"(U+26A0 U+FE0F, 이모지 변형선택자)를
           쓰는 자리가 있다. 키 길이만큼만 잘라내면 U+FE0F 가 그대로 남아,
           SVG 아이콘 옆에 «보이지 않는 글자»가 붙은 채로 남는다(글꼴에 따라 네모로 보인다).
           \s 로도 안 걸리므로 여기서 따로 걷어낸다. 다른 이모지에도 같은 일이 생기므로
           키를 늘리는 대신 «변형선택자»를 없애는 쪽으로 한 곳에서 해결한다. */
        after.nodeValue = after.nodeValue.replace(/^\uFE0F/, "");   // \uFE0F = 이모지 변형선택자. 눈에 안 보이는 글자라 «escape 로» 적어 둔다(편집 중 지워지지 않게).
        // 아이콘 «바로 옆»의 공백·줄바꿈만 없앤다.
        //  · 이모지 뒤 한 칸은 아이콘 오른쪽 여백(CSS margin)이 대신한다.
        //  · app.js 의 여러 줄 템플릿 때문에 생긴 줄바꿈은 white-space:pre-wrap 인 칸에서
        //    «진짜 줄바꿈»으로 그려져 아이콘만 따로 한 줄을 차지한다 → 그 줄바꿈을 지운다.
        //  ⚠ 아이콘에서 떨어진 곳의 줄바꿈(시민이 쓴 문의사항 등)은 절대 건드리지 않는다.
        after.nodeValue = after.nodeValue.replace(/^\s+/, "");
        node.nodeValue = node.nodeValue.replace(/\s+$/, "");
        after.parentNode.insertBefore(svg(key), after);
        node = after;
      }
    }
  }

  // app.js 가 화면을 다시 그릴 때마다 새로 들어온 부분만 바꾼다.
  //  · 목록·모달 본문처럼 «요소»가 통째로 들어오는 경우  → 그 요소를 훑는다
  //  · btn.textContent = "…" 처럼 «글자만» 갈아 끼우는 경우 → 그 부모를 훑는다
  var busy = false;   // 우리가 바꾼 것이 다시 우리를 부르지 않도록(재진입 방지)
  function watch() {
    try {
      var mo = new MutationObserver(function (recs) {
        if (busy) return;
        busy = true;
        try {
          for (var r = 0; r < recs.length; r++) {
            var m = recs[r];
            if (m.type === "characterData") { swap(m.target.parentNode); continue; }
            for (var a = 0; a < m.addedNodes.length; a++) {
              var nd = m.addedNodes[a];
              if (nd.nodeType === 1) swap(nd);
              else if (nd.nodeType === 3) swap(nd.parentNode);
            }
          }
        } finally { busy = false; }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { /* 아주 오래된 브라우저 — 처음 1회 교체만 하고 넘어간다 */ }
  }

  function start() { swap(document.body); watch(); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
