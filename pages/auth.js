// pages/auth.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState('sign-in') // 'sign-in' | 'sign-up' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // If already signed in, bounce to homepage
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) router.replace('/')
    })
  }, [router])

  const clearAlerts = () => { setMessage(null); setError(null) }

  const onSignIn = async (e) => {
    e.preventDefault()
    clearAlerts()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setMessage('Signed in! Redirecting…')
      router.replace('/') // now goes to your restored homepage
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const onSignUp = async (e) => {
    e.preventDefault()
    clearAlerts()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName || null, last_name: lastName || null },
          emailRedirectTo: `${window.location.origin}/reset`,
        },
      })
      if (error) throw error
      setMessage('Check your email to confirm your account.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const onSendReset = async (e) => {
    e.preventDefault()
    clearAlerts()
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setMessage('Password reset email sent. Check your inbox.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>
        {mode === 'sign-in' && 'Sign in'}
        {mode === 'sign-up' && 'Create your account'}
        {mode === 'reset' && 'Reset password'}
      </h1>

      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {mode !== 'reset' ? (
        <form onSubmit={mode === 'sign-in' ? onSignIn : onSignUp}>
          {mode === 'sign-up' && (
            <>
              <label>First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                style={{ display:'block', width:'100%', marginBottom:8 }}
              />
              <label>Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                style={{ display:'block', width:'100%', marginBottom:8 }}
              />
            </>
          )}

          <label>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ display:'block', width:'100%', marginBottom:8 }}
          />

          <label>Password</label>
          <input
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ display:'block', width:'100%', marginBottom:12 }}
          />

          <button type="submit" disabled={loading} style={{ width:'100%', padding:10 }}>
            {loading ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSendReset}>
          <label>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ display:'block', width:'100%', marginBottom:12 }}
          />
          <button type="submit" disabled={loading} style={{ width:'100%', padding:10 }}>
            {loading ? 'Please wait…' : 'Send reset email'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 16 }}>
        {mode !== 'sign-in' && <button onClick={() => setMode('sign-in')} style={{ marginRight: 8 }}>Sign in</button>}
        {mode !== 'sign-up' && <button onClick={() => setMode('sign-up')} style={{ marginRight: 8 }}>Sign up</button>}
        {mode !== 'reset' && <button onClick={() => setMode('reset')}>Forgot password?</button>}
      </div>
    </div>
  )
}
