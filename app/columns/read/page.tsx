import Link from 'next/link'
import { Card } from '../../_ds/components/Card'
import { Badge } from '../../_ds/components/Badge'
import { EmptyState } from '../../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'
import { columnReadable } from '@/lib/columns/markdown'
import { listApprovedColumns } from '@/lib/columns/read'

export const dynamic = 'force-dynamic'
export const metadata = { title: '칼럼' }

// 공개 읽기 목록. 검수 화면(/columns)과 데이터는 같고 조건이 다르다 — 승인된 칼럼만 나온다.
// 승인 상태를 이 화면이 바꾸지 않는다(읽기 전용). 승인은 /columns 의 서버 액션(사람)뿐이다.

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const dateOf = (c: { published_at?: string | null; staged_at: string }) => KST.format(new Date(c.published_at ?? c.staged_at))

export default async function ColumnsReadPage() {
  const res = await listApprovedColumns()

  return (
    <PageShell maxWidth={760}>
      <PageHeader
        title="칼럼"
        subtitle="승인된 칼럼만 여기 보인다. 검수 중인 초안은 /columns 에 남는다."
        meta={res.ok ? <>{res.data.length}편</> : undefined}
      />

      {!res.ok ? (
        <Notice tone="danger" title="확인 불가 — 칼럼 조회 실패">
          {res.reason} · 읽을 칼럼이 없다는 뜻이 아니다.
        </Notice>
      ) : res.data.length === 0 ? (
        <Card bodyStyle={{ padding: 0 }}>
          <EmptyState compact title="공개된 칼럼 0편 (조회는 정상)" description="승인된 칼럼이 생기면 여기 올라온다." />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {res.data.map((c) => (
            <Card key={c.slug}>
              <Link href={`/columns/read/${c.slug}`} style={{ display: 'grid', gap: 6, color: 'inherit', textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Badge tone="neutral" size="sm">{c.reader_type}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateOf(c)}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: 'var(--fs-h3)', lineHeight: 'var(--lh-snug)', color: 'var(--text-strong)' }}>{c.title}</h2>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted)' }}>{columnReadable(c.body, 100).summary}</p>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
