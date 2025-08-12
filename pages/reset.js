// pages/reset.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  // 1) Exchange the link token for a session (works for both vercel/codespaces)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Supabase v2 uses a "code" query param for magic links.
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
          await supabase.auth.exchangeCodeForSession({ code })
        } else if (typeof supabase.auth.getSessionFromUrl === 'function') {
          // Fallback for older SDKs / hash style links
          await supabase.auth.getSessionFromUrl({ storeSession: true })
        }

        if (!cancelled) setReady(true)
      } catch (e) {
        if (!cancelled) {
          setError('Invalid or expired reset link. Please request a new one.')
          setReady(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleUpdate = async () => {
    setError('')
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password })
      if (upErr) throw upErr

      // Optional: log out the short-lived session and send back to sign in.
      await supabase.auth.signOut()
      router.replace('/auth?mode=sign-in')
    } catch (e) {
      setError(e.message || 'Could not update password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center' }}>
      <div className="card" style={{ width: 420, padding: 24 }}>
        <h2 style={{ marginBottom: 10 }}>Reset your password</h2>

        {!ready ? (
          <p>Validating reset link…</p>
        ) : (
          <>
            {error && (
              <p style={{ color: 'tomato', marginBottom: 12 }}>{error}</p>
            )}

            {!error && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display:'block', color:'#000', marginBottom:4 }}>
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width:'100%', padding:8, color:'#000' }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display:'block', color:'#000', marginBottom:4 }}>
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    style={{ width:'100%', padding:8, color:'#000' }}
                  />
                </div>

                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Updating…' : 'Update password'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
