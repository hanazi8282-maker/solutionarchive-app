import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/auth/policy'
import { getConsultUser } from '@/lib/consult/session'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButton } from '../../_pub/components/Button'

export const metadata = { title: '로그인 — 60초 진단' }

const MSG: Record<string, string> = {
  start: 'Google 로그인을 시작하지 못했습니다. 아래 이메일 로그인을 이용하세요.',
  callback: '로그인 응답을 세션으로 바꾸지 못했습니다(취소했거나 링크가 만료됐을 수 있습니다). 다시 시도하세요.',
  email: '이메일 주소를 확인하세요.',
  otp: '로그인 메일을 보내지 못했습니다. 잠시 후 다시 시도하세요.',
}

// 컨설팅 로그인(v71ci R0): Google OAuth(주) + 이메일 링크(보조, OAuth 실패 시 대체 경로). 허용 목록은 쓰지 않는다.
export default async function ConsultLogin({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; sent?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next ?? '/consult/new')
  const u = await getConsultUser()
  if (u.kind === 'ok') redirect(next.startsWith('/consult') ? next : '/consult/new')
  const err = sp.error ? MSG[sp.error] : undefined
  return (
    <PubShell theme="light" footerNote="로그인은 진단 결과를 본인 계정에 저장하기 위한 것입니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title="로그인" lead="Google 계정이나 이메일로 들어오세요." />
        {err ? <Panel tone="alert" titleAs="h2" title="로그인 실패"><p className="pub-text">{err}</p></Panel> : null}
        {sp.sent ? <Panel titleAs="h2" title="메일을 보냈습니다"><p className="pub-text">받은 편지함의 링크를 같은 브라우저에서 여세요.</p></Panel> : null}
        {u.kind === 'unavailable' ? (
          <Panel tone="alert" titleAs="h2" title="인증 확인 불가"><p className="pub-text pub-code">{u.detail}</p></Panel>
        ) : (
          <>
            <Panel>
              <form className="pub-form" action="/auth/login" method="post">
                <input type="hidden" name="next" value={next} />
                <PubButton variant="primary" size="lg">Google 계정으로 로그인</PubButton>
              </form>
            </Panel>
            <Panel titleAs="h2" title="이메일로 로그인">
              <form className="pub-form" action="/consult/auth/otp" method="post">
                <input type="hidden" name="next" value={next} />
                <input className="pub-field" type="email" name="email" required autoComplete="email" placeholder="you@company.com" aria-label="이메일" />
                <PubButton variant="ghost">로그인 링크 받기</PubButton>
              </form>
            </Panel>
          </>
        )}
      </div>
    </PubShell>
  )
}
