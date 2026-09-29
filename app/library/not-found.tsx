import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { PubButtonLink } from '../_pub/components/Button'
import { IconArrowRight } from '../_pub/icons'

/**
 * `/library*` 세그먼트 전용 404. 루트 `app/not-found.tsx`(내부 `_ds`, 로그인 벽 CTA)와 갈라 둔다 —
 * 여기는 익명 공개 라이브러리다(`lib/auth/policy.ts` PUBLIC_PREFIXES `/library`).
 * `/library/<없는 slug>`(app/library/[slug]/page.tsx notFound())도 이걸로 잡힌다.
 */
export default function LibraryNotFound() {
  return (
    <PubShell theme="light">
      <Hero
        eyebrow="404"
        title="없는 화면입니다"
        lead="주소가 바뀌었거나 링크가 잘못됐습니다."
        actions={
          <>
            <PubButtonLink href="/library" variant="primary">라이브러리로<IconArrowRight /></PubButtonLink>
            <PubButtonLink href="/" variant="ghost">처음으로</PubButtonLink>
          </>
        }
      />
    </PubShell>
  )
}
