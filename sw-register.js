// 서비스워커 등록 (공무원앱) — PWA 설치 가능 + 오프라인 로딩
//
// ⚠ 이 코드는 원래 index.html 안의 «인라인 <script>» 였다.
//    CSP(Content-Security-Policy)를 'unsafe-inline' 없이 적용하려면 인라인 스크립트가
//    하나도 없어야 하므로 별도 파일로 뺐다. 다시 index.html 안으로 옮기지 말 것
//    (옮기면 CSP 가 이 스크립트를 «차단»해 서비스워커가 등록되지 않는다).
//
// 등록에 실패해도 앱 기능에는 영향이 없다(설치·오프라인만 비활성).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("sw.js")
      .then(function (reg) { console.log("[PWA·공무원] 서비스워커 등록:", reg.scope); })
      .catch(function (e) { console.warn("[PWA·공무원] 서비스워커 등록 실패(무시):", e); });
  });
}
