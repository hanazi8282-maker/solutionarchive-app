import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { getAuthVerdict } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/policy'
import { Notice, PageHeader, PageShell } from '../_ds/components/Shell'

export const metadata = { title: '로그인' }

// proxy 가 막은 요청은 전부 여기로 온다. 사유를 쿼리로 넘겨받지 않고 **여기서 다시 판정**한다 —
// 화면에 보이는 상태가 실제 판정과 어긋나지 않게(쿼리는 누구나 조작할 수 있다).
// error 쿼리는 고정 코드만 받는다. 임의 문구를 화면에 찍지 않는다.

const ERRORS: Record<string, string> = {
  start: 'Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하세요.',
  callback: 'Google 로그인 응답을 세션으로 바꾸지 못했습니다(취소했거나 시간이 지났을 수 있습니다). 다시 시도하세요.',
}

// _ds Button 은 클라이언트 이벤트 핸들러를 달아 서버 컴포넌트에서 못 쓴다. 같은 토큰으로 맞춘 기본 버튼.
const BTN: CSSProperties = {
  height: 42, padding: '0 18px', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-sans)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', border: '1px solid transparent',
  background: 'var(--primary)', color: 'var(--primary-fg)',
}
const BTN_OUTLINE: CSSProperties = {
  ...BTN, height: 36, fontSize: 14, background: 'var(--surface-card)', color: 'var(--text-body)', border: '1px solid var(--border-strong)',
}

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null)
  const verdict = await getAuthVerdict()
  if (verdict.kind === 'allowed') redirect(next)

  const err = typeof sp.error === 'string' ? ERRORS[sp.error] : undefined
  const logout = (
    <form action="/auth/logout" method="post">
      <button type="submit" style={BTN_OUTLINE}>로그아웃</button>
    </form>
  )

  return (
    <PageShell maxWidth={520}>
      <PageHeader
        title="SOLUTION ARCHIVE 로그인"
        subtitle="내부 운영 도구입니다. 허용 목록에 등록된 Google 계정만 들어올 수 있습니다."
      />

      {err && <Notice tone="danger">{err}</Notice>}

      {verdict.kind === 'anonymous' && (
        <form action="/auth/login" method="post">
          <input type="hidden" name="next" value={next} />
          <button type="submit" style={BTN}>Google 계정으로 로그인</button>
        </form>
      )}

      {verdict.kind === 'forbidden' && (
        <Notice tone="danger" title="허용되지 않은 계정" action={logout}>
          <code>{verdict.email}</code> 은(는) 허용 목록에 없습니다. 다른 계정으로 들어오려면 로그아웃한 뒤 다시 로그인하세요.
        </Notice>
      )}

      {verdict.kind === 'allowlist_unset' && (
        <Notice tone="danger" title="허용 목록 미설정 — 지금은 아무도 들어올 수 없습니다">
          서버 환경변수 <code>AUTH_ALLOWED_EMAILS</code> 가 비어 있습니다. 설정 누락이 전체 공개로 이어지지 않도록
          잠가 두었습니다. 관리자가 Vercel 환경변수에 쉼표로 구분한 이메일을 넣고 재배포해야 합니다.
        </Notice>
      )}

      {verdict.kind === 'unavailable' && (
        <Notice
          tone="danger"
          title="인증 확인 불가"
          action={<a href={`/login?next=${encodeURIComponent(next)}`} style={{ ...BTN_OUTLINE, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>다시 확인</a>}
        >
          로그인 상태를 확인하지 못했습니다. 로그인이 안 된 것이 아니라 <b>확인을 못 한 것</b>이라, 확인될 때까지
          들어갈 수 없습니다(인증 서버 장애 또는 설정 누락). <code>{verdict.detail}</code>
        </Notice>
      )}
    </PageShell>
  )
}
