// pages/auth.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const router = useRouter()

  // views: 'signin' | 'signup' | 'request' | 'update'
  const [view, setView] = useState('signin')

  // shared fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // sign-up only fields
  const [firstName, setFirst] = useState('')
  const [lastName, setLast] = useState('')
  const [username, setUsername] = useState('')

  // password reset (update)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Detect Supabase password-recovery link without subscribing to auth events
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Supabase sends: http(s)://.../auth#access_token=...&type=recovery
    const hash = window.location.hash || ''
    if (hash.includes('type=recovery')) {
      setView('update')
      setMsg('Enter a new password to finish resetting your account.')
    }
  }, [])

  // ─────────── Actions ───────────

  async function signIn(e) {
    e.preventDefault()
    setLoading(true); setErr(''); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setErr(error.message)
    router.push('/picks')
  }

  async function signUp(e) {
    e.preventDefault()
    setLoading(true); setErr(''); setMsg('')

    // ensure username unique
    const { data: existing, error: uErr } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username.trim())
      .maybeSingle()

    if (uErr) { setLoading(false); return setErr(uErr.message) }
    if (existing) { setLoading(false); return setErr('Username already taken.') }

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth`
      : undefined

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name : lastName.trim(),
          username  : username.trim()
        },
        emailRedirectTo: redirectTo
      }
    })

    if (error) { setLoading(false); return setErr(error.message) }

    // mirror into profiles
    try {
      await supabase.from('profiles').upsert([{
        email,
        username: username.trim(),
        first_name: firstName.trim(),
        last_name : lastName.trim()
      }], { onConflict: 'email' })
    } catch (e) {
      console.error(e)
    }

    setLoading(false)

    if (!data.session) {
      setMsg('Check your email to confirm your account, then sign in.')
      setView('signin')
      return
    }
    router.push('/picks')
  }

  async function requestReset(e) {
    e.preventDefault()
    setLoading(true); setErr(''); setMsg('')
    try {
      const redirectTo = `${window.location.origin}/auth`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      setLoading(false)
      if (error) return setErr(error.message)
      setMsg('If that email exists, a reset link has been sent. Check your inbox.')
      setView('signin')
    } catch (e2) {
      setLoading(false)
      setErr(e2.message)
    }
  }

  async function updatePassword(e) {
    e.preventDefault()
    setLoading(true); setErr(''); setMsg('')
    if (newPassword.length < 6) {
      setLoading(false); return setErr('Password must be at least 6 characters.')
    }
    if (newPassword !== confirm) {
      setLoading(false); return setErr('Passwords do not match.')
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setLoading(false); return setErr(error.message) }
    await supabase.auth.signOut()
    setLoading(false)
    setMsg('Password updated. Please sign in with your new password.')
    setView('signin')
    setEmail(''); setPassword(''); setNewPassword(''); setConfirm('')
  }

  // ─────────── UI bits ───────────

  const Input = (props) => (
    <input
      {...props}
      autoComplete={props.autoComplete || 'off'}
      className={`w-full rounded-md border border-slate-300 px-3 py-2 bg-white text-black placeholder-slate-500 ${props.className || ''}`}
    />
  )

  const Label = ({ children }) => (
    <label className="block text-sm mb-1 text-white/90">{children}</label>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="border-b border-white/10 bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Fantasy Spreads League" className="h-7 w-7 rounded-lg" />
            <Link href="/" className="font-semibold">Fantasy Spreads League</Link>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/picks" className="link-muted">Submit Picks</Link>
            <Link href="/dashboard" className="link-muted">Dashboard</Link>
            <Link href="/nfl-scores" className="link-muted">NFL Scores</Link>
            <Link href="/profile" className="link-muted">My Profile</Link>
            <Link href="/admin" className="link-muted">Admin</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">
              {view === 'signin' && 'Join League / Sign In'}
              {view === 'signup' && 'Create your account'}
              {view === 'request' && 'Reset your password'}
              {view === 'update' && 'Choose a new password'}
            </h1>

            {['signin', 'signup'].includes(view) && (
              <button
                type="button"
                onClick={() => { setErr(''); setMsg(''); setView(view === 'signin' ? 'signup' : 'signin') }}
                className="text-sm link-muted"
              >
                {view === 'signin' ? 'Need an account?' : 'Have an account?'}
              </button>
            )}
          </div>

          {msg && <p className="mb-3 text-emerald-300">{msg}</p>}
          {err && <p className="mb-3 text-rose-300">{err}</p>}

          {/* Sign In */}
          {view === 'signin' && (
            <form onSubmit={signIn} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="flex items-center justify-between">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className="text-sm link-muted"
                  onClick={() => { setErr(''); setMsg(''); setView('request') }}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Sign Up */}
          {view === 'signup' && (
            <form onSubmit={signUp} className="space-y-4">
              <div>
                <Label>First Name</Label>
                <Input value={firstName} onChange={e => setFirst(e.target.value)} required />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={lastName} onChange={e => setLast(e.target.value)} required />
              </div>
              <div>
                <Label>Username</Label>
                <Input value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="flex items-center justify-between">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Creating…' : 'Sign Up'}
                </button>
                <button
                  type="button"
                  className="text-sm link-muted"
                  onClick={() => { setErr(''); setMsg(''); setView('signin') }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* Request reset */}
          {view === 'request' && (
            <form onSubmit={requestReset} className="space-y-4">
              <p className="text-sm text-slate-300">
                Enter your email and we’ll send you a secure link to reset your password.
              </p>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
                <button
                  type="button"
                  className="text-sm link-muted"
                  onClick={() => { setErr(''); setMsg(''); setView('signin') }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* Update password after email link */}
          {view === 'update' && (
            <form onSubmit={updatePassword} className="space-y-4">
              <div>
                <Label>New password</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div>
                <Label>Confirm new password</Label>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Updating…' : 'Update password'}
                </button>
                <button
                  type="button"
                  className="text-sm link-muted"
                  onClick={() => { setErr(''); setMsg(''); setView('signin') }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-slate-300">
        © {new Date().getFullYear()} Football Junkie
      </footer>
    </div>
  )
}
