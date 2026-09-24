import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { listSaved, savedCards, SAVES_MIGRATION } from '@/lib/cases/saves'
import type { DetailMoveRow, DetailStudyRow } from '@/lib/cases/detail'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'
import { PubCaseCard } from '../../_pub/components/PubCaseCard'
import { PubBrandLogoNotice } from '../../_pub/components/PubBrandLogo'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { Chip } from '../../_pub/components/Chip'
import { IconArrowRight, IconBookmark } from '../../_pub/icons'

// 내 저장함. **이 페이지는 스스로 막는다.**
//
// ⚠️ `/library` 접두사는 `lib/auth/policy.ts` 에서 공개다(공개 케이스 라이브러리). 그래서
//    proxy 가 이 경로를 막아 주지 않는다 — 접두사 하나가 형제 경로까지 여는 자리다.
//    저장함은 남의 저장 목록이 보이면 안 되므로 여기서 직접 판정하고 /login 으로 보낸다.
//    정책 파일을 고쳐 `/library/saved` 만 닫는 방법도 있지만, 그건 인증 경계 변경이라
//    사람 판단이다(CLAUDE.md §10.2). 페이지가 스스로 막는 쪽이 같은 효과에 더 좁다.
//
// 로그인 판정이 'allowed' 가 아닌 네 상태(anonymous·forbidden·allowlist_unset·unavailable)를
// 전부 /login 으로 보낸다. 사유 문구는 로그인 화면이 다시 판정해 말한다 — 여기서 따로 쓰면
// 같은 판정의 문구가 두 벌이 되고, 그중 하나가 조용히 틀어진다.
//
// 화면은 `app/_pub` 라이트 테마다(A2). 위 가드는 그 이관과 무관하게 그대로 남는다.

export const dynamic = 'force-dynamic'
export const metadata = { title: '저장한 케이스' }

const NEXT = '/login?next=' + encodeURIComponent('/library/saved')

export default async function SavedCasesPage() {
  const verdict = await getAuthVerdict()
  if (verdict.kind !== 'allowed') redirect(NEXT)

  const sb = await createClient()
  if (!sb) {
    return (
      <PubShell theme="light">
        <Hero title="저장한 케이스" />
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">저장함을 읽지 못했습니다. 저장한 케이스가 없다는 뜻이 아닙니다.</p>
        </Panel>
      </PubShell>
    )
  }

  const saved = await listSaved(sb, verdict.email)
  if (!saved.ok) {
    return (
      <PubShell theme="light">
        <Hero title="저장한 케이스" lead={verdict.email} />
        <Panel tone="alert" title="확인 불가 — 저장함을 읽지 못했습니다">
          <p className="pub-text">
            {saved.reason}
            {saved.kind === 'migration_missing' && (
              <> 이 화면은 <code className="pub-code">supabase/migrations/{SAVES_MIGRATION}</code> 을 적용해야 켜집니다. 저장한 게 0건이라는 뜻이 아닙니다.</>
            )}
          </p>
        </Panel>
      </PubShell>
    )
  }

  // 케이스·무브는 `select('*')` 로 통째로 읽는다 — 컬럼 목록을 적으면 마이그 미적용 환경에서
  // 42703 으로 조회 전체가 죽고, 그게 "저장한 게 없음"으로 보인다(lib/cases/detail.ts 와 같은 이유).
  const [studiesRes, movesRes] = await Promise.all([
    sb.from('case_studies').select('*'),
    sb.from('case_moves').select('*'),
  ])
  if (studiesRes.error || movesRes.error) {
    const e = studiesRes.error ?? movesRes.error
    console.error('[library/saved] corpus select error:', e?.code ?? '', e?.message ?? '')
    return (
      <PubShell theme="light">
        <Hero title="저장한 케이스" lead={verdict.email} />
        <Panel tone="alert" title="확인 불가 — 케이스 조회 실패">
          <p className="pub-text">
            저장 행 {saved.rows.length}건은 읽었지만 케이스 본문을 읽지 못했습니다({e?.message}). 저장이 사라진 것이 아닙니다.
          </p>
        </Panel>
      </PubShell>
    )
  }

  const { cards, hidden } = savedCards(
    saved.rows,
    (studiesRes.data ?? []) as DetailStudyRow[],
    (movesRes.data ?? []) as DetailMoveRow[],
  )

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="MY SAVES"
        title="저장한 케이스"
        lead={`${verdict.email} 이(가) 저장한 것만 보입니다. 저장은 사람마다 따로입니다.`}
        meta={
          // M1: 개수를 note 한 줄에서 칩 줄로(라이브러리 상세 히어로와 같은 자리). 두 숫자를 같이 둔다 —
          // 저장 수와 지금 볼 수 있는 수가 다르면 그 차이가 아래 알림의 근거다.
          <div className="pub-chiprow">
            <Chip><IconBookmark />저장 {saved.rows.length}건</Chip>
            <Chip>볼 수 있는 것 {cards.length}장</Chip>
          </div>
        }
      />

      {hidden > 0 && (
        <Panel tone="alert" title={`저장한 ${hidden}건은 지금 목록에 없습니다`}>
          <p className="pub-text">
            저장한 뒤 그 케이스의 승인이 내려갔거나 케이스가 지워졌습니다. 저장 자체는 남아 있고,
            다시 승인되면 여기 돌아옵니다 — 조용히 빼지 않고 개수를 적습니다.
          </p>
        </Panel>
      )}

      {cards.length === 0 ? (
        <PubEmpty
          title={saved.rows.length === 0 ? '아직 저장한 케이스가 없습니다 (조회는 정상)' : `저장 ${saved.rows.length}건이 전부 지금은 볼 수 없는 케이스입니다`}
          description={saved.rows.length === 0
            ? '케이스 상세에서 "저장" 을 누르면 여기 쌓입니다. 추천으로 채우지 않습니다 — 이 화면은 당신이 고른 것만 보여 줍니다.'
            : '승인이 내려갔거나 지워진 케이스입니다.'}
          action={<PubButtonLink href="/library" variant="primary" size="sm">케이스 둘러보기<IconArrowRight /></PubButtonLink>}
        />
      ) : (
        <div className="pub-libmain">
          <div className="pub-cardgrid">
            {cards.map((c) => (
              <PubCaseCard key={c.study.id} study={c.study} move={c.move} moveCount={c.move_count} />
            ))}
          </div>
          <PubBrandLogoNotice />
        </div>
      )}
    </PubShell>
  )
}
