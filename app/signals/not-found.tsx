import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { PubButtonLink } from '../_pub/components/Button'
import { IconArrowRight } from '../_pub/icons'

/**
 * `/signals*` 세그먼트 전용 404. 루트 `app/not-found.tsx`(내부 `_ds`, 로그인 벽 CTA)와 갈라 둔다 —
 * 여기 오는 방문자는 대부분 익명이라서다(`lib/auth/policy.ts` PUBLIC_EXACT `/signals`·`/signals/card`).
 * `/signals/card` 가 `?id=` 없이/무효로 부르는 `notFound()`(app/signals/card/page.tsx)도 이걸로 잡힌다.
 */
export default function SignalsNotFound() {
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
