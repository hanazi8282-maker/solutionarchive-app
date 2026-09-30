import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { loadInsightFeed, parseInsightQuery } from '@/lib/insights/feed'
import { loadInsightEvidence } from '@/lib/insights/evidence'
import { InsightsView } from './view'

/**
 * 인사이트 — 앵글 생성 + 실증 게이트(judge 최종 판정)를 통과한 문구를 프로젝트를 가로질러 모은 피드.
 * 정본: reports/2026-09-30/design-direction-ia-insights-report.md I1 (남헌 2026-09-30 확정: 로그인후 전용).
 *
 * **로그인후 전용.** `lib/auth/policy.ts` 공개 목록에 없어 proxy 가 익명을 `/login?next=/insights` 로 보낸다
 * (기본 잠김 — 인증 경계 변경 0). 아래 판정은 그 위의 한 겹 더일 뿐이다: 허용목록 밖(forbidden)·확인 불가도
 * 렌더 전에 로그인으로 돌린다. 이미 계산된 판정만 읽는다 — LLM 호출 0, 마이그 0.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '인사이트',
  description: '실증 게이트를 통과한 앵글 문구를 PMF 사분면별로 모은 피드.',
}

export default async function InsightsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const verdict = await getAuthVerdict()
  if (verdict.kind !== 'allowed') redirect('/login?next=/insights')
  const { query, errors } = parseInsightQuery(await searchParams)
  const sb = await createClient()
  const result = sb
    ? await loadInsightFeed(sb, query)
    : { status: 'error' as const, reason: 'Supabase 환경변수 미설정' }
  // 이 페이지 카드들의 인용·처방 — 카드 수와 무관한 고정 횟수 조회(lib/insights/evidence.ts). LLM 0.
  const items = result.status === 'ok' ? result.groups.flatMap((g) => g.items) : []
  const evidence = sb && items.length > 0 ? await loadInsightEvidence(sb, items) : undefined
  return <InsightsView query={query} errors={errors} result={result} evidence={evidence} />
}
