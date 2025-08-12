// pages/reset.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

function getHashParams() {
  if (typeof window === 'undefined') return {}
  const hash = window.location.hash || ''
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return Object.fromEntries(params.entries())
}

export default function ResetPassword() {
  const router = useRouter()
  const [stage, setStage] = useState('exchanging') // 'exchanging' | 'ready' | 'done' | 'error'
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const hashParams = getHashParams()

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          setStage('ready')
          return
        }

        if (hashParams.access_token && hashParams.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: hashParams.access_token,
            refresh_token: hashParams.refresh_token,
          })
          if (error) throw error
          setStage('ready')
          return
        }

        throw new Error('Invalid or missing reset parameters.')
      } catch (err) {
        console.error(err)
        setError(err.message || 'Could not verify reset link.')
        setStage('error')
      }
    }
    run()
  }, [])

  const onUpdatePassword = async (e) => {
    e.preventDefault()
    setError(null)

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setUpdating(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setStage('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      {stage === 'exchanging' && <p>Verifying your link…</p>}

      {stage === 'error' && (
        <>
          <h1>Reset link error</h1>
          <p style={{ color: 'crimson' }}>{error}</p>
          <button onClick={() => router.replace('/')}>Back to sign in</button>
        </>
      )}

      {stage === 'ready' && (
        <>
          <h1>Set a new password</h1>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <form onSubmit={onUpdatePassword}>
            <label>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ display: 'block', width: '100%', marginBottom: 8 }}
            />
            <label>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              style={{ display: 'block', width: '100%', marginBottom: 12 }}
            />
            <button type="submit" disabled={updating} style={{ width: '100%', padding: 10 }}>
              {updating ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}

      {stage === 'done' && (
        <>
          <h1>Password updated ✅</h1>
          <p>You can now sign in with your new password.</p>
          <button onClick={() => router.replace('/')}>Go to sign in</button>
        </>
      )}
    </div>
  )
}
