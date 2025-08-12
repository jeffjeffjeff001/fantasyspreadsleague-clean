// pages/auth.js
import { useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const [mode, setMode] = useState('sign-in') // 'sign-in' | 'sign-up' | 'reset'
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const router = useRouter()

  // Refs (uncontrolled inputs = no re-render on every keystroke)
  const firstRef = useRef(null)
  const lastRef = useRef(null)
  const userRef = useRef(null)
  const emailRef = useRef(null)
  const passRef = useRef(null)
  const resetEmailRef = useRef(null)
  const newPassRef = useRef(null)

  const clearMessages = () => {
    setError('')
    setNotice('')
  }

  // ── SIGN UP ────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault()
    clearMessages()

    const first_name = firstRef.current?.value?.trim() || ''
    const last_name  = lastRef.current?.value?.trim() || ''
    const username   = userRef.current?.value?.trim() || ''
    const email      = emailRef.current?.value?.trim() || ''
    const password   = passRef.current?.value || ''

    if (!first_name || !last_name || !username || !email || !password) {
      setError('Please complete all fields.')
      return
    }

    // Ensure unique username
    const { data: existing, error: exErr } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    if (exErr) {
      setError(exErr.message)
      return
    }
    if (existing) {
      setError('Username already taken.')
      return
    }

    // Create auth user
    const { error: signErr } = await supabase.auth.signUp(
      { email, password },
      { data: { first_name, last_name, username } }
    )
    if (signErr) {
      setError(signErr.message)
      return
    }

    // Mirror profile
    const { error: profErr } = await supabase.from('profiles').insert([
      { email, username, first_name, last_name }
    ])
    if (profErr) {
      setError(profErr.message)
      return
    }

    setNotice('Account created! Redirecting…')
    router.push('/picks')
  }

  // ── SIGN IN ────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    clearMessages()

    const email    = emailRef.current?.value?.trim() || ''
    const password = passRef.current?.value || ''

    if (!email || !password) {
      setError('Enter email and password.')
      return
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      return
    }
    router.push('/picks')
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault()
    clearMessages()

    const email = resetEmailRef.current?.value?.trim() || ''
    const newPassword = newPassRef.current?.value || ''

    if (!email || !newPassword) {
      setError('Enter your email and a new password.')
      return
    }

    // Update password via admin client should be done server-side normally,
    // but for MVP we use the client session if the user is logged in.
    // If they are not, we can send a reset link:
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || user.email?.toLowerCase() !== email.toLowerCase()) {
      // Not logged in as that email — send a reset link instead
      // (This emails a magic reset; user follows link to complete.)
      const { error: linkErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset`,
      })
      if (linkErr) {
        setError(linkErr.message)
        return
      }
      setNotice('We sent you a reset email. Check your inbox.')
      setMode('sign-in')
      return
    }

    // Logged in as that user → update directly
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updErr) {
      setError(updErr.message)
      return
    }
    setNotice('Password updated! Please sign in.')
    setMode('sign-in')
  }

  const Field = ({ label, type = 'text', inputRef, placeholder }) => (
    <label className="block text-sm font-medium text-black/80">
      {label}
      <input
        ref={inputRef}
        type={type}
        placeholder={placeholder}
        className="form-input mt-1 w-full"
      />
    </label>
  )

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-4 text-black">
          {mode === 'sign-in' ? 'Sign In' : mode === 'sign-up' ? 'Sign Up' : 'Reset Password'}
        </h2>

        {!!error && <p className="text-red-600 mb-3">{error}</p>}
        {!!notice && <p className="text-emerald-700 mb-3">{notice}</p>}

        {/* SIGN IN */}
        {mode === 'sign-in' && (
          <form onSubmit={handleSignIn} className="space-y-3">
            <Field label="Email" type="email" inputRef={emailRef} placeholder="you@example.com" />
            <Field label="Password" type="password" inputRef={passRef} placeholder="••••••••" />
            <div className="flex items-center justify-between pt-2">
              <button type="submit" className="btn-primary">Sign In</button>
              <button
                type="button"
                className="link-muted"
                onClick={() => { clearMessages(); setMode('reset') }}
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP */}
        {mode === 'sign-up' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <Field label="First Name" inputRef={firstRef} placeholder="First name" />
            <Field label="Last Name" inputRef={lastRef} placeholder="Last name" />
            <Field label="Username" inputRef={userRef} placeholder="Unique handle" />
            <Field label="Email" type="email" inputRef={emailRef} placeholder="you@example.com" />
            <Field label="Password" type="password" inputRef={passRef} placeholder="Create a password" />
            <div className="pt-2">
              <button type="submit" className="btn-primary">Create Account</button>
            </div>
          </form>
        )}

        {/* RESET PASSWORD */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-3">
            <Field label="Email" type="email" inputRef={resetEmailRef} placeholder="you@example.com" />
            <Field label="New Password" type="password" inputRef={newPassRef} placeholder="New password" />
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" className="btn-primary">Reset Password</button>
              <button
                type="button"
                className="link-muted"
                onClick={() => { clearMessages(); setMode('sign-in') }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 text-sm">
          {mode === 'sign-in' ? (
            <span className="text-black/80">
              Don’t have an account?{' '}
              <button
                type="button"
                className="link-muted"
                onClick={() => { clearMessages(); setMode('sign-up') }}
              >
                Sign Up
              </button>
            </span>
          ) : mode === 'sign-up' ? (
            <span className="text-black/80">
              Already have one?{' '}
              <button
                type="button"
                className="link-muted"
                onClick={() => { clearMessages(); setMode('sign-in') }}
              >
                Sign In
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
