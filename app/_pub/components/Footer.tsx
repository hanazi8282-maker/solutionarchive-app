import Link from 'next/link'

export function Footer({ note }: { note?: string }) {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-links">
        <Link href="/library">케이스 라이브러리</Link>
        <Link href="/columns/read">칼럼</Link>
        <Link href="/signals">신호</Link>
        <Link href="/library/methodology">방법론</Link>
        <Link href="/onboarding/quiz">내 문제로 시작</Link>
        <Link href="/login">로그인</Link>
      </div>
      <p className="pub-caption">
        {note ?? '허용목록 베타. 초대된 Google 계정만 로그인할 수 있다. 케이스 라이브러리와 칼럼은 로그인 없이 읽힌다.'}
      </p>
      <p className="pub-caption">SOLUTION ARCHIVE</p>
    </footer>
  )
}
