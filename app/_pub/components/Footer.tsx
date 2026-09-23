import Link from 'next/link'

/**
 * 공개 화면 푸터. 링크는 헤더와 같은 3개 + 한 줄 상태 문구.
 * `note` 로 화면별 조건을 덧붙인다(기본값은 허용목록 베타라는 사실).
 */
export function Footer({ note }: { note?: string }) {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-links">
        <Link href="/library">케이스 라이브러리</Link>
        <Link href="/columns/read">칼럼</Link>
        <Link href="/onboarding/quiz">내 문제로 시작</Link>
        <Link href="/login">로그인</Link>
      </div>
      <p className="pub-caption">
        {note ?? '허용목록 베타 — 초대된 Google 계정만 로그인할 수 있다. 케이스 라이브러리와 칼럼은 로그인 없이 읽힌다.'}
      </p>
      <p className="pub-caption">SOLUTION ARCHIVE</p>
    </footer>
  )
}
