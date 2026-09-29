import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { BATCH_SIZE, DEFAULT_QUOTA, STRATA, STRATUM_LABEL, kstDate, pickBatch, type Batch, type FeedbackRow } from '@/lib/relevance-feedback/sample'
import { feedbackTableState, loadAllVerdicts, loadBackgrounds, loadTranslations } from '@/lib/relevance-feedback/db'
import { TRANSLATIONS_MIGRATION, parseSourceContext } from '@/lib/relevance-feedback/translate'
import { ButtonLink } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { EmptyState } from '../../_ds/components/EmptyState'
import { Notice, PageShell } from '../../_ds/components/Shell'
import { RelevanceCard, type CardContext, type Revealed } from './relevance-card'
import { GradeKeys } from './grade-keys'
import { IconChevronRight } from './icons'

export const dynamic = 'force-dynamic'
export const metadata = { title: '관련성 채점' }

// 읽기만 한다. 쓰기는 ../actions.ts 의 gradeRelevance 하나. 표본 선택은 lib/relevance-feedback/sample.ts(순수, 셀프테스트).
// 번역·제품 배경·스레드 제목은 캐시(000036)에서 읽기만 한다 — 만드는 것은 scripts/relevance-translate.mjs(야간 배치). 없으면 "준비 중".
// ⛔ 카드로 넘기는 맥락(CardContext)에 판정 계열 값을 싣지 않는다 — 번역·배경은 순수 사실 문자열뿐이다(채점 독립성).
//
// 모양은 DESIGN.md §4 작업대(남헌 09-29 승인 목업): sticky 툴바(진행 n/m · 단축키) → 묶음 메모 → 카드 목록. 데이터·문구 규칙은 그대로다.

const KEYS: [string, string][] = [['1', '관련'], ['2', '무관'], ['3', '모름'], ['4', '정보있음'], ['5', '정보없음'], ['Enter', '저장'], ['J', '다음'], ['K', '이전'], ['U', '되돌리기']]

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <header className="v2-bar">
      <h1>관련성 채점</h1>
      <div className="v2-prog" aria-live="polite">
        <span className="v2-prog-n">{done}<small>/{total}</small></span>
        <progress className="v2-prog-track" value={done} max={Math.max(total, 1)} aria-label={`오늘 ${done}/${total}장 채점`} />
      </div>
      <div className="v2-keys" aria-label="단축키">
        {KEYS.map(([k, l], i) => (
          <span key={k}>
            {(i === 3 || i === 5) && <span className="v2-keys-sep" aria-hidden="true" />}
            <kbd className="v2-kbd">{k}</kbd>{l}
          </span>
        ))}
      </div>
      <ButtonLink href="/relevance/feedback">기준 피드백 요약</ButtonLink>
    </header>
  )
}

function Shell({ done = 0, total = 0, children }: { done?: number; total?: number; children: ReactNode }) {
  return (
    <div className="sa-v2">
      <PageShell maxWidth={1180}>
        <Bar done={done} total={total} />
        {children}
      </PageShell>
    </div>
  )
}

const KO: Record<string, string> = { relevant: '관련', irrelevant: '무관', unknown: '모름' }
const ko = (v: string | null | undefined) => (v ? KO[v] ?? v : '판정 없음')
const inf = (v: boolean | null | undefined) => (v === true ? '정보있음' : v === false ? '정보없음' : '판정 없음')

export default async function RelevanceGradePage() {
  const sb = await createClient()
  if (!sb) return <Shell><Notice tone="danger" title="확인 불가. Supabase 환경변수 미설정">채점할 카드가 없다는 뜻이 아니다.</Notice></Shell>

  const loaded = await loadAllVerdicts(sb)
  if ('error' in loaded) return <Shell><Notice tone="danger" title="확인 불가. 판정 조회 실패">{loaded.error} · 채점할 카드가 없다는 뜻이 아니다.</Notice></Shell>

  const today = kstDate(new Date().toISOString()) ?? ''
  // 원문이 폐기된 행(raw_text 없음)은 채점할 게 없다 — 빼고 다시 뽑는다. 세 번이면 충분하다(빈 원문은 드물다).
  const exclude = new Set<string>()
  const texts = new Map<string, string>()
  const sourceKeys = new Map<string, string | null>()
  let batch: Batch = pickBatch(loaded.rows, { today })
  for (let round = 0; round < 3; round++) {
    const ids = batch.items.map((i) => i.row.input_id).filter((id) => !texts.has(id))
    if (ids.length === 0) break
    const { data, error } = await sb.from('analysis_inputs').select('id, raw_text, source_key').in('id', ids)
    if (error) return <Shell><Notice tone="danger" title="확인 불가. 원문 조회 실패">{error.message}</Notice></Shell>
    for (const r of data ?? []) if ((r.raw_text ?? '').trim()) { texts.set(r.id, r.raw_text); sourceKeys.set(r.id, r.source_key ?? null) }
    const empty = ids.filter((id) => !texts.has(id))
    if (empty.length === 0) break
    empty.forEach((id) => exclude.add(id))
    batch = pickBatch(loaded.rows, { today, exclude })
  }
  const items = batch.items.filter((i) => texts.has(i.row.input_id))

  const projectIds = [...new Set(items.map((i) => i.row.project_id).filter((v): v is string => !!v))]
  const { data: projects } = projectIds.length
    ? await sb.from('analysis_projects').select('id, product_elevator_pitch').in('id', projectIds)
    : { data: [] as { id: string; product_elevator_pitch: string | null }[] }
  const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s)
  const projectOf = new Map((projects ?? []).map((p) => [p.id, clip(p.product_elevator_pitch ?? '(소개 없음)')]))

  const noteState = await feedbackTableState(sb)
  const [translations, backgrounds] = await Promise.all([
    loadTranslations(sb, items.map((i) => i.row.input_id)),
    loadBackgrounds(sb, projectIds),
  ])
  // 번역이 없을 때의 이유 — 0건("준비 중")과 못 읽음·미적용을 가른다(§7.1).
  // 마이그 번호만 짧게 — 파일명 전체(20260930000036_relevance_translations.sql)는 좁은 칸을 넘친다. 다른 안내(000031·000032)와 같은 꼴.
  const migNo = TRANSLATIONS_MIGRATION.slice(8, 14)
  const cacheNote = translations.state === 'missing' ? `번역 저장소 미적용 (마이그 ${migNo} 전)`
    : translations.state === 'unknown' ? `번역 저장소 확인 불가 (${translations.error})` : null
  const bgCacheNote = backgrounds.state === 'missing' ? `제품 배경 저장소 미적용 (마이그 ${migNo} 전)`
    : backgrounds.state === 'unknown' ? `제품 배경 저장소 확인 불가 (${backgrounds.error})` : null
  const contextOf = (inputId: string, projectId: string | null): CardContext => {
    const raw = texts.get(inputId) ?? ''
    const src = parseSourceContext(sourceKeys.get(inputId), raw)
    const tr = translations.state === 'present' ? translations.rows.get(inputId) ?? null : null
    const bg = backgrounds.state === 'present' ? backgrounds.rows.get(projectId ?? '') ?? null : null
    const translationNote = cacheNote ? `${cacheNote}. 원문으로 채점한다.`
      : !tr ? '번역 준비 중. 야간 배치가 만든다. 원문으로 채점한다.'
      : tr.status === 'failed' ? '번역을 싣지 않았다. 호출이 실패했거나 사후검사(요약·해설·평가 문구)에 걸렸다. 원문으로 채점한다.'
      : tr.status === 'skipped' ? '원문이 한국어라 번역하지 않았다.' : null
    const backgroundNote = bgCacheNote ? `${bgCacheNote}.`
      : !bg ? '제품 배경 준비 중. 야간 배치가 만든다.'
      : bg.status === 'failed' ? '제품 배경을 싣지 않았다. 호출이 실패했거나 사후검사에 걸렸다.'
      : bg.status === 'skipped' ? '제품 소개가 비어 있어 배경을 만들지 않았다.' : null
    const thread = src.threadKey || src.threadTitle || src.threadRef
      ? { title: src.threadTitle, titleKo: tr?.thread_title_ko ?? null, ref: src.threadRef }
      : null
    return { background: bg?.status === 'ok' ? bg.background : null, backgroundNote: bg?.status === 'ok' ? null : backgroundNote, translation: tr?.status === 'ok' ? tr.text_ko : null, translationNote: tr?.status === 'ok' ? null : translationNote, thread }
  }
  const done = items.filter((i) => i.row.human_verdict != null).length
  const a = batch.availability
  const unavailable = STRATA.filter((s) => !batch.strata[s].available)

  const reveal = (r: FeedbackRow, s: (typeof STRATA)[number]): Revealed => ({
    stratum: `층 ${STRATUM_LABEL[s]}`,
    human: `내 판정 ${ko(r.human_verdict)}${r.human_product_informative == null ? '' : ` · ${inf(r.human_product_informative)}`}`,
    lines: [`모델 1차 ${ko(r.verdict)} · 2차 ${ko(r.second_verdict)}`, ...(a.informative ? [`제품 정보 1차 ${inf(r.product_informative)} · 2차 ${inf(r.second_product_informative)}`] : [])],
  })

  return (
    <Shell done={done} total={items.length}>
      <GradeKeys />
      <div className="v2-batch">
        <p className="v2-text v2-text--muted">
          {today || '날짜 확인 불가'} 묶음 {BATCH_SIZE}장. 네 층(자동승인 통과 · 관련이지만 정보 없음 · 1차·2차 불일치 · 둘 다 무관)에서 섞어 뽑았다. 모델 판정과 층은 저장한 뒤에 보인다.
        </p>
        <details className="v2-fold">
          <summary><IconChevronRight />층별 배분</summary>
          <table aria-label="층별 배분">
            <thead><tr><th scope="col">층</th>{STRATA.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">기본 배분</th>{STRATA.map((s) => <td key={s}>{DEFAULT_QUOTA[s]}</td>)}</tr>
              <tr><th scope="row">오늘 뽑음</th>{STRATA.map((s) => <td key={s}>{batch.strata[s].picked}</td>)}</tr>
            </tbody>
          </table>
          <p className="v2-note v2-fold-body">{STRATA.map((s) => STRATUM_LABEL[s]).join(' · ')}.<br />층이 모자라면 다른 층에서 채운다. 같은 날엔 같은 묶음이다. <span className="v2-mono" translate="no">seed = KST 날짜 · pickBatch</span></p>
        </details>
      </div>
      {unavailable.length > 0 && (
        <p className="v2-note v2-flag">
          확인 불가 층: {unavailable.map((s) => STRATUM_LABEL[s]).join(', ')}.{' '}
          {a.second === null ? '판정 행이 0건이라 컬럼이 있는지 모른다' : a.second === false ? '2차 판정 컬럼 미적용 (마이그 000027 전)' : '제품 정보 컬럼 미적용 (마이그 000031 전)'}. 0건이 아니라 가르지 못한 것이다.
        </p>
      )}
      {(cacheNote || bgCacheNote) && <p className="v2-note v2-flag">{[cacheNote, bgCacheNote].filter(Boolean).join(' · ')}.{cacheNote ? ' 원문으로 채점한다.' : ''}</p>}

      {items.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact title="오늘 채점할 카드 0장 (조회는 정상)" description={`판정 ${loaded.rows.length}행 가운데 네 층 어디에 들면서 아직 채점하지 않은 글이 없다.`} />
        </Card>
      ) : (
        <div className="v2-stack-lg">
          {items.map(({ row, stratum }, i) => (
            <RelevanceCard
              key={row.input_id}
              n={i + 1}
              total={items.length}
              inputId={row.input_id}
              project={projectOf.get(row.project_id ?? '') ?? '(프로젝트 미상)'}
              text={parseSourceContext(sourceKeys.get(row.input_id), texts.get(row.input_id) ?? '').body}
              context={contextOf(row.input_id, row.project_id ?? null)}
              informativeReady={a.informative === true}
              noteState={noteState}
              revealed={row.human_verdict != null ? reveal(row, stratum) : null}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}
