import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { impactFrequencyTags } from '@/lib/analysis/relevance-judge'
import { EXCERPT_MAX, LEVEL_LABEL, SIGNAL_LABEL, UUID, loadCard } from '@/lib/signals/feed'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Section } from '../../_pub/components/Section'
import { Panel } from '../../_pub/components/Panel'
import { Chip } from '../../_pub/components/Chip'
import { PubButtonLink } from '../../_pub/components/Button'
import { judgedOn } from '../../_pub/components/PubSignalCard'
import { IconArrowRight, IconExternal } from '../../_pub/icons'

/**
 * 페인 태그 카드 — 리뷰 1건 상세(BigIdeasDB 페인 카드 레퍼런스, competitor-feature-analysis.md:87 · §F 7).
 * 남헌 2026-09-25 위임 B항. 익명 공개(PUBLIC_EXACT `/signals/card`) — id 는 경로가 아니라 질의(`?id=`)다.
 * 경로에 두면 `/signals/*` 접두사 공개가 필요해지고, 그러면 그 아래 새 화면이 전부 자동으로 열린다.
 *
 * 공개 대상이 아닌 행(무관·폐기·없음·형식 밖 id)은 똑같이 404 다. 조회 실패는 404 로 접지 않는다(§7.1).
 * 라벨은 3상태로 적는다: 값 / "모름"(NULL). NULL 을 '보통'·'없음'으로 접지 않는다.
 *
 * 관련 케이스 링크는 없다: 리뷰(analysis_inputs)를 케이스로 잇는 깨끗한 키가 스키마에 없다 —
 * `/library/[slug]` 블록 7 을 비워 둔 것과 같은 이유다(짐작 매핑이 빈칸보다 나쁘다).
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '리뷰 1건 — 페인 카드',
  description: '관련 판정을 받은 리뷰 1건의 발췌·신호 라벨·판정 사유·출처.',
}

const level = (v: keyof typeof LEVEL_LABEL | null) => (v ? LEVEL_LABEL[v] : '모름 (라벨 없음)')

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

  return (
    <PubShell theme="light">
      <Hero
        variant="detail"
        eyebrow="PAIN CARD"
        title={it ? `리뷰 1건 — ${it.community_signal ? SIGNAL_LABEL[it.community_signal] : '신호 라벨 없음'}` : '리뷰 1건'}
        meta={it ? (
          <div className="pub-chiprow">
            {tags.map((t) => <Chip key={t}>{t}</Chip>)}
            {it.wtp_mentioned === true ? <Chip>지불 의사 언급</Chip> : null}
            <Chip>{it.source_name ?? '소스 미기재'}</Chip>
          </div>
        ) : undefined}
        actions={<PubButtonLink href="/signals" variant="ghost" size="sm">신호 피드로<IconArrowRight /></PubButtonLink>}
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
          <Section title="발췌" lead={`원문은 옮겨 싣지 않는다 — ${EXCERPT_MAX}자까지만. 전체는 출처에서 본다.`}>
            <div className="pub-quote"><p className="pub-text pub-signal-excerpt">{it.excerpt || '(발췌할 본문이 없다)'}</p></div>
          </Section>

          <Section title="라벨">
            <div className="pub-deflist">
              <p className="pub-text"><strong>신호</strong> · {it.community_signal ? SIGNAL_LABEL[it.community_signal] : '모름 (라벨 없음)'}</p>
              <p className="pub-text"><strong>영향</strong> · {level(it.impact)}</p>
              <p className="pub-text"><strong>빈도</strong> · {level(it.frequency)}</p>
              <p className="pub-text"><strong>지불 의사 언급</strong> · {it.wtp_mentioned === null ? '모름 (라벨 없음)' : it.wtp_mentioned ? '있음' : '없음'}</p>
            </div>
            {!it.community_signal && !it.impact && !it.frequency && it.wtp_mentioned === null && (
              <p className="pub-caption">이 행은 라벨 도입 전에 판정됐다. 야간 판정이 새 행부터 라벨을 채운다.</p>
            )}
          </Section>

          <Section title="판정 사유">
            <p className="pub-text">{it.reason ?? '판정 모델이 사유를 남기지 않았다.'}</p>
            <p className="pub-caption">판정 모델이 적은 한 줄이다(사람 검수 전). {judgedOn(it.judged_at)}{it.project ? ` · 분석 대상 ${it.project}` : ''}</p>
          </Section>

          <Section title="출처">
            {it.link ? (
              <PubButtonLink href={it.link} variant="ghost" size="sm" external>원문 보기 — {it.source_name ?? '출처'}<IconExternal /></PubButtonLink>
            ) : (
              <p className="pub-text">원문 링크를 만들 수 없다 — 이 소스는 글 단위 주소를 저장하지 않는다. 출처는 {it.source_name ?? '미기재'}.</p>
            )}
            <p className="pub-caption">관련 케이스 링크는 없다 — 리뷰를 케이스에 잇는 기준이 아직 없어서, 짐작으로 붙이지 않는다.</p>
          </Section>
        </>
      )}
    </PubShell>
  )
}
