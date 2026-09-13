import { PageShell } from './_ds/components/Shell'
import { Card } from './_ds/components/Card'
import { EmptyState } from './_ds/components/EmptyState'
import { ButtonLink } from './_ds/components/Button'

export default function NotFound() {
  return (
    <PageShell maxWidth={720}>
      <Card padded={false}>
        <EmptyState
          title="없는 화면입니다"
          description="주소가 바뀌었거나 잘못 입력됐습니다. 위 메뉴에서 이동하세요."
          action={<ButtonLink href="/dashboard" variant="neutral">발행 기록으로</ButtonLink>}
        />
      </Card>
    </PageShell>
  )
}
