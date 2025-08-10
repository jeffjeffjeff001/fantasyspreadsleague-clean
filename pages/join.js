// pages/join.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function JoinLeague() {
  const router = useRouter()
  const [firstName, setFirst]     = useState('')
  const [lastName, setLast]       = useState('')
  const [username, setUsername]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [leaguePassword, setLeaguePassword] = useState('')
  const [error, setError]         = useState('')

  const handleJoin = async () => {
    setError('')

    // 1) league password
    if (leaguePassword !== process.env.NEXT_PUBLIC_LEAGUE_PASSWORD) {
      return setError('Incorrect league password.')
    }

    // 2) check email uniqueness
    let { data: existingEmail } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', email)
      .single()
    if (existingEmail) {
      return setError('That email has already joined the league.')
    }

    // 3) check username uniqueness
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single()
    if (existingUser) {
      return setError('Username already taken.')
    }

    // 4) sign up auth
    const { error: signErr } = await supabase.auth.signUp(
      { email, password },
      { data: { first_name: firstName, last_name: lastName, username } }
    )
    if (signErr) return setError(signErr.message)

    // 5) insert into profiles
    const { error: profErr } = await supabase
      .from('profiles')
      .insert([{ email, username, first_name: firstName, last_name: lastName }])
    if (profErr) return setError(profErr.message)

    // 6) redirect
    router.push('/picks')
  }

  return (
    <div style={{ maxWidth: 400, margin: 'auto', padding: 20 }}>
      <h2>Join Fantasy Spreads League</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

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
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ display: 'block', marginBottom: 8, width: '100%' }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ display: 'block', marginBottom: 8, width: '100%' }}
      />
      <input
        type="password"
        placeholder="League Password"
        value={leaguePassword}
        onChange={e => setLeaguePassword(e.target.value)}
        style={{ display: 'block', marginBottom: 16, width: '100%' }}
      />

      <button onClick={handleJoin} style={{ width: '100%', padding: 8 }}>
        Join League
      </button>

      <p style={{ marginTop: 12 }}>
        Already have an account?{' '}
        <a href="/auth" style={{ color: '#06c' }}>Sign In</a>
      </p>
    </div>
  )
}
