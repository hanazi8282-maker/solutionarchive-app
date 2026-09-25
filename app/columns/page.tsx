import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { FilterChip } from '../_ds/components/FilterChip'
import { Notice, PageHeader, PageShell } from '../_ds/components/Shell'
import { DecisionForm } from './decision-form'
import { RevisionForm } from './revision-form'
import { PatternForm } from './pattern-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '칼럼·스레드 검수' }

// 이 파일은 읽기만 한다. 쓰기는 ./actions.ts(사람이 누르는 서버 액션) 하나다 — /cases 와 같은 규약.
// 정본은 drafts/columns/*.md 파일이다. 이 화면이 보여주는 건 scripts/column-stage.mjs 가
// 그 파일들을 옮겨 적은 사본이고, 승인·반려는 이 사본에만 기록된다 — 파일 자체는 안 바뀐다.

type ThreadEntry = { n: string; body: string; char_count: number; warns?: string[] }
type ColumnRow = {
  id: string
  slug: string
  source_path: string
  reader_type: string
  title: string
  body: string
  char_count: number
  threads: ThreadEntry[] | null
  verify_path: string | null
  verify_verdict: string | null
  review_status: string
  /** 마이그 20260930000020 — 검수 모델 수정본. 미적용이면 undefined 로 온다(없음과 구분: 화면은 둘 다 "수정본 없음"). */
  body_revised?: string | null
  revision_summary?: string | null
  revision_status?: 'pending' | 'approved' | 'rejected' | null
  revised_by?: string | null
  revised_at?: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  staged_at: string
}

const REVIEW: Record<string, { label: string; tone: Tone }> = {
  draft: { label: '검수 대기', tone: 'warning' },
  approved: { label: '승인됨', tone: 'success' },
  rejected: { label: '반려됨', tone: 'danger' },
}

/**
 * 상태 탭. review_status 는 DB CHECK 로 이 셋뿐이라(20260916000001) 세 탭 건수 합 = 전체다 —
 * 어느 탭에도 안 잡히는 칼럼이 생기면 그건 제약이 깨진 것이고, 합계가 어긋나서 바로 보인다.
 */
const TABS = [
  { key: 'draft', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
] as const

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function ReviewBadge({ status }: { status: string }) {
  const r = REVIEW[status]
  return <Badge tone={r?.tone ?? 'neutral'} dot size="sm">{r?.label ?? status}</Badge>
}

/** 본문은 접어 둔다 — /cases 와 같은 이유. 검수 대기 여러 건이 전부 펼쳐져 있으면
 *  칼럼 하나가 3,000~8,000자라 화면이 몇 장이고 결정 버튼은 그 맨 아래다. */
function ColumnBody({ body }: { body: string }) {
  return (
    <details>
      <summary className="v2-summary v2-nosel">
        본문 펼쳐서 읽기 (근거 메모·자체 점검 포함, 원문 그대로)
      </summary>
      <pre className="v2-inset v2-pre v2-mt-sm">{body}</pre>
    </details>
  )
}

function ThreadList({ threads }: { threads: ThreadEntry[] }) {
  if (!threads.length) return <p className="v2-note">스레드 짝 파일 없음 (.threads.md 미확보)</p>
  return (
    <details>
      <summary className="v2-summary v2-nosel">
        스레드 {threads.length}편 펼쳐서 읽기
      </summary>
      <ul className="v2-list v2-stack-tight v2-mt-sm">
        {threads.map((t) => (
          <li key={t.n} className="v2-inset v2-stack-tight">
            <div className="v2-chiprow">
              <Badge tone="neutral" size="sm">{t.n}편</Badge>
              <span className="v2-note">{t.char_count}자 / 500자</span>
            </div>
            <p className="v2-body v2-pre">{t.body}</p>
            {t.warns && t.warns.length > 0 && (
              <p className="v2-note v2-strong">⚠️ {t.warns.join(' · ')}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

// ── 검수 피드백 제안 ─────────────────────────────────────────────────────────
//
// scripts/column-feedback.mjs 가 review_note 배치에서 뽑아 적립한 "가이드 반영 제안".
// 반응률이 없는 트랙이라 근거 강도는 evidence_count(배치 내 빈도)와 출처 slug 뿐이다 —
// 그래서 둘 다 카드에 그대로 보여주고 강약 판단은 사람이 한다.
//
// ⛔ "가이드에 반영함"을 눌러도 가이드 문서는 안 바뀐다. 문서는 사람이 직접 고친다.

type PatternRow = {
  id: string
  pattern_key: string
  title: string
  description: string
  advice: string
  evidence_count: number
  source_slugs: string[]
  status: string
  first_seen_at: string
  decided_at: string | null
  decided_by: string | null
  decision_note: string | null
}

const PATTERN_STATUS: Record<string, { label: string; tone: Tone }> = {
  proposed: { label: '결정 대기', tone: 'warning' },
  applied: { label: '가이드에 반영함', tone: 'success' },
  dismissed: { label: '기각됨', tone: 'neutral' },
}

function PatternCard({ p }: { p: PatternRow }) {
  const s = PATTERN_STATUS[p.status]
  return (
    <Card>
      <div className="v2-form">
        <div className="v2-chiprow">
          <Badge tone={s?.tone ?? 'neutral'} dot size="sm">{s?.label ?? p.status}</Badge>
          <Badge tone={p.evidence_count > 1 ? 'info' : 'neutral'} size="sm">근거 {p.evidence_count}편</Badge>
          <span className="v2-note v2-mono v2-push">{p.pattern_key}</span>
        </div>
        <h3 className="v2-h3">{p.title}</h3>
        <p className="v2-note">근거 칼럼: {p.source_slugs.join(', ') || '없음'}</p>
        <p className="v2-body v2-pre">{p.description}</p>
        <div className="v2-box">
          <p className="v2-note">가이드에 넣을 문장 초안 (사람이 직접 옮겨 적는다)</p>
          <p className="v2-body v2-pre">{p.advice}</p>
        </div>
        {p.status === 'proposed' ? (
          <PatternForm id={p.id} />
        ) : (
          <p className="v2-note">
            {s?.label ?? p.status}
            {p.decided_by ? ` · ${p.decided_by}` : ' · 결정자 기록 없음'}
            {p.decided_at ? ` · ${KST.format(new Date(p.decided_at))} KST` : ''}
            {p.decision_note ? ` · ${p.decision_note}` : ''}
          </p>
        )}
      </div>
    </Card>
  )
}

/**
 * 조회 실패는 절대 조용하지 않다(§7.1). 성공했는데 0건일 때만 아무것도 안 그린다 —
 * 그래서 이 자리가 비어 있으면 "조회는 됐고 결정할 게 없다"는 뜻으로 읽어도 된다.
 * 접어 두는 이유는 ColumnBody 와 같다: 칼럼 카드가 스크롤 두 장 밑으로 밀리면 안 된다.
 */
function FeedbackSection({ rows, error }: { rows: PatternRow[] | null; error: { code?: string; message: string } | null }) {
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205'
    return missing ? (
      <Notice tone="warning" title="마이그레이션 미적용 — column_review_patterns 테이블 없음">
        <code>supabase db query --linked -f supabase/migrations/20260917000001_column_review_patterns.sql</code> 을 사람이 적용해야
        검수 피드백 제안이 이 화면에 올라온다. 적용 후 <code>node --env-file=.env.local scripts/column-feedback.mjs</code> 로
        검수 메모에서 패턴을 뽑는다.
      </Notice>
    ) : (
      <Notice tone="danger" title="확인 불가 — 검수 피드백 제안 조회 실패">
        {error.message} · 제안이 없다는 뜻이 아니다.
      </Notice>
    )
  }
  if (!rows || rows.length === 0) return null

  const open = rows.filter((p) => p.status === 'proposed')
  const closed = rows.filter((p) => p.status !== 'proposed')
  const evidence = new Set(open.flatMap((p) => p.source_slugs)).size

  return (
    <details>
      <summary className="v2-summary-lg">
        검수 피드백 제안 {open.length}건 (근거 {evidence}편){closed.length > 0 ? ` · 결정된 제안 ${closed.length}건` : ''}
      </summary>
      <div className="v2-stack v2-mt">
        <p className="v2-note">
          검수 메모에서 뽑은 가이드 반영 후보다. 반영을 눌러도 가이드 문서는 바뀌지 않는다 — 문서는 사람이 직접 고치고, 여기엔 결정만 남는다.
        </p>
        {open.length === 0 ? (
          <p className="v2-note">결정 대기 0건 (조회는 정상)</p>
        ) : (
          open.map((p) => <PatternCard key={p.id} p={p} />)
        )}
        {closed.length > 0 && (
          <details>
            <summary className="v2-summary">결정된 제안 {closed.length}건 보기</summary>
            <div className="v2-stack v2-mt">
              {closed.map((p) => <PatternCard key={p.id} p={p} />)}
            </div>
          </details>
        )}
      </div>
    </details>
  )
}

/** claude-cli 전수검수 수정본(2026-09-25 남헌 결정 4). 원문은 위 ColumnBody 그대로, 여기는 수정본 + 요약 + 재승인. */
function RevisionBlock({ c }: { c: ColumnRow }) {
  if (!c.body_revised) return null
  const label = c.revision_status === 'approved' ? '수정본 채택' : c.revision_status === 'rejected' ? '원문 유지' : '재승인 대기'
  return (
    <details open={c.revision_status === 'pending'}>
      <summary className="v2-summary">
        수정본 펼치기 — {label} · {c.revised_by ?? '모델 미기재'}{c.revised_at ? ` · ${KST.format(new Date(c.revised_at))} KST` : ''}
      </summary>
      {c.revision_summary && <p className="v2-note v2-mt-sm">{c.revision_summary}</p>}
      <p className="v2-note">전/후 diff: reports/&lt;날짜&gt;/column-review/{c.slug}.diff · 파일: drafts/columns/_review/{c.slug}.revised.md</p>
      <pre className="v2-inset v2-pre v2-mt-sm">{c.body_revised}</pre>
      {c.revision_status === 'pending' && <RevisionForm id={c.id} />}
    </details>
  )
}

function ColumnCard({ c }: { c: ColumnRow }) {
  return (
    <Card>
      <div className="v2-stack">
        <div className="v2-chiprow">
          <ReviewBadge status={c.review_status} />
          <Badge tone="neutral" size="sm">독자: {c.reader_type}</Badge>
          <Badge tone={c.char_count > 8000 || c.char_count < 3000 ? 'danger' : 'neutral'} size="sm">{c.char_count.toLocaleString()}자</Badge>
          {c.verify_verdict
            ? <Badge tone="info" size="sm">검증: {c.verify_verdict.slice(0, 24)}{c.verify_verdict.length > 24 ? '…' : ''}</Badge>
            : <Badge tone="warning" size="sm">미검증 (.verify.md 없음)</Badge>}
          <span className="v2-note v2-mono v2-push">{c.source_path}</span>
        </div>
        <h3 className="v2-h3">{c.title}</h3>
        <p className="v2-note">slug: {c.slug} · 적재 {KST.format(new Date(c.staged_at))} KST</p>
        <ColumnBody body={c.body} />
        <RevisionBlock c={c} />
        <ThreadList threads={c.threads ?? []} />
        {c.review_status === 'draft' ? (
          <DecisionForm id={c.id} />
        ) : (
          <p className="v2-note">
            {REVIEW[c.review_status]?.label ?? c.review_status}
            {c.reviewed_by ? ` · ${c.reviewed_by}` : ' · 검수자 기록 없음'}
            {c.reviewed_at ? ` · ${KST.format(new Date(c.reviewed_at))} KST` : ''}
            {c.review_note ? ` · ${c.review_note}` : ''}
          </p>
        )}
      </div>
    </Card>
  )
}

// 제목·부제는 한 벌이다. 오류 화면과 정상 화면이 다른 문장을 쓰면 안 된다.
const HEADER = {
  title: '칼럼·스레드 검수',
  subtitle: 'drafts/columns/*.md 에 적립된 칼럼과 그 스레드를 사람이 보고 승인·반려한다. 결정 단위는 칼럼이다 — 스레드는 같이 승인된다.',
} as const

/** M2 v2 스코프 — 조기 반환 3곳과 정상 화면이 같은 껍데기를 쓴다. */
function Shell({ children }: { children: ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={960}>{children}</PageShell></div>
}

export default async function ColumnsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams
  const status = TABS.find((t) => t.key === sp.status)?.key ?? 'draft'
  const tabHref = (key: string) => (key === 'draft' ? '/columns' : `/columns?status=${key}`)

  const sb = await createClient()
  const header = <PageHeader {...HEADER} />

  if (!sb) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">칼럼을 조회하지 못했다. 검수할 칼럼이 없다는 뜻이 아니다.</Notice>
      </Shell>
    )
  }

  // 제안 조회는 칼럼 조회와 따로 본다 — 한쪽이 실패해도 다른 쪽 화면을 못 쓰게 만들지 않는다
  // (제안 테이블은 나중에 생긴 마이그레이션이라 미적용인 채로 칼럼 검수만 돌 수 있어야 한다).
  const [res, patternRes] = await Promise.all([
    sb.from('content_columns').select('*').order('staged_at', { ascending: false }),
    sb.from('column_review_patterns').select('*').order('evidence_count', { ascending: false }),
  ])

  // 테이블 자체가 없으면(마이그 미적용) 42P01/PGRST205 — 존재 확인은 GET 결과로,
  // head:true 로는 안 한다(빈 테이블도 존재하는 테이블도 204 를 주는 함정).
  const tableMissing = res.error && (res.error.code === '42P01' || res.error.code === 'PGRST205')
  if (tableMissing) {
    return (
      <Shell>
        {header}
        <Notice tone="warning" title="마이그레이션 미적용 — content_columns 테이블 없음">
          <code>supabase/migrations/20260916000001_content_columns.sql</code> 을 사람이 적용해야 이 화면이 데이터를 보여준다
          (<code>supabase db query --linked -f supabase/migrations/20260916000001_content_columns.sql</code>).
          적용 후 <code>node --env-file=.env.local scripts/column-stage.mjs</code> 로 <code>drafts/columns/</code> 를 이 화면에 올린다.
        </Notice>
      </Shell>
    )
  }
  if (res.error || !res.data) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — 조회 실패">
          {res.error?.message ?? '응답에 행이 없다'} · 검수할 칼럼이 없다는 뜻이 아니다.
        </Notice>
      </Shell>
    )
  }

  const all = res.data as ColumnRow[]
  const count = (key: string) => all.filter((c) => c.review_status === key).length
  const shown = all.filter((c) => c.review_status === status)
  const tabLabel = TABS.find((t) => t.key === status)?.label ?? status

  return (
    <Shell>
      <PageHeader
        {...HEADER}
        meta={<>전체 {all.length}건 · 미검증 {all.filter((c) => !c.verify_verdict).length}건 · 지금 보는 것은 {tabLabel} {shown.length}건</>}
        filters={
          <div className="v2-chiprow">
            {TABS.map((t) => (
              <FilterChip key={t.key} href={tabHref(t.key)} active={status === t.key} count={count(t.key)}>
                {t.label}
              </FilterChip>
            ))}
          </div>
        }
      />

      <FeedbackSection
        rows={(patternRes.data as PatternRow[] | null) ?? null}
        error={patternRes.error ? { code: patternRes.error.code, message: patternRes.error.message } : null}
      />

      <p className="v2-note">승인·반려 기록의 검수자에는 로그인한 계정 이메일이 남는다. 승인·반려해도 원본 파일(drafts/columns/*.md)은 바뀌지 않는다 — 정본은 파일이다.</p>

      {all.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact title="적재된 칼럼 0건" description="scripts/column-stage.mjs 를 실행하면 drafts/columns/ 의 칼럼이 여기 올라온다." />
        </Card>
      ) : shown.length === 0 ? (
        <Card padded={false}>
          {status === 'draft'
            ? <EmptyState compact title="검수 대기 0건 (조회는 정상)" description={`전체 칼럼 ${all.length}건이 모두 결정됐다.`} />
            : <EmptyState compact title={`${tabLabel} 0건 (조회는 정상)`} description={`전체 칼럼 ${all.length}건 중 이 상태인 칼럼이 없다.`} />}
        </Card>
      ) : (
        <div className="v2-stack">
          {shown.map((c) => <ColumnCard key={c.id} c={c} />)}
        </div>
      )}
    </Shell>
  )
}
