const BASE = 'https://graph.threads.net'

interface PublishTextOptions {
  text: string
  replyToId?: string
}

interface PublishImageOptions {
  text: string
  imageUrl: string
  replyToId?: string
}

type PublishOptions = PublishTextOptions | PublishImageOptions

// 컨테이너 생성
async function createContainer(userId: string, token: string, opts: PublishOptions) {
  const isImage = 'imageUrl' in opts && opts.imageUrl

  const body: Record<string, string> = {
    access_token: token,
    media_type: isImage ? 'IMAGE' : 'TEXT',
    text: opts.text,
  }
  if (isImage) body.image_url = (opts as PublishImageOptions).imageUrl
  if (opts.replyToId) body.reply_to_id = opts.replyToId

  const res = await fetch(`${BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || !data.id) throw new Error(`Container error: ${JSON.stringify(data)}`)
  return data.id as string
}

// 30초 대기
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// 발행
async function publishContainer(userId: string, token: string, containerId: string) {
  const res = await fetch(`${BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  })
  const data = await res.json()
  if (!res.ok || !data.id) throw new Error(`Publish error: ${JSON.stringify(data)}`)
  return data.id as string
}

// 본문 게시 (이미지 포함 시 30초 대기 자동 포함)
export async function publishPost(
  userId: string,
  token: string,
  opts: PublishOptions
): Promise<string> {
  const containerId = await createContainer(userId, token, opts)
  const isImage = 'imageUrl' in opts && opts.imageUrl
  if (isImage) await wait(30_000)  // 이미지 처리 대기
  else await wait(3_000)           // 텍스트는 짧게
  return publishContainer(userId, token, containerId)
}

// 본문 + 첫 댓글(링크) 세트 발행
export async function publishPostWithReply(opts: {
  userId: string
  token: string
  bodyText: string
  imageUrl?: string
  commentText: string
}): Promise<{ postId: string; replyId: string }> {
  const { userId, token, bodyText, imageUrl, commentText } = opts

  // 1) 본문 발행
  const postId = await publishPost(userId, token,
    imageUrl ? { text: bodyText, imageUrl } : { text: bodyText }
  )

  // 2) 댓글 발행 (reply_to_id = 본문 미디어 ID)
  const replyId = await publishPost(userId, token, {
    text: commentText,
    replyToId: postId,
  })

  return { postId, replyId }
}
