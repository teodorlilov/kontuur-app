import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Check if user record already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .single()

        if (!existingUser) {
          // Set up agency + user from metadata stored during signup
          const meta = user.user_metadata as { businessName?: string; mode?: 'agency' | 'solo' }
          const businessName = meta?.businessName ?? 'My Business'
          const mode = meta?.mode ?? 'agency'

          const admin = createAdminSupabaseClient()

          const { data: agencyData } = await admin
            .from('agencies')
            .insert({ name: businessName, mode })
            .select('id')
            .single()

          if (agencyData) {
            const agencyId = (agencyData as { id: string }).id

            await admin.from('users').insert({
              id: user.id,
              agency_id: agencyId,
              email: user.email ?? '',
              role: 'admin',
            })

            if (mode === 'solo') {
              const { data: clientData } = await admin
                .from('clients')
                .insert({ agency_id: agencyId, name: businessName })
                .select('id')
                .single()

              if (clientData) {
                const clientId = (clientData as { id: string }).id
                await admin.from('brand_profiles').insert({ client_id: clientId })
                await admin.from('posting_schedules').insert({ client_id: clientId })
              }
            }
          }
        }

        return NextResponse.redirect(`${origin}/dashboard`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
