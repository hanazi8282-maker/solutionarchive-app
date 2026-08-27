const BASE = 'https://graph.threads.net'

export interface ThreadsMetrics {
  views: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  shares: number
}

/**
 * Threads 가 응답 헤더로만 알려주는 사용량. 본문에는 안 실린다.
 * 남겨두지 않으면 한도에 닿았을 때 원인을 사후에 확인할 방법이 없다 —
 * 쿼터는 추정하지 말고 이 값으로 실측한다.
 */
export interface ThreadsUsage {
  app: string | null
  businessUseCase: string | null
}

export function readUsage(res: Response): ThreadsUsage | null {
  const app = res.headers.get('x-app-usage')
  const businessUseCase = res.headers.get('x-business-use-case-usage')
  if (!app && !businessUseCase) return null
  return { app, businessUseCase }
}

export async function fetchInsights(
  mediaId: string,
  token: string,
  // 호출부가 사용량을 모아 한 번에 보고할 수 있게 콜백으로 넘긴다.
  // 여기서 바로 console 에 찍으면 매시 수십 줄이 쌓여 정작 볼 때 안 보인다.
  onUsage?: (usage: ThreadsUsage) => void,
): Promise<ThreadsMetrics> {
  const metrics = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares']
  const url = `${BASE}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`

  const res = await fetch(url)

  // 사용량은 성공·실패와 무관하게 읽는다. 한도 초과로 실패한 응답이야말로
  // 사용량을 봐야 하는 순간이다.
  if (onUsage) {
    const usage = readUsage(res)
    if (usage) onUsage(usage)
  }

  const data = await res.json()

  if (!res.ok) throw new Error(`Insights error: ${JSON.stringify(data)}`)

  // Meta Insights 응답 구조: data[].name + data[].values[0].value
  const result: Record<string, number> = {}
  for (const item of data.data ?? []) {
    result[item.name] = item.values?.[0]?.value ?? item.total_value?.value ?? 0
  }

  return {
    views:   result.views   ?? 0,
    likes:   result.likes   ?? 0,
    replies: result.replies ?? 0,
    reposts: result.reposts ?? 0,
    quotes:  result.quotes  ?? 0,
    shares:  result.shares  ?? 0,
  }
}
