import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubColumnCard } from '../../_pub/components/PubColumnCard'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { columnReadable } from '@/lib/columns/markdown'
import { listApprovedColumns } from '@/lib/columns/read'

export const dynamic = 'force-dynamic'
export const metadata = { title: '칼럼' }

// 공개 읽기 목록. 검수 화면(/columns)과 데이터는 같고 조건이 다르다 — 승인된 칼럼만 나온다.
// 승인 상태를 이 화면이 바꾸지 않는다(읽기 전용). 승인은 /columns 의 서버 액션(사람)뿐이다.
//
// 2026-09-23 A3: 화면만 `app/_pub` 라이트 테마로 옮겼다. 조회(listApprovedColumns)·
// 승인 조건·링크 경로는 불변이다. `_ds/AppNav` 는 이제 `/columns/read` 에서도 숨는다
// (AppNav 의 숨김 경로 한 줄 추가) — 그래야 헤더가 PubNav 와 겹치지 않는다.

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const dateOf = (c: { published_at?: string | null; staged_at: string }) => KST.format(new Date(c.published_at ?? c.staged_at))

export default async function ColumnsReadPage() {
  const res = await listApprovedColumns()

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="COLUMNS"
        title="칼럼"
        lead="승인된 칼럼만 여기 보인다. 검수 중인 초안은 내부 화면에 남는다."
        note={res.ok ? `${res.data.length}편` : undefined}
      />

      {!res.ok ? (
        // 3상태를 가른다(§7.1): 조회 실패는 "0편"이 아니다.
        <Panel tone="alert" titleAs="h2" title="확인 불가 — 칼럼 조회 실패">
          <p className="pub-text">{res.reason} · 읽을 칼럼이 없다는 뜻이 아니다.</p>
        </Panel>
      ) : res.data.length === 0 ? (
        <PubEmpty title="공개된 칼럼 0편 (조회는 정상)" description="승인된 칼럼이 생기면 여기 올라온다." />
      ) : (
        <div className="pub-cardgrid">
          {res.data.map((c) => (
            <PubColumnCard
              key={c.slug}
              href={`/columns/read/${c.slug}`}
              title={c.title}
              summary={columnReadable(c.body, 100).summary}
              readerType={c.reader_type}
              date={dateOf(c)}
            />
          ))}
        </div>
      )}
    </PubShell>
  )
}
