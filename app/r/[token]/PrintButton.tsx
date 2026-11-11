'use client'
// 브라우저 인쇄 → "PDF로 저장". 서버 PDF 렌더러(headless 브라우저)는 두지 않는다 — 같은 화면이 곧 PDF 다.
export function PrintButton() {
  return <button type="button" className="pub-btn pub-btn--ghost" onClick={() => window.print()}>PDF로 저장</button>
}
