import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { impactFrequencyTags } from '@/lib/analysis/relevance-judge'
import { EXCERPT_MAX, LEVEL_LABEL, SIGNAL_LABEL, UUID, loadCard } from '@/lib/signals/feed'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { QUERY_MAX, parseSearchQuery, searchMoves } from '@/lib/cases/search'
import { toTerms } from '@/lib/cases/advisor'
import { REPORT_TIER } from '@/lib/cases/report-tier'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Section } from '../../_pub/components/Section'
import { Panel } from '../../_pub/components/Panel'
import { Chip } from '../../_pub/components/Chip'
import { PubButtonLink } from '../../_pub/components/Button'
import { PubMatchRow } from '../../_pub/components/PubMatchRow'
import { judgedOn } from '../../_pub/components/PubSignalCard'
import { IconArrowRight, IconExternal } from '../../_pub/icons'

/**
 * VOC 1건 상세(페인 카드, BigIdeasDB 레퍼런스 — competitor-feature-analysis.md:87 · §F 7).
 * 남헌 2026-09-25 위임 B항. 익명 공개(PUBLIC_EXACT `/voc/card`, 2026-10-01 `/signals/card` 에서 개명) —
 * id 는 경로가 아니라 질의(`?id=`)다. 경로에 두면 `/voc/*` 접두사 공개가 필요해지고, 그러면 그 아래 새 화면이 전부 자동으로 열린다.
 *
 * 2026-10-01 재설계(남헌): **판정 사유 전문 → 발췌 → 라벨 → 유사 사례 → 출처.**
 *   원문 전체는 싣지도 새로 저장하지도 않는다 — 발췌 EXCERPT_MAX 자는 그대로다(스크래핑 콘텐츠 재게시 회피).
 *   전문이 필요하면 출처 링크로 보낸다. 주소를 되살릴 수 없는 소스는 출처 이름만 적는다(lib/signals/feed.ts sourceLinkOf).
 *   유사 사례 = 판정 사유를 `/cases/report` 와 같은 낱말 매칭(searchMoves, LLM 0)에 넣은 승인 SaaS 무브.
 *   리뷰를 케이스에 잇는 키는 여전히 없다 — 그래서 "같은 문제"가 아니라 "낱말이 겹친 사례"로 말하고, 익명 상한(REPORT_TIER.anon)만큼만 싣는다.
 *
 * 공개 대상이 아닌 행(무관·폐기·없음·형식 밖 id)은 똑같이 404 다. 조회 실패는 404 로 접지 않는다(§7.1).
 * 라벨은 3상태로 적는다: 값 / "모름"(NULL). NULL 을 '보통'·'없음'으로 접지 않는다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'VOC 1건 — 페인 카드',
  description: '관련 판정을 받은 리뷰 1건의 판정 사유·발췌·VOC 유형 라벨·유사 사례·출처.',
}

const level = (v: keyof typeof LEVEL_LABEL | null) => (v ? LEVEL_LABEL[v] : '모름 (라벨 없음)')
const SIMILAR_MAX = REPORT_TIER.anon.moves

export default async function SignalCardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = (await searchParams).id
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id || !UUID.test(id)) notFound()

  const sb = await createClient()
  const result = sb ? await loadCard(sb, id) : null
  if (result?.status === 'ok' && !result.item) notFound()
  const it = result?.status === 'ok' ? result.item : null
  const tags = it ? impactFrequencyTags(it) : []

  // 유사 사례 — 판정 사유가 있고 낱말이 나올 때만 찾는다. 못 찾은 이유는 한 줄로 적는다(§7.1).
  const q = it?.reason ? it.reason.slice(0, QUERY_MAX) : null
  const similar = !it ? null
    : !q ? { none: '판정 사유가 없어 찾을 낱말이 없다' }
    : toTerms(q).length === 0 ? { none: '판정 사유에서 매칭할 낱말을 뽑지 못했다' }
    : sb ? await (async () => {
      const corpora = await loadCaseCorpus(sb, 'voc/card')
      const r = searchMoves(parseSearchQuery({ q, kind: 'saas' }).query, corpora)
      return { r, studies: new Map((corpora.studies ?? []).map((s) => [s.id, s])) }
    })()
    : { none: 'Supabase 환경변수 미설정 — 확인 불가' }
  const report = q ? `/cases/report?${new URLSearchParams({ q })}` : null

  return (
    <PubShell theme="light">
      <Hero
        variant="detail"
        eyebrow="PAIN CARD"
        title={it ? `VOC 1건 — ${it.community_signal ? SIGNAL_LABEL[it.community_signal] : 'VOC 유형 라벨 없음'}` : 'VOC 1건'}
        meta={it ? (
          <div className="pub-chiprow">
            {tags.map((t) => <Chip key={t}>{t}</Chip>)}
            {it.wtp_mentioned === true ? <Chip>지불 의사 언급</Chip> : null}
            <Chip>{it.source_name ?? '소스 미기재'}</Chip>
          </div>
        ) : undefined}
        actions={<PubButtonLink href="/voc" variant="ghost" size="sm">VOC 피드로<IconArrowRight /></PubButtonLink>}
      />

      {!sb && (
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">이 리뷰를 읽지 못했다. 없는 리뷰라는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가 — 리뷰 조회 실패">
          <p className="pub-text">{result.reason} · 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {it && (
        <>
          <Section title="판정 사유">
            <p className="pub-text">{it.reason ?? '판정 사유 없음 — 판정 모델이 사유를 남기지 않았다. 아래 발췌로 대신 본다.'}</p>
            <p className="pub-caption">판정 모델이 이 리뷰를 관련으로 본 근거 한 줄이다(사람 검수 전). {judgedOn(it.judged_at)}{it.project ? ` · 분석 대상 ${it.project}` : ''}</p>
          </Section>

          <Section title="발췌" lead={`원문은 옮겨 싣지 않는다 — ${EXCERPT_MAX}자까지만. 전체는 출처에서 본다.`}>
            <div className="pub-quote"><p className="pub-text pub-signal-excerpt">{it.excerpt || '(발췌할 본문이 없다)'}</p></div>
          </Section>

          <Section title="라벨">
            <div className="pub-deflist">
              <p className="pub-text"><strong>VOC 유형</strong> · {it.community_signal ? SIGNAL_LABEL[it.community_signal] : '모름 (라벨 없음)'}</p>
              <p className="pub-text"><strong>영향</strong> · {level(it.impact)}</p>
              <p className="pub-text"><strong>빈도</strong> · {level(it.frequency)}</p>
              <p className="pub-text"><strong>지불 의사 언급</strong> · {it.wtp_mentioned === null ? '모름 (라벨 없음)' : it.wtp_mentioned ? '있음' : '없음'}</p>
            </div>
            {!it.community_signal && !it.impact && !it.frequency && it.wtp_mentioned === null && (
              <p className="pub-caption">이 행은 라벨 도입 전에 판정됐다. 야간 판정이 새 행부터 라벨을 채운다.</p>
            )}
          </Section>

          {similar && 'r' in similar && similar.r.moves.status === 'matched' ? (
            <Section title="유사 사례" lead="판정 사유와 낱말이 겹치는 승인 SaaS 케이스의 무브다. 같은 문제라는 보장은 없다 — 겹친 낱말을 같이 적는다.">
              <ul className="pub-index">
                {similar.r.moves.cards.slice(0, SIMILAR_MAX).map((c) => (
                  <PubMatchRow key={c.case_move_id} card={c}
                    study={similar.studies.get(c.case_study_id) ?? { brand_name: c.brand_name, slug: c.slug }}
                    moveCount={c.siblings.length} />
                ))}
              </ul>
              {report && similar.r.moves.cards.length > SIMILAR_MAX && (
                <PubButtonLink href={report} variant="ghost" size="sm">PMF 판정에서 {similar.r.moves.cards.length}건 전부 보기<IconArrowRight /></PubButtonLink>
              )}
            </Section>
          ) : (
            <p className="pub-caption">
              유사 사례 없음 — {similar && 'none' in similar ? similar.none
                : similar && 'r' in similar ? (similar.r.moves.status === 'not_run' ? `확인 불가: ${similar.r.moves.reason}` : '판정 사유와 낱말이 겹치는 승인 SaaS 케이스 무브가 0건이다')
                : '확인 불가'}
            </p>
          )}

          <Section title="출처">
            {it.link ? (
              <PubButtonLink href={it.link} variant="ghost" size="sm" external>출처 보기 — {it.source_name ?? '출처'}<IconExternal /></PubButtonLink>
            ) : (
              <p className="pub-text">원문 링크 없음 — 출처: {it.source_name ?? '소스 미기재'} 본문. 이 행에는 글 주소가 저장되지 않았다(게시판 순회로 모은 옛 행 등).</p>
            )}
          </Section>
        </>
      )}
    </PubShell>
  )
}
