// pages/api/delete-profile.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' })
  }

  // Delete the profile row (picks cascade via FK)
  const { error } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('email', email)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ error: null })
}
