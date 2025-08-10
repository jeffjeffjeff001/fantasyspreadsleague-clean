// pages/auth.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const [mode, setMode] = useState('sign-in') // or 'sign-up'
  const [firstName, setFirst] = useState('')
  const [lastName, setLast]   = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const router = useRouter()

  // ── Sign‑Up Handler ────────────────────────────────────────────────
  const handleSignUp = async () => {
    setError('')
    // ensure username unique
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single()
    if (existing) {
      return setError('Username already taken.')
    }
    // create user in Supabase Auth, plus profile metadata
    const { error: err } = await supabase.auth.signUp(
      { email, password },
      { data: { first_name: firstName, last_name: lastName, username } }
    )
    if (err) return setError(err.message)

    // mirror into your profiles table
    await supabase.from('profiles').insert([
      { email, username, first_name: firstName, last_name: lastName }
    ])

    // redirect to picks page
    router.push('/picks')
  }

  // ── Sign‑In Handler ────────────────────────────────────────────────
  const handleSignIn = async () => {
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (err) return setError(err.message)
    router.push('/picks')
  }

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: 'auto' }}>
      <h2>{mode === 'sign-in' ? 'Sign In' : 'Sign Up'}</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {mode === 'sign-up' && (
        <>
          <input
            placeholder="First Name"
            value={firstName}
            onChange={e => setFirst(e.target.value)}
            style={{ display: 'block', marginBottom: 8, width: '100%' }}
          />
          <input
            placeholder="Last Name"
            value={lastName}
            onChange={e => setLast(e.target.value)}
            style={{ display: 'block', marginBottom: 8, width: '100%' }}
          />
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{ display: 'block', marginBottom: 8, width: '100%' }}
          />
        </>
      )}

      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ display: 'block', marginBottom: 8, width: '100%' }}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ display: 'block', marginBottom: 16, width: '100%' }}
      />

      {mode === 'sign-in' ? (
        <button onClick={handleSignIn} style={{ padding: '8px 16px' }}>
          Sign In
        </button>
      ) : (
        <button onClick={handleSignUp} style={{ padding: '8px 16px' }}>
          Sign Up
        </button>
      )}

      <p style={{ marginTop: 12 }}>
        {mode === 'sign-in'
          ? "Don't have an account? "
          : 'Already have one? '}
        <a
          href="#"
          onClick={e => {
            e.preventDefault()
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            setError('')
          }}
        >
          {mode === 'sign-in' ? 'Sign Up' : 'Sign In'}
        </a>
      </p>
    </div>
  )
}
