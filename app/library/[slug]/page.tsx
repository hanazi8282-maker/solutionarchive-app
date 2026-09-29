import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import {
  evidenceTally, gradeChecklist, groupEvidence, loadCaseDetail, metricTiles, pickLeadMove,
  detailTitle, type CaseDetail, type DetailEvidenceRow, type DetailMoveRow, type GradeCheckItem,
} from '@/lib/cases/detail'
import { displayGradeLabel, factCheckLabel } from '@/lib/cases/grade-display'
import { READER_PROBLEM_LABEL } from '@/lib/cases/draft'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'
import { PubBrandLogo, PubBrandLogoNotice } from '../../_pub/components/PubBrandLogo'
import { PubIndexRow } from '../../_pub/components/PubIndexRow'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { FACT, INSIGHT, PubGradeLegend, gradeSentence } from '../../_pub/components/PubGradeBadge'
import { PubStamp } from '../../_pub/components/PubStamp'
import { PubIconTile } from '../../_pub/components/PubIconTile'
import { Chip } from '../../_pub/components/Chip'
import { LogoImg } from '../../_ds/components/LogoImg'
import { faviconUrl } from '@/lib/cases/logo'
import {
  IconAction, IconApprove, IconArrowRight, IconCheck, IconChevronRight, IconEvidence, IconExternal, IconJudge, IconMinus, IconX,
} from '../../_pub/icons'
import { isSaved } from '@/lib/cases/saves'
import { FeedbackForm } from './feedback-form'
import { SaveButton } from './save-button'
import { ShareLinkButton } from './share-button'

// 공개 케이스 상세. **승인된 케이스만** 그린다 — 미승인·없는 slug 는 똑같이 404 다.
// 조회 실패는 404 로 접지 않는다(§7.1): "없다"와 "못 읽었다"는 다음 행동이 정반대다.
//
// 모양은 DESIGN.md §4 (남헌 2026-09-29 승인 목업 public-case-detail.html): 기록 머리(브랜드명 H1 +
// 요약 데크 + 2축 스탬프 + 신원 표) → 12칸 편집 격자 섹션(왼쪽 3칸 제목, 오른쪽 9칸 본문) →
// 관련 케이스 색인 줄 → 의견 → 하나의 다크 면(CTA 배너). 데이터·문구 규칙은 그대로고 렌더만 바뀌었다.
// 블록 7(VOC 인용)은 여전히 만들지 않았다 — 케이스와 리뷰를 잇는 깨끗한 키가 스키마에 없다.
//
// 이 화면은 읽기 전용이다. 쓰기는 ./actions.ts 의 피드백 INSERT 와 ./save-actions.ts 뿐이다.

export const dynamic = 'force-dynamic'

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const day = (v: string | null | undefined) => (v ? KST.format(new Date(v)) : null)

const OUTCOME_LABEL: Record<string, string> = {
  active: '영업 중', pivoted: '사업을 틀었다', shutdown: '문 닫았다', unknown: '확인 불가',
}

/** 공개 카피에 em 대시를 내지 않는다(DESIGN.md §5). lib 의 문장은 그대로 두고 렌더에서만 푼다. */
const noDash = (s: string) => s.replace(/\s[—–]\s/g, '. ')

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sb = await createClient()
  if (!sb) return { title: '케이스' }
  const res = await loadCaseDetail(sb, slug, 'library/[slug]/metadata')
  if (res.status !== 'ok') return { title: '케이스' }
  return {
    title: detailTitle(res.detail.study),
    description: res.detail.study.summary ?? undefined,
  }
}

/**
 * 섹션 한 벌 — 왼쪽 제목·설명(≥1024 sticky), 오른쪽 본문.
 * wide = 제목 위, 본문 12칸 전폭(무브 카드 3열 격자가 9칸 안에서는 360px 를 못 지킨다, B3-5b).
 */
function Sec({ id, title, lead, children, last, wide }: { id: string; title: string; lead?: string; children: React.ReactNode; last?: boolean; wide?: boolean }) {
  return (
    <section className={['pub-sheet', 'pub-sec', last ? 'pub-sec--last' : '', wide ? 'pub-sec--wide' : ''].filter(Boolean).join(' ')} id={id}>
      <div className="pub-sec-head">
        <h2 className="pub-sec-title">{title}</h2>
        {lead ? <p className="pub-sec-lead">{lead}</p> : null}
      </div>
      <div className="pub-sec-main">{children}</div>
    </section>
  )
}

/** 등급 근거 한 줄 — 판정색은 아이콘에만. 필수 항목 미달은 엑스, 선택 항목 없음은 대시. */
function CheckRow({ item }: { item: GradeCheckItem }) {
  const v = item.pass ? 'pos' : item.required ? 'neg' : 'none'
  const Icon = v === 'pos' ? IconCheck : v === 'neg' ? IconX : IconMinus
  const detail = noDash(item.detail)
  // "137자" 처럼 짧은 수치는 오른쪽 열에, 문장은 제목 아래 작은 글자로.
  const short = detail.length <= 14 && !detail.includes('.')
  return (
    <li>
      <span className="pub-checks-v" data-v={v}><Icon /></span>
      <span className="pub-checks-t">
        {noDash(item.label).replace('(transfer_note)', '')}
        {short ? null : <small>{detail}</small>}
      </span>
      <span className="pub-checks-n">{short ? detail : item.pass ? '통과' : item.required ? '미달' : '해당 없음'}</span>
    </li>
  )
}

/**
 * 근거 1건(B3-6). 파비콘 + 도메인(원문 링크) · 종류 칩 · 게시일, 그 아래 인용 3줄.
 * 인용은 DB 에서 이미 300자로 잘려 오고 화면은 3줄에서 자른다 — 전문은 원문 링크가 정본이다.
 * 파비콘은 `evidence` 아이콘 위에 겹쳐 그린다: 이미지가 실패하면(LogoImg 가 사라지면) 아이콘이 보여 빈 칸이 없다.
 */
function EvidenceRow({ e }: { e: DetailEvidenceRow }) {
  const kind = e.is_regulatory_filing ? '법정 공시' : e.is_estimate ? '추정치' : e.is_self_reported ? '당사자 자기보고' : null
  const fav = faviconUrl(e.domain ?? e.url)
  return (
    <li>
      <div className="pub-evid-meta">
        <span className="pub-evid-fav" aria-hidden="true"><IconEvidence />{fav ? <LogoImg src={fav} width={16} height={16} /> : null}</span>
        <a className="pub-evid-src" href={e.url} target="_blank" rel="noreferrer noopener" title={e.url}>
          <b>{e.domain ?? '도메인 미기재'}</b><IconExternal /><span className="pub-sr">원문, 새 창</span>
        </a>
        {kind ? <Chip>{kind}</Chip> : null}
        <span>{day(e.published_at) ? `게시 ${day(e.published_at)}` : '게시일 확인 불가'}</span>
      </div>
      {e.snippet ? <blockquote>&ldquo;{e.snippet}&rdquo;</blockquote> : <p className="pub-caption">인용 미기재</p>}
    </li>
  )
}

/** 무브 한 장 — 번호·레버·시점·스탬프, 무엇을 했나·전제·내일 할 행동. 화살표 대신 번호가 순서를 말한다. */
function MoveCard({ move, index }: { move: DetailMoveRow; index: number }) {
  const from = day(move.observed_period_start)
  const to = day(move.observed_period_end)
  const when = from ? (to && to !== from ? `${from} ~ ${to}` : from) : '확인 불가'
  const pre = (move.preconditions ?? '').trim()
  const note = (move.transfer_note ?? '').trim()
  return (
    <article className="pub-move">
      <div className="pub-move-head">
        <span className="pub-move-k">무브 <b>{index + 1}</b></span>
        <span className="pub-move-k">레버 <b>{move.lever}</b></span>
        <span className="pub-move-k">시점 <b>{when}</b></span>
        <PubStamp move={move} size="sm" />
      </div>
      {/* 3열(≥1024) — 열 머리마다 아이콘 타일, 행동 열만 액센트 면(B3-5b). dt/dd 짝을 div 로 묶는 건 HTML 표준이 허용한다. */}
      <dl className="pub-move-cols">
        <div className="pub-move-col">
          <dt><PubIconTile icon={<IconAction />} size={32} />무엇을 했나</dt>
          <dd>{move.claim}</dd>
        </div>
        <div className="pub-move-col">
          <dt><PubIconTile icon={<IconJudge />} size={32} />전제</dt>
          {/* 미기재를 "전제 없음"으로 쓰지 않는다 — 이 축엔 "없음"이라는 양성 값이 없다(§7.1). */}
          {pre ? <dd>{pre}</dd> : <dd className="muted">미기재. 무엇이 있어야 옮길 수 있는지 아직 안 적혔다.</dd>}
        </div>
        <div className="pub-move-col pub-move-col--act">
          <dt><PubIconTile icon={<IconApprove />} size={32} tone="lilac" />내일 할 행동</dt>
          {note ? <dd className="act">{note}</dd> : <dd className="muted">안 적혀 있다. 사실이 맞아도 지금 가져갈 게 없다(인사이트 등급 D).</dd>}
        </div>
      </dl>
    </article>
  )
}

/** 저장 상태 — 서버가 읽어 초기값으로 내려 준다. `unavailable` 은 "저장 안 됨"이 아니다(§7.1). */
type SaveView = { saved: boolean; unavailable: string | null }

function Detail({ d, signedIn, save }: { d: CaseDetail; signedIn: boolean; save: SaveView }) {
  const s = d.study
  const lead = pickLeadMove(d.moves)
  const leadEvidence = lead ? (d.evidence_by_move.get(lead.id) ?? []) : []
  const checklist = gradeChecklist(lead, leadEvidence.length > 0 ? leadEvidence : d.evidence)
  const tiles = metricTiles(d.moves, d.evidence_by_move)
  const groups = groupEvidence(d.evidence)
  const reviewedOn = day(s.reviewed_at)
  const period = [day(s.period_start), day(s.period_end)].filter(Boolean).join(' ~ ')
  const levers = [...new Set(d.moves.map((m) => m.lever))]
  const insight = displayGradeLabel(lead)
  const fact = factCheckLabel(lead)
  const selfCount = d.evidence.filter((e) => e.is_self_reported).length
  // 비로그인은 /cases/search(로그인 벽)로 보내지 않는다 — 같은 문제 유형의 공개 라이브러리 필터가
  // 공개 등가물이다(MVP 9/30 §7.1, /library 가 이미 problem= 을 받는다).
  const problemHref = signedIn
    ? (s.reader_problem ? `/cases/search?problem=${encodeURIComponent(s.reader_problem)}` : '/cases/search')
    : (s.reader_problem ? `/library?problem=${encodeURIComponent(s.reader_problem)}` : '/library')

  return (
    <>
      {/* ── 기록 머리: 제목·데크·CTA / 스탬프·판정 메모 / 신원 표. DOM 순서 = 모바일 순서. ── */}
      <section className="pub-sheet pub-head">
        <div className="pub-head-body">
          <h1 className="pub-head-title">{s.brand_name ?? detailTitle(s)}</h1>
          {s.summary
            ? <p className="pub-deck">{noDash(s.summary)}</p>
            : <p className="pub-deck pub-caption">한 줄 요약이 아직 없다.</p>}
          <div className="pub-actions">
            <PubButtonLink href={problemHref} variant="primary">내 상황으로 옮기기<IconArrowRight /></PubButtonLink>
            <SaveButton caseStudyId={s.id} slug={s.slug} signedIn={signedIn} initialSaved={save.saved} unavailable={save.unavailable} />
            <ShareLinkButton />
          </div>
        </div>
        <div className="pub-head-verdict">
          <PubStamp move={lead} />
          <p className="pub-verdict-note">
            <b>인사이트 {insight}</b> {gradeSentence(INSIGHT, insight) ?? '대표 무브에 등급이 아직 없다'}<br />
            <b>사실확인 {fact}</b> {gradeSentence(FACT, fact) ?? '사실확인 등급이 아직 없다'}
            {d.evidence.length > 0 ? `. 근거 ${d.evidence.length}건, 자기보고 ${selfCount}건` : '. 근거 0건'}<br />
            {/* "사람 검토 완료" 는 검수자·시각이 둘 다 있을 때만. 검수자 신원은 공개 화면에 내지 않는다(2026-09-28). */}
            {s.reviewed_by && reviewedOn ? <>사람 검토 완료 <b>{reviewedOn}</b></> : '검토 기록 미기재 (승인은 됐다)'}
          </p>
        </div>
        <div className="pub-head-id">
          <PubBrandLogo study={s} size="md" />
          {/* 신원 = 2열 칩 격자(B3-5c). 긴 값(문제 유형·기간)은 두 칸을 쓴다. */}
          <dl className="pub-recchips">
            <div className="pub-recchip pub-recchip--wide"><dt>문제 유형</dt><dd>{s.reader_problem ? (READER_PROBLEM_LABEL[s.reader_problem] ?? s.reader_problem) : '미지정'}</dd></div>
            <div className="pub-recchip"><dt>병목</dt><dd>{s.bottleneck ?? '미기재'}</dd></div>
            <div className="pub-recchip"><dt>지금</dt><dd>{OUTCOME_LABEL[s.outcome_status ?? 'unknown'] ?? s.outcome_status}</dd></div>
            <div className="pub-recchip pub-recchip--wide"><dt>레버</dt><dd>{levers.length ? levers.join(', ') : '미기재'}</dd></div>
            <div className="pub-recchip pub-recchip--wide"><dt>기간</dt><dd>{period || '확인 불가'}</dd></div>
          </dl>
        </div>
      </section>

      {d.logo_columns === 'missing' && (
        <Panel tone="alert" title="로고 컬럼 미적용">
          <p className="pub-text">마이그레이션 20260930000001 이 아직 적용되지 않아 브랜드 로고를 읽지 못했다. 로고가 없는 것이 아니라 확인 불가다. 지금은 이니셜을 그린다.</p>
        </Panel>
      )}
      {d.excluded_moves > 0 && (
        <p className="pub-caption">이 케이스의 무브 {d.moves.length + d.excluded_moves}개 중 {d.excluded_moves}개는 아직 승인 전이라 이 화면에 없다.</p>
      )}

      <div>
        {/* ── 왜 이 등급인가 ── */}
        <Sec id="grade" title="왜 이 등급인가"
          lead={lead ? `대표 무브(${lead.lever}) 기준. 합계 점수는 만들지 않는다.` : '승인된 무브가 없어 항목을 셀 수 없다.'}>
          <ul className="pub-checks">
            {checklist.map((item) => <CheckRow key={item.key} item={item} />)}
          </ul>
          <PubGradeLegend />
          <p className="pub-caption">
            산식 정본은 <Link className="pub-link" href="/library/methodology">방법론 페이지</Link>(사실확인) ·{' '}
            <code className="pub-code">lib/cases/draft.ts gradeMove</code>(인사이트) 이고, 재채점으로 바뀐다.
          </p>
        </Sec>

        {/* ── 수치 ── */}
        <Sec id="metrics" title="수치" lead="무브가 적은 지표의 전후. 이름과 단위가 있는 수치만 싣는다.">
          {tiles.length === 0 ? (
            <PubEmpty compact title="수치가 적힌 무브가 0건 (조회는 정상)"
              description="서술만 있는 케이스다. 없는 숫자를 만들지 않는다. 인사이트 등급은 수치와 별개 축이다." />
          ) : (
            <table className="pub-metric">
              <thead><tr><th>지표</th><th>전</th><th><span className="pub-sr">방향</span></th><th>후</th></tr></thead>
              <tbody>
                {tiles.map((t) => (
                  <tr key={`${t.move_id}-${t.name}`}>
                    <td className="name">{t.name}{t.estimate_only ? ' (추정)' : ''}{t.no_evidence ? ' (근거 0건)' : ''}</td>
                    <td className="num">{t.before == null ? '?' : t.before.toLocaleString('ko-KR')}<small>{t.unit}</small></td>
                    <td className="arrow"><IconArrowRight /></td>
                    <td className="num">{t.after.toLocaleString('ko-KR')}<small>{t.unit}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sec>

        {/* ── 무엇을 했나 ── */}
        <Sec id="moves" wide title="무엇을 했나" lead={`승인된 무브 ${d.moves.length}개. 순서는 인과가 아니라 시간이다.`}>
          {d.moves.length === 0
            ? <p className="pub-caption">승인된 무브가 0개다. 케이스는 승인됐지만 무브 승인이 아직 없다.</p>
            : d.moves.map((m, i) => <MoveCard key={m.id} move={m} index={i} />)}
        </Sec>

        {/* ── 근거 ── */}
        <Sec id="evidence" title="근거"
          lead={d.evidence.length > 0
            ? `${d.evidence.length}건, ${evidenceTally(d.evidence)}. 2차 보도와 추정치는 독립 확인으로 세지 않는다.`
            : '근거 행이 없다. 조회는 정상이다.'}>
          {groups.map((g) => (
            <div key={g.key} className="pub-evid-group">
              <p className="pub-caption"><b>{g.label} {g.rows.length}건</b> {noDash(g.note)}</p>
              <ol className="pub-evid">
                {g.rows.map((e) => <EvidenceRow key={e.id} e={e} />)}
              </ol>
            </div>
          ))}
        </Sec>

        {/* ── 갈린 사례 · 실패 경고 ── */}
        <Sec id="split" title="갈린 사례" lead={noDash(d.splits_reason)}>
          {d.splits.length === 0 ? (
            <PubEmpty compact title="이 케이스와 갈린 짝이 0묶음 (조회는 정상)"
              description="같은 병목·레버로 반대 결과가 승인된 다른 케이스가 아직 없다. 없는 것을 비슷한 사례로 채우지 않는다." />
          ) : d.splits.map((sp) => (
            <div key={sp.ours.id}>
              <p className="pub-caption">{sp.bottleneck} · {sp.lever}</p>
              <ul className="pub-split">
                <li className="pub-split--this">
                  <span className="pub-split-who">{s.brand_name ?? '이 케이스'}<small>이 케이스는 {sp.ours.outcome_direction === 'positive' ? '됐다' : '안 됐다'}</small></span>
                  <span className="pub-split-what">{sp.ours.claim}</span>
                </li>
                {sp.others.map((o) => (
                  <li key={o.move.id}>
                    <span className="pub-split-who">
                      <Link className="pub-link" href={`/library/${o.study.slug}`}>{o.study.brand_name}</Link>
                      <small>{o.move.outcome_direction === 'positive' ? '됐다' : '안 됐다'}</small>
                    </span>
                    <span className="pub-split-what">{o.move.claim}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <details className="pub-fold">
            <summary><IconChevronRight />이 소구점으로 망한 적 있나 {d.failed_angles.status !== 'not_run' ? `(실패 앵글 ${d.failed_angles.cards.length}건)` : ''}</summary>
            <div className="pub-fold-body">
              <p className="pub-caption">실패 앵글 원장에서 이 케이스의 요약·주장과 낱말이 겹치는 행. 겹친 낱말이 근거는 아니다.</p>
              {d.failed_angles.status === 'not_run' ? (
                <p className="pub-text">찾지 못했다. {noDash(d.failed_angles.reason)}</p>
              ) : d.failed_angles.cards.length === 0 ? (
                <PubEmpty compact title="겹치는 실패 기록이 0건 (조회는 정상)" description={noDash(d.failed_angles.reason)} />
              ) : (
                <ul className="pub-angles">
                  {d.failed_angles.cards.map((c) => (
                    <li key={c.case_key}>
                      <b>{c.product_category} ({c.source_tier}{c.is_estimate ? ', 추정' : ''}{c.low_confidence ? ', 신뢰도 낮음' : ''})</b>
                      {c.claimed_angle} 결과: {c.outcome}
                      <span className="pub-caption">
                        겹친 낱말 {c.matched_terms.map((t) => `“${t}”`).join(', ')}
                        {c.low_confidence && '. 낱말 하나로 걸렸다. 우연인지 직접 확인하라.'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </Sec>

        {/* ── 관련 케이스: 색인 줄 ── */}
        <Sec id="related" title="관련 케이스" lead="같은 문제 유형이 먼저다. 3장을 못 채우면 비슷한 것으로 메우지 않는다.">
          {d.related.length === 0 ? (
            <PubEmpty compact title="관련 케이스 0건 (조회는 정상)"
              description="같은 문제 유형·병목·종류로 승인 무브가 있는 다른 케이스가 아직 없다." />
          ) : (
            <>
              <ul className="pub-index">
                {d.related.map((r) => (
                  <PubIndexRow key={r.study.id} study={r.study} move={r.move} moveCount={r.move_count} reason={r.reason} />
                ))}
              </ul>
              <PubBrandLogoNotice />
            </>
          )}
          <p className="pub-caption"><Link className="pub-link" href="/library">케이스 라이브러리로</Link></p>
        </Sec>

        {/* ── 의견 ── */}
        <Sec id="feedback" title="의견 남기기" lead="로그인 없이, 케이스 1건당 하루 1번. 집계는 화면에 내지 않는다." last>
          <FeedbackForm caseStudyId={s.id} />
        </Sec>
      </div>

      {/* ── 이 페이지의 유일한 다크 면 ── */}
      <Panel tone="dark">
        <div>
          <h2 className="pub-panel-title">같은 곳에 막혀 있다면, 내 문제로 검색해 보라.</h2>
          <p className="pub-text">승인된 케이스와 무브만 나온다. 없으면 없다고 말한다.</p>
        </div>
        <div className="pub-actions">
          <PubButtonLink href={problemHref} variant="primary">내 문제로 검색하기<IconArrowRight /></PubButtonLink>
          {!signedIn && <PubButtonLink href="/" variant="ghost">베타 신청</PubButtonLink>}
        </div>
      </Panel>
    </>
  )
}

export default async function LibraryCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sb = await createClient()
  if (!sb) {
    return (
      <PubShell theme="light">
        <Hero title="케이스" />
        <Panel tone="alert" title="확인 불가. Supabase 환경변수 미설정">
          <p className="pub-text">케이스를 읽지 못했다. 이 케이스가 없다는 뜻이 아니다.</p>
        </Panel>
      </PubShell>
    )
  }

  const res = await loadCaseDetail(sb, slug)
  if (res.status === 'error') {
    return (
      <PubShell theme="light">
        <Hero title="케이스" />
        <Panel tone="alert" title="확인 불가. 케이스 조회 실패">
          <p className="pub-text">{res.reason} · 404 로 접지 않는다. 다시 시도해도 같으면 로그를 봐야 한다.</p>
        </Panel>
      </PubShell>
    )
  }
  if (res.status === 'not_found') notFound()

  // 로그인 여부는 **표시용**이다(피드백·저장 가드는 서버 액션이 스스로 한다).
  const verdict = await getAuthVerdict()

  // 저장 여부는 로그인한 사람에게만 묻는다. 못 읽었으면 "저장 안 됨"이 아니라 사유를 넘긴다 —
  // 마이그 20260930000002 미적용 상태에서 버튼이 눌리는 것처럼 보이면 안 된다(§7.1).
  const saveState = verdict.kind === 'allowed' ? await isSaved(sb, res.detail.study.id, verdict.email) : null
  const save = {
    saved: saveState?.state === 'saved',
    unavailable: saveState?.state === 'unavailable' ? saveState.reason : null,
  }

  return (
    <PubShell theme="light">
      <Detail d={res.detail} signedIn={verdict.kind === 'allowed'} save={save} />
    </PubShell>
  )
}
