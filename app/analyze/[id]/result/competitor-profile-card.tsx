import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PROFILE_MIGRATION, SECTIONS, SECTION_LABEL, type Claim, type ProfileSections,
} from '@/lib/analysis/competitor-profile'
import { Badge, type Tone } from '../../../_ds/components/Badge'
import { Card } from '../../../_ds/components/Card'
import { EvidenceCaption } from '../../../_ds/components/EvidenceCaption'
import { Notice } from '../../../_ds/components/Shell'

// 경쟁사 프로필 카드 — /analyze/[id]/result 의 한 섹션(기존 화면 확장, 새 스타일 없음).
// 최신 스냅샷을 템플릿(SECTIONS) 순서로, 주장마다 원문 링크(없는 소스는 "소스 · id")와 함께 그린다.
// 3상태: 테이블 없음(마이그 미적용) / 조회 실패(확인 불가) / 0건(아직 안 만듦) 을 다른 문장으로 낸다(§7.1).

type SnapshotRow = {
  id: string
  created_at: string
  status: 'ok' | 'unverified' | 'failed'
  fail_reason: string | null
  sections: ProfileSections | null
  model: string | null
  prompt_version: string
  trigger: string
  input_count: number
  input_total: number
  inputs_from: string | null
  inputs_to: string | null
  dropped_claims: number | null
  cited_inputs: number | null
}

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmt = (iso: string | null) => (iso ? KST.format(Date.parse(iso)) : null)

const STATUS_TONE: Record<SnapshotRow['status'], Tone> = { ok: 'success', unverified: 'warning', failed: 'danger' }
const STATUS_LABEL: Record<SnapshotRow['status'], string> = { ok: '근거 전부 확인', unverified: '일부 미확인', failed: '생성 실패' }
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202'])

function ClaimLine({ c }: { c: Claim }) {
  return (
    <li className="v2-body">
      {c.claim}
      <span className="v2-note">
        {' '}
        {c.evidence.map((e, i) => (
          <span key={e.input_id}>
            {i > 0 ? ' · ' : ''}
            {e.link
              ? <a href={e.link} target="_blank" rel="noopener noreferrer" className="v2-link-accent">[{e.label}]</a>
              : <span title="이 소스는 원문별 URL 이 없다 — 소스 · 원문 id 로 찾는다">[{e.label}]</span>}
          </span>
        ))}
      </span>
    </li>
  )
}

export async function CompetitorProfileCard({ supabase, projectId }: { supabase: SupabaseClient; projectId: string }) {
  const { data, error } = await supabase
    .from('competitor_profile_snapshots')
    .select('id, created_at, status, fail_reason, sections, model, prompt_version, trigger, input_count, input_total, inputs_from, inputs_to, dropped_claims, cited_inputs')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(12)

  const title = '경쟁사 프로필'
  const subtitle = '리뷰·VOC 원문만으로 합성한다. 주장마다 근거 원문을 단다 — 근거가 없는 주장은 코드가 버린다.'

  if (error) {
    return (
      <Card title={title} subtitle={subtitle}>
        {MISSING_TABLE.has(error.code ?? '')
          ? <Notice tone="warning">프로필 미적용 — 마이그레이션 {PROFILE_MIGRATION} 전이다. 적용하면 다음 추출부터 채워진다.</Notice>
          : <Notice tone="danger">프로필 조회에 실패했다({error.code ?? ''} {error.message}) — 없다는 뜻이 아니다.</Notice>}
      </Card>
    )
  }

  const rows = (data ?? []) as SnapshotRow[]
  if (rows.length === 0) {
    return (
      <Card title={title} subtitle={subtitle}>
        <p className="v2-text v2-text--muted">아직 만든 스냅샷이 없다. 추출(분석)이 끝나면 자동으로 만든다 — 기존 프로젝트는 백필로 채운다.</p>
      </Card>
    )
  }

  const latest = rows[0]
  // 표시는 본문이 있는 가장 최근 것. 마지막이 실패면 그 사실을 위에 알리고 그 전 것을 보여 준다.
  const shown = rows.find((r) => r.status !== 'failed' && r.sections) ?? null
  const history = rows.filter((r) => r.id !== shown?.id)

  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={shown ? <Badge tone={STATUS_TONE[shown.status]} dot size="sm">{STATUS_LABEL[shown.status]}</Badge> : null}
    >
      <div className="v2-stack">
        {latest.status === 'failed' && (
          <Notice tone="warning">
            마지막 생성({fmt(latest.created_at)} KST)이 실패했다: {latest.fail_reason ?? '사유 없음'}
            {shown ? ' — 아래는 그 전 스냅샷이다.' : ''}
          </Notice>
        )}
        {shown ? (
          <>
            <p className="v2-note">
              스냅샷 {fmt(shown.created_at)} KST · {shown.trigger === 'extract' ? '추출 직후' : shown.trigger === 'backfill' ? '백필' : '수동'} · {shown.model ?? '모델 미기록'} · {shown.prompt_version}
              {shown.status === 'unverified' && shown.fail_reason ? ` · ${shown.fail_reason}` : ''}
            </p>
            {SECTIONS.map((s) => {
              const claims = shown.sections?.[s] ?? []
              return (
                <div key={s} className="v2-box v2-box--edge">
                  <div className="dgy-caps">{SECTION_LABEL[s]}</div>
                  {claims.length > 0
                    ? <ul className="v2-olist">{claims.map((c, i) => <ClaimLine key={i} c={c} />)}</ul>
                    : <p className="v2-note">원문에서 근거를 찾지 못했다 — 이 섹션은 비어 있다(0건).</p>}
                </div>
              )
            })}
            <EvidenceCaption
              n={shown.cited_inputs}
              total={shown.input_count}
              period={shown.inputs_from && shown.inputs_to ? `${DAY.format(Date.parse(shown.inputs_from))}~${DAY.format(Date.parse(shown.inputs_to))}` : undefined}
              source={`원문 ${shown.input_count}/${shown.input_total}건 읽음`}
              method={`주장에 인용된 원문 · 근거 없어 버린 주장 ${shown.dropped_claims ?? '확인 불가'}개`}
              noun="근거"
            />
          </>
        ) : (
          <p className="v2-text v2-text--muted">본문이 있는 스냅샷이 없다(전부 실패). 위 사유를 보고 백필로 다시 만든다.</p>
        )}
        {history.length > 0 && (
          <p className="v2-note">
            이전 스냅샷 · {history.map((r) => `${fmt(r.created_at)} (${STATUS_LABEL[r.status]})`).join(' · ')}
          </p>
        )}
      </div>
    </Card>
  )
}
