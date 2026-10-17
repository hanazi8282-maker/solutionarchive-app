import { notFound } from 'next/navigation'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { pmfBEnabled } from '@/lib/pmf-b/entry'
import { EntryForm } from './entry-form'

// PMF 판정 B 입구(v71f L-18) — 기능 플래그 PMF_B_ENTRY=on 일 때만 존재하고, 숨김 경로(noindex)이며 로그인(허용목록) 필수다
// (lib/auth/policy.ts 공개 목록에 없다). 기존 /cases/report 는 그대로. 저장 안 함: lib/pmf-b/entry.ts.
export const dynamic = 'force-dynamic'
export const metadata = { title: '아이디어 입구', robots: { index: false, follow: false } }

export default function Page() {
  if (!pmfBEnabled()) notFound()
  return (
    <PubShell theme="light">
      <Hero variant="index" title="아이디어 입구" lead="아직 만들기 전인 아이디어를 적어 주세요. 같은 영역의 경쟁 제품 고객 글을 기준으로 이 아이디어가 겹치는 곳과 비어 있는 곳을 보여 드립니다." />
      <EntryForm />
    </PubShell>
  )
}
