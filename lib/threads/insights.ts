const BASE = 'https://graph.threads.net'

export interface ThreadsMetrics {
  views: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  shares: number
}

export async function fetchInsights(
  mediaId: string,
  token: string
): Promise<ThreadsMetrics> {
  const metrics = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares']
  const url = `${BASE}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`

  const res = await fetch(url)
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
