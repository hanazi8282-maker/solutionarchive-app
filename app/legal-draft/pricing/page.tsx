import { DraftShell, draftMetadata } from '../DraftShell'
import { DEPOSIT_PRODUCTS, DEPOSIT_REFUND } from '@/lib/deposit/notice'

export const metadata = { ...draftMetadata, title: '요금제 안내 (초안)' }

// 가격은 글자일 뿐이다. 결제·체크아웃 연결 없음. 상품·환불 문구는 입금 안내와 같은 표(lib/deposit/notice.ts)에서만 나온다.
export default function Page() {
  return (
    <DraftShell title="요금제 안내 (초안)">
      {Object.entries(DEPOSIT_PRODUCTS).map(([k, p]) => (
        <h2 key={k}>{p.label}</h2>
      ))}
      <h2>환불</h2>
      <p className="pub-text">{DEPOSIT_REFUND}</p>
      <p className="pub-text">[결정 필요: 부가세 포함 여부] 지금은 결제 기능이 없고 계좌 입금으로만 받는다.</p>
    </DraftShell>
  )
}
