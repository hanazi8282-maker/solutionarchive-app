import { Section } from '../../_pub/components/Section'
import { PubLockRow } from '../../_pub/components/PubLockRow'
import { PmfPanel, type PmfAnchors } from './pmf-panel'

// `#pmf` 섹션(P4) — 서버 컴포넌트. 로그인 분기를 **서버에서** 한다: 익명이면 잠금 줄 한 줄만 그리고
// 클라이언트 패널·선례 앵커 표·실행 데이터는 HTML·RSC 페이로드에 싣지 않는다(PubLockRow 패턴, 로그인 버튼 그대로).
// 렌더 셀프테스트(scripts/idea-pmf-render-selftest.mjs)가 이 파일을 그대로 그린다.

export const PMF_LEAD = '위 “닮은 성공 무브”는 낱말이 겹친 것이고, 여기 선례축은 같은 병목의 승인 케이스로 센다(분석 프로젝트의 PMF 진단과 같은 산식). 선례축은 케이스, 수요축은 아래 질문에 대한 내 답이다. 참고용 분류다.'
export const PMF_LOCK = 'PMF 사분면 판정(자가진단)은 로그인 후 쓸 수 있다'

export function PmfSection({ signedIn, q, kind, next, anchors }: {
  signedIn: boolean
  q: string
  kind: string
  /** 로그인 뒤 돌아올 경로. */
  next: string
  /** 로그인후에만 채워 넘긴다. */
  anchors?: PmfAnchors
}) {
  if (!signedIn) {
    return (
      <Section id="pmf" title="PMF 사분면 (자가진단)">
        <ul className="pub-index">
          <PubLockRow count={null} unit="" what="PMF 판정" next={next} label={PMF_LOCK} />
        </ul>
      </Section>
    )
  }
  return (
    <Section id="pmf" title="PMF 사분면 (자가진단)" lead={PMF_LEAD}>
      <PmfPanel q={q} kind={kind} anchors={anchors ?? {}} />
    </Section>
  )
}
