import { PMF_GRADE_IMPLEMENTED, SECTIONS, UPDATED_AT } from '@/lib/methodology/content'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Section } from '../../_pub/components/Section'
import { PubTOC } from '../../_pub/components/PubTOC'
import './methodology.css'

/**
 * 방법론 공개 페이지 — 등급 산식과 소스 판정 기준을 그대로 공개한다 (남헌 2026-09-23 확정).
 *
 * **익명으로 열린다.** 인증 정책은 건드리지 않았다 — `/library` 접두사가 이미 공개라
 * (`lib/auth/policy.ts` 의 `PUBLIC_PREFIXES`) 이 라우트는 자동으로 공개다.
 * `app/library/[slug]` 와 같은 자리에 있지만 정적 세그먼트가 동적 세그먼트보다 먼저 잡힌다.
 *
 * ★ 내용은 전부 `lib/methodology/content.ts` 에 있다. 이 파일은 **렌더만** 한다 —
 *   A2(2026-09-23)에서 껍데기를 공개 디자인 시스템(`app/_pub`)으로 갈았고 content.ts 는
 *   손대지 않았다. 남은 전용 CSS 는 등급표 하나뿐이다(`methodology.css`).
 *
 * ★ 지어내지 않는다: 여기 나가는 모든 문장은 문서·코드에 이미 있는 것이고, 섹션마다 그
 *   정본 경로를 화면에 함께 찍는다. 등급표가 실제 산식과 갈리면
 *   `scripts/methodology-selftest.mjs` 가 실패한다 (CLAUDE.md §7.1).
 */

export const metadata = {
  title: '방법론 — 등급과 소스를 어떻게 정하나',
  description:
    '케이스 등급 산식, 발행 게이트, 리뷰 소스 판정 기준을 공개한다. 각 항목의 정본 파일 경로를 함께 적는다.',
}

export default function MethodologyPage() {
  return (
    <PubShell theme="light">
      <Hero
        eyebrow="METHODOLOGY"
        title="방법론 — 등급과 소스를 어떻게 정하나"
        lead="무엇을 케이스로 삼고, 근거에 어떻게 등급을 매기고, 무엇을 발행하지 않는지. 각 섹션 끝에 그 규칙의 정본 파일 경로를 적었다."
        note="확인하지 못한 것을 확인된 것으로 적지 않는다. 미기재는 “아니다”가 아니라 “확인하지 않았다”이고, 그렇게 매긴 등급에는 “잠정”이 붙는다."
      />

      {/* M1: 목차 패널 → 케이스 상세와 같은 .pub-detail + PubTOC(좁으면 위 가로 칩, ≥1024px 오른쪽 sticky).
          긴 표 6개를 내려가면서도 목차가 따라온다. JS 0. */}
      <div className="pub-detail">
        <PubTOC items={SECTIONS.map((s, i) => [s.id, `${i + 1}. ${s.title}`] as const)} />
        <div className="pub-detail-body">
          {SECTIONS.map((s) => (
            <Section key={s.id} id={s.id} title={s.title} lead={s.body}>
              {/* 표 1개. 첫 칸은 행 머리글이라 <th scope="row"> 다 — 스크린리더가 등급을 읽는다. */}
              <div className="mth-scroll">
                <table className="mth-table">
                  <caption>{s.table.caption}</caption>
                  <thead>
                    <tr>
                      {s.table.head.map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row) => (
                      <tr key={row[0]}>
                        <th scope="row">{row[0]}</th>
                        {row.slice(1).map((cell, j) => (
                          <td key={`${row[0]}-${j}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* PMF 축은 설계만 확정됐고 산식이 코드에 없다. 그걸 화면에 적는다 — 없는 구현을
                  있는 것처럼 보이게 두면 이 페이지가 거짓이 된다(§7.1). */}
              {s.id === 'pmf' && !PMF_GRADE_IMPLEMENTED && (
                <p className="pub-caption">
                  이 축은 설계가 확정됐고 <b>코드 산식은 아직 없다.</b> 지금 화면에 찍히는 등급은 위
                  사실확인·인사이트 두 축이다. S 채점과 재채점은 사람이 한다.
                </p>
              )}
              <p className="pub-caption">
                출처:{' '}
                {s.sources.map((src, i) => (
                  <span key={src}>
                    {i > 0 && ' · '}
                    <code className="pub-code">{src}</code>
                  </span>
                ))}
              </p>
            </Section>
          ))}
        </div>
      </div>

      <p className="pub-caption">
        이 페이지의 기준은 코드와 같이 바뀐다 — 최종 갱신 {UPDATED_AT}
      </p>
    </PubShell>
  )
}
