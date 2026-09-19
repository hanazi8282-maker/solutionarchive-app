import { redirect } from 'next/navigation'

// `/analyze/<id>` 자체는 화면이 없다 — 상세는 `/review`(검수) 와 `/angles` 뿐이다.
// 전에는 이 파일이 없어서 맨 `/analyze/<id>` 로 오면 404 였다(09-18 /discovery 링크 사고).
// 링크를 고쳐도 주소창·외부 공유로 맨 URL 이 들어오는 경우는 남으므로 라우트를 만들어 넘긴다.
export default async function AnalyzeProjectIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/analyze/${encodeURIComponent(id)}/review`)
}
