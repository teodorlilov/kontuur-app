export interface ClientCardData {
  id: string
  name: string
  niche: string | null
  postsPerWeek: number
  status: 'active' | 'setup'
  publishedCount: number
  totalPostCount: number
  pendingCount: number
  pillars: { name: string; hex: string }[]
  lastGeneratedAt: Date | null
  colorIndex: number
}
