import { NextResponse } from 'next/server'
import { publishDuePosts } from '@/features/publishing/lib/scheduler'

export const maxDuration = 60

/** Cron endpoint — publishes all scheduled posts that are due. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await publishDuePosts()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Publish cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
