import { redirect } from 'next/navigation'
import { getAuthVerdict } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/policy'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubButton, PubButtonLink } from '../_pub/components/Button'

export const metadata = { title: '로그인' }

// proxy 가 막은 요청은 전부 여기로 온다. 사유를 쿼리로 넘겨받지 않고 **여기서 다시 판정**한다 —
// 화면에 보이는 상태가 실제 판정과 어긋나지 않게(쿼리는 누구나 조작할 수 있다).
// error 쿼리는 고정 코드만 받는다. 임의 문구를 화면에 찍지 않는다.
//
// 2026-09-23: 화면만 `app/_pub` 라이트 테마로 옮겼다. 서버 액션(/auth/login·/auth/logout)·
// OAuth 흐름·`next` 파라미터 처리는 그대로다.

const ERRORS: Record<string, string> = {
  start: 'Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하세요.',
  callback: 'Google 로그인 응답을 세션으로 바꾸지 못했습니다(취소했거나 시간이 지났을 수 있습니다). 다시 시도하세요.',
}

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null)
  const verdict = await getAuthVerdict()
  if (verdict.kind === 'allowed') redirect(next)

  const err = typeof sp.error === 'string' ? ERRORS[sp.error] : undefined

  return (
    <PubShell theme="light" footerNote="로그인은 내부 작업 화면(검수·분석)에만 필요하다. 케이스 라이브러리와 칼럼은 로그인 없이 읽힌다.">
      <div className="pub-solo">
        <Hero
          eyebrow="SOLUTION ARCHIVE"
          title="로그인"
          lead="내부 운영 도구입니다. 허용 목록에 등록된 Google 계정만 들어올 수 있습니다."
        />

        {err ? (
          <Panel tone="alert" titleAs="h2" title="로그인 실패">
            <p className="pub-text">{err}</p>
          </Panel>
        ) : null}

        {verdict.kind === 'anonymous' && (
          <Panel>
            <form className="pub-form" action="/auth/login" method="post">
              <input type="hidden" name="next" value={next} />
              <PubButton variant="primary" size="lg">Google 계정으로 로그인</PubButton>
            </form>
          </Panel>
        )}

        {verdict.kind === 'forbidden' && (
          <Panel tone="alert" titleAs="h2" title="허용되지 않은 계정">
            <p className="pub-text">
              <span className="pub-code">{verdict.email}</span> 은(는) 허용 목록에 없습니다.
              다른 계정으로 들어오려면 로그아웃한 뒤 다시 로그인하세요.
            </p>
            <form className="pub-form" action="/auth/logout" method="post">
              <PubButton variant="ghost">로그아웃</PubButton>
            </form>
          </Panel>
        )}

        {verdict.kind === 'allowlist_unset' && (
          <Panel tone="alert" titleAs="h2" title="허용 목록 미설정 — 지금은 아무도 들어올 수 없습니다">
            <p className="pub-text">
              서버 환경변수 <span className="pub-code">AUTH_ALLOWED_EMAILS</span> 가 비어 있습니다.
              설정 누락이 전체 공개로 이어지지 않도록 잠가 두었습니다. 관리자가 Vercel 환경변수에
              쉼표로 구분한 이메일을 넣고 재배포해야 합니다.
            </p>
          </Panel>
        )}

        {verdict.kind === 'unavailable' && (
          <Panel tone="alert" titleAs="h2" title="인증 확인 불가">
            <p className="pub-text">
              로그인 상태를 확인하지 못했습니다. 로그인이 안 된 것이 아니라 <b>확인을 못 한 것</b>이라,
              확인될 때까지 들어갈 수 없습니다(인증 서버 장애 또는 설정 누락).
            </p>
            <p className="pub-caption pub-code">{verdict.detail}</p>
            <div className="pub-actions">
              <PubButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="ghost">다시 확인</PubButtonLink>
            </div>
          </Panel>
        )}
      </div>
    </PubShell>
  )
}
