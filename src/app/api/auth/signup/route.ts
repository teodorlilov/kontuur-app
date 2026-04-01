import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

interface SignupBody {
  businessName: string
  mode: 'agency' | 'solo'
}

export async function POST(request: Request) {
  // User must already be authenticated (browser called signUp first)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: SignupBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { businessName, mode } = body
  if (!businessName) return NextResponse.json({ error: 'businessName is required' }, { status: 400 })

  // Check if user record already exists (prevent duplicate setup)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existingUser) return NextResponse.json({ success: true })

  // Use admin client for data inserts — bypasses RLS
  const admin = createAdminSupabaseClient()

  const { data: agencyData, error: agencyError } = await admin
    .from('agencies')
    .insert({ name: businessName, mode })
    .select('id')
    .single()

  if (agencyError || !agencyData) {
    return NextResponse.json({ error: 'Failed to create agency' }, { status: 500 })
  }

  const agencyId = (agencyData as { id: string }).id

  const { error: userError } = await admin.from('users').insert({
    id: user.id,
    agency_id: agencyId,
    email: user.email ?? '',
    role: 'admin',
  })

  if (userError) {
    return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
  }

  if (mode === 'solo') {
    const { data: clientData, error: clientError } = await admin
      .from('clients')
      .insert({ agency_id: agencyId, name: businessName, posts_per_week: 3 })
      .select('id')
      .single()

    if (!clientError && clientData) {
      const clientId = (clientData as { id: string }).id
      await admin.from('brand_profiles').insert({ client_id: clientId })
      await admin.from('posting_schedules').insert({ client_id: clientId })
    }
  }

  return NextResponse.json({ success: true })
}
