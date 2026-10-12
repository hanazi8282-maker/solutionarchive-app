import { DraftShell, draftMetadata } from '../DraftShell'

export const metadata = { ...draftMetadata, title: '이용약관 (초안)' }

export default function Page() {
  return (
    <DraftShell title="이용약관 (초안)">
      <h2>제1조 (목적)</h2>
      <p className="pub-text">이 약관은 솔루션아카이브가 한국 업무용 AI 소프트웨어 팀에 제공하는, 경쟁 제품의 고객 글을 대조해 만드는 결론서 서비스의 이용 조건을 정한다.</p>
      <h2>제2조 (서비스 범위)</h2>
      <p className="pub-text">영역은 회의·통화 기록, 영업, 마케팅, 인사 운영, 리뷰 관리다. 결론서는 공개된 고객 글과 사례를 근거로 한 참고 자료이며 결과를 보증하지 않는다.</p>
      <h2>제3조 (계정과 이용)</h2>
      <p className="pub-text">초대된 계정만 로그인할 수 있다. [결정 필요: 계정 공유·재판매 금지 범위]</p>
      <h2>제4조 (요금)</h2>
      <p className="pub-text">요금은 요금제 안내를 따른다. 결제 기능은 아직 없으며 별도 계약으로 진행한다. [결정 필요: 청약철회·환불 기준]</p>
      <h2>제5조 (면책)</h2>
      <p className="pub-text">[법률 검토 필요: 책임 제한, 출처 데이터의 정확성, 분쟁 관할]</p>
      <h2>제6조 (개인정보)</h2>
      <p className="pub-text">개인정보는 개인정보 처리방침에 따라 처리한다.</p>
    </DraftShell>
  )
}
