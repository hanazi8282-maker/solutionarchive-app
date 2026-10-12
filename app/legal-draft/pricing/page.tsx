import { DraftShell, draftMetadata } from '../DraftShell'

export const metadata = { ...draftMetadata, title: '요금제 안내 (초안)' }

// 가격은 글자일 뿐이다. 결제·체크아웃 연결 없음.
export default function Page() {
  return (
    <DraftShell title="요금제 안내 (초안)">
      <h2>결론서 — 30만 원</h2>
      <p className="pub-text">한국 업무용 AI 소프트웨어 팀을 위해, 경쟁 제품의 고객 글을 대조해 만든 결론서 1건. 영역은 회의·통화 기록, 영업, 마케팅, 인사 운영, 리뷰 관리 중에서 고른다.</p>
      <h2>컨설팅 — 300만 원</h2>
      <p className="pub-text">결론서를 바탕으로 제품·메시지 방향을 함께 정리하는 컨설팅. [결정 필요: 범위·기간·산출물]</p>
      <p className="pub-text">[결정 필요: 부가세 포함 여부, 결제 시점, 환불 기준] 지금은 결제 기능이 없고 문의로만 받는다.</p>
    </DraftShell>
  )
}
