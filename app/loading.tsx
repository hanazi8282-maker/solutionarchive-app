import './_pub/pub.css'

// /dashboard 는 Threads API 까지 기다린 뒤에야 그려진다. 그동안 빈 흰 화면 대신 자리를 잡아 둔다.
// 공개·내부 공용 파일이라 공개 톤(토큰 v2 라이트)으로 그린다 — app/error.tsx 머리말과 같은 이유.
export default function Loading() {
  return (
    <div className="pub-root" data-pub-theme="light">
      <main className="pub-main pub-loading">
        <p role="status" aria-live="polite" className="pub-caption">불러오는 중…</p>
        <div aria-hidden className="pub-skel" />
        <div aria-hidden className="pub-skel pub-skel--tall" />
        <div aria-hidden className="pub-skel pub-skel--tall" />
      </main>
    </div>
  )
}
