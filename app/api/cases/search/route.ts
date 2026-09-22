import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { parseSearchQuery, searchMoves } from '@/lib/cases/search'

// "내 문제 → 유사 케이스" 검색 — 조회 전용.
//
//   GET /api/cases/search?bottleneck=CONVERSION&problem=PRICE_TOO_LOW&q=무료로는 쓰는데 결제를 안 한다
//
// 셋 다 선택이지만 **하나는 있어야** 한다(없으면 not_run: "검색 조건이 없다").
// 로그인 필요 — 공개 접두사(lib/auth/policy.ts PUBLIC_PREFIXES)에 없으므로 기본 잠김이다.
//
// 응답은 §7.1 3상태를 그대로 싣는다. 0건(no_match)과 못 찾음(not_run)을 같은 빈 배열로
// 뭉개지 않는다 — 화면이 둘을 다른 문장으로 말해야 하기 때문이다.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const url = new URL(req.url)
  const { query, errors } = parseSearchQuery({
    bottleneck: url.searchParams.get('bottleneck'),
    problem: url.searchParams.get('problem'),
    q: url.searchParams.get('q'),
  })
  // 어휘 밖 값은 400 이다. 무시하고 전체를 돌려주면 "그 유형의 결과"로 읽힌다.
  if (errors.length) return NextResponse.json({ error: errors.join(' / ') }, { status: 400 })

  const corpora = await loadCaseCorpus(supabase, 'cases/search')
  return NextResponse.json({ search: searchMoves(query, corpora) })
}
