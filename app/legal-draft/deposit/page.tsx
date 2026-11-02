import { DraftShell, draftMetadata } from '../DraftShell'
import { Panel } from '../../_pub/components/Panel'
import { DEPOSIT_ENV_KEYS, readDepositAccount } from '@/lib/deposit/notice'
import { SendDepositNotice } from './SendDepositNotice'

export const metadata = { ...draftMetadata, title: '입금 안내 (DRAFT)' }
export const dynamic = 'force-dynamic' // env 를 요청 때 읽는다(빌드에 계좌를 굳히지 않는다)

// 로그인(허용목록) 전용 — lib/auth/policy.ts 공개 목록에 없다. 계좌 값은 env 에서만 읽는다(공개 리포).
export default function Page() {
  const r = readDepositAccount(process.env)
  return (
    <DraftShell title="입금 안내 (DRAFT)">
      {r.ok ? (
        <>
          <p className="pub-text">은행: {r.account.bank}</p>
          <p className="pub-text">예금주: {r.account.holder}</p>
          <p className="pub-text">계좌번호: {r.account.number}</p>
          <SendDepositNotice account={r.account} />
        </>
      ) : (
        <Panel tone="alert" title="계좌 설정 안 됨 — 발송 불가">
          <p className="pub-text">환경변수가 비어 있다: {r.missing.join(', ')}. 필요한 키: {DEPOSIT_ENV_KEYS.join(', ')}</p>
        </Panel>
      )}
    </DraftShell>
  )
}
