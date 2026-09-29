import { IconApprove, IconCollect, IconGrade, IconProblem } from './icons'
import type { PubStepItem } from './components/PubSteps'

/**
 * 작동원리 4단계(B4) 문구 — 한 곳에 둔다. 랜딩은 라이브 캡션을 붙여 쓰고, 방법론 압축판은 캡션 없이 그대로 쓴다.
 * page.tsx 는 Next 가 허용한 이름만 export 할 수 있어 여기로 옮겼다(G4).
 */
export const STEPS: Omit<PubStepItem, 'caption' | 'href'>[] = [
  { icon: <IconCollect />, title: '찾는다', body: '공시, 창업자 글, 기사에서 케이스와 근거 링크를 모은다.' },
  { icon: <IconGrade />, title: '매긴다', body: '근거의 종류로 사실확인 등급을, 행동과 전제가 적혔는지로 인사이트 등급을 매긴다. 산식은 방법론 페이지에 공개돼 있다.' },
  { icon: <IconApprove />, title: '사람이 승인한다', body: '무브 하나씩 사람이 보고 승인한다. 자동 수집분은 초안으로만 남는다.' },
  { icon: <IconProblem />, title: '내 문제로 꺼낸다', body: '문제 유형 7가지 중 하나를 고르면 내일 할 행동 한 줄과 갈린 사례가 같이 나온다.' },
]
