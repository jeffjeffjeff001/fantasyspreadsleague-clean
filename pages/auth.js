// pages/auth.js

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const router = useRouter()

  const [mode, setMode] = useState('sign-in')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [leaguePassword, setLeaguePassword] =
    useState('')

  const [firstName, setFirstName] =
    useState('')

  const [lastName, setLastName] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState(null)

  const [error, setError] =
    useState(null)

  // ------------------------------------------------------------
  // Keep page mode in sync with optional URL parameters.
  // Example: /auth?mode=sign-in
  // ------------------------------------------------------------
  useEffect(() => {
    if (!router.isReady) return

    const requestedMode = router.query.mode

    if (
      requestedMode === 'sign-in' ||
      requestedMode === 'returning' ||
      requestedMode === 'sign-up' ||
      requestedMode === 'reset'
    ) {
      setMode(requestedMode)
    }

    if (router.query.confirmed === '1') {
      setMessage(
        '✅ Your email has been confirmed. You can now sign in.'
      )
    }
  }, [
    router.isReady,
    router.query.mode,
    router.query.confirmed,
  ])

  // ------------------------------------------------------------
  // If already signed in, send the user home.
  //
  // Also listens for a Magic Link sign-in completing.
  // ------------------------------------------------------------
  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (mounted && session) {
        router.replace('/')
      }
    }

    checkSession()

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (mounted && session) {
            router.replace('/')
          }
        }
      )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [router])

  const clearAlerts = () => {
    setMessage(null)
    setError(null)
  }

  const changeMode = newMode => {
    clearAlerts()
    setPassword('')
    setLeaguePassword('')
    setMode(newMode)
  }

  const normalizedEmail = () =>
    email.trim().toLowerCase()

  // ------------------------------------------------------------
  // Validate shared league password through our server.
  // ------------------------------------------------------------
  async function verifyLeaguePassword() {
    const response = await fetch(
      '/api/verify-league-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaguePassword,
        }),
      }
    )

    let result = {}

    try {
      result = await response.json()
    } catch {
      // Leave result empty and use fallback message below.
    }

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
          'Unable to verify the league password.'
      )
    }

    return true
  }

  // ------------------------------------------------------------
  // NORMAL PASSWORD SIGN IN
  // ------------------------------------------------------------
  const onSignIn = async event => {
    event.preventDefault()

    clearAlerts()

    if (!normalizedEmail()) {
      setError('Please enter your email address.')
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)

    try {
      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail(),
          password,
        })

      if (signInError) {
        throw signInError
      }

      setMessage(
        '✅ Signed in! Redirecting…'
      )

      router.replace('/')
    } catch (signInError) {
      setError(
        signInError.message ||
          'Unable to sign in.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ------------------------------------------------------------
  // RETURNING PLAYER
  //
  // Email + league password.
  //
  // The league password grants permission to request the link,
  // while control of the user's actual email proves identity.
  // ------------------------------------------------------------
  const onReturningPlayer = async event => {
    event.preventDefault()

    clearAlerts()

    if (!normalizedEmail()) {
      setError('Please enter your email address.')
      return
    }

    if (!leaguePassword) {
      setError(
        'Please enter the league password.'
      )
      return
    }

    setLoading(true)

    try {
      await verifyLeaguePassword()

      const redirectTo =
        `${window.location.origin}/auth?magic=1`

      const { error: magicLinkError } =
        await supabase.auth.signInWithOtp({
          email: normalizedEmail(),
          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectTo,
          },
        })

      if (magicLinkError) {
        throw magicLinkError
      }

      setMessage(
        '✅ Sign-in link sent! Check your email and click the link to return to Fantasy Spreads League.'
      )

      setLeaguePassword('')
    } catch (returningError) {
      setError(
        returningError.message ||
          'Unable to send your sign-in link.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ------------------------------------------------------------
  // NEW PLAYER SIGN UP
  // ------------------------------------------------------------
  const onSignUp = async event => {
    event.preventDefault()

    clearAlerts()

    if (!firstName.trim()) {
      setError('Please enter your first name.')
      return
    }

    if (!lastName.trim()) {
      setError('Please enter your last name.')
      return
    }

    if (!normalizedEmail()) {
      setError('Please enter your email address.')
      return
    }

    if (!leaguePassword) {
      setError(
        'Please enter the league password.'
      )
      return
    }

    if (!password || password.length < 6) {
      setError(
        'Your password must be at least 6 characters.'
      )
      return
    }

    setLoading(true)

    try {
      // Verify league access before creating
      // a new Supabase account.
      await verifyLeaguePassword()

      const emailRedirectTo =
        `${window.location.origin}/auth?mode=sign-in&confirmed=1`

      const {
        data,
        error: signUpError,
      } = await supabase.auth.signUp({
        email: normalizedEmail(),
        password,

        options: {
          data: {
            first_name:
              firstName.trim() || null,

            last_name:
              lastName.trim() || null,
          },

          emailRedirectTo,
        },
      })

      if (signUpError) {
        throw signUpError
      }

      setLeaguePassword('')
      setPassword('')

      // If email confirmation is disabled,
      // Supabase may immediately return a session.
      if (data?.session) {
        setMessage(
          '✅ Account created! Redirecting…'
        )

        router.replace('/')
        return
      }

      setMessage(
        '✅ Account created! Check your email to confirm your account, then you can sign in.'
      )
    } catch (signUpError) {
      setError(
        signUpError.message ||
          'Unable to create your account.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ------------------------------------------------------------
  // SEND PASSWORD RESET EMAIL
  // ------------------------------------------------------------
  const onSendReset = async event => {
    event.preventDefault()

    clearAlerts()

    if (!normalizedEmail()) {
      setError(
        'Please enter your email address.'
      )
      return
    }

    setLoading(true)

    try {
      const redirectTo =
        `${window.location.origin}/reset`

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail(),
          {
            redirectTo,
          }
        )

      if (resetError) {
        throw resetError
      }

      setMessage(
        '✅ Password reset email sent! Check your inbox and click the link to create a new password.'
      )
    } catch (resetError) {
      setError(
        resetError.message ||
          'Unable to send the password reset email.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* ===================================================== */}
        {/* SIGN IN */}
        {/* ===================================================== */}

        {mode === 'sign-in' && (
          <>
            <h1>Sign In</h1>

            <p className="intro-text">
              Sign in with your Fantasy Spreads League
              email and password.
            </p>

            <AlertMessage
              message={message}
              error={error}
            />

            <form onSubmit={onSignIn}>
              <label>Email</label>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
              />

              <label>Password</label>

              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event =>
                  setPassword(event.target.value)
                }
                placeholder="••••••••"
              />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Signing In…'
                  : 'Sign In'}
              </button>
            </form>

            <div className="divider">
              <span>OR</span>
            </div>

            <button
              type="button"
              className="secondary-button returning-button"
              onClick={() =>
                changeMode('returning')
              }
            >
              Returning Player
            </button>

            <p className="helper-text">
              Played last season but don't remember
              your password? Use Returning Player for
              an easy email sign-in.
            </p>

            <div className="bottom-links">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('sign-up')
                }
              >
                New Player? Join League
              </button>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('reset')
                }
              >
                Forgot Password?
              </button>
            </div>
          </>
        )}

        {/* ===================================================== */}
        {/* RETURNING PLAYER */}
        {/* ===================================================== */}

        {mode === 'returning' && (
          <>
            <h1>Returning Player</h1>

            <p className="intro-text">
              Enter the email you used last season
              and the league password. We'll email
              you a secure sign-in link.
            </p>

            <AlertMessage
              message={message}
              error={error}
            />

            <form onSubmit={onReturningPlayer}>
              <label>Email</label>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
              />

              <label>League Password</label>

              <input
                type="password"
                autoComplete="off"
                value={leaguePassword}
                onChange={event =>
                  setLeaguePassword(
                    event.target.value
                  )
                }
                placeholder="League password"
              />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Sending Link…'
                  : 'Email Me a Sign-In Link'}
              </button>
            </form>

            <p className="helper-text">
              For security, the sign-in link is sent
              only to the email address associated
              with your account.
            </p>

            <div className="bottom-links">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('sign-in')
                }
              >
                Sign In With Password
              </button>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('reset')
                }
              >
                Reset My Password
              </button>
            </div>
          </>
        )}

        {/* ===================================================== */}
        {/* SIGN UP */}
        {/* ===================================================== */}

        {mode === 'sign-up' && (
          <>
            <h1>Join League</h1>

            <p className="intro-text">
              New player? Create your Fantasy
              Spreads League account.
            </p>

            <AlertMessage
              message={message}
              error={error}
            />

            <form onSubmit={onSignUp}>
              <label>First Name</label>

              <input
                value={firstName}
                onChange={event =>
                  setFirstName(
                    event.target.value
                  )
                }
                placeholder="First name"
                autoComplete="given-name"
              />

              <label>Last Name</label>

              <input
                value={lastName}
                onChange={event =>
                  setLastName(
                    event.target.value
                  )
                }
                placeholder="Last name"
                autoComplete="family-name"
              />

              <label>Email</label>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
              />

              <label>Create Password</label>

              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={event =>
                  setPassword(
                    event.target.value
                  )
                }
                placeholder="At least 6 characters"
              />

              <label>League Password</label>

              <input
                type="password"
                autoComplete="off"
                value={leaguePassword}
                onChange={event =>
                  setLeaguePassword(
                    event.target.value
                  )
                }
                placeholder="League password"
              />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Creating Account…'
                  : 'Join League'}
              </button>
            </form>

            <div className="bottom-links">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('returning')
                }
              >
                Returning Player
              </button>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('sign-in')
                }
              >
                Already Have a Password?
              </button>
            </div>
          </>
        )}

        {/* ===================================================== */}
        {/* FORGOT PASSWORD */}
        {/* ===================================================== */}

        {mode === 'reset' && (
          <>
            <h1>Reset Password</h1>

            <p className="intro-text">
              Enter the email address you used to
              join Fantasy Spreads League.
            </p>

            <AlertMessage
              message={message}
              error={error}
            />

            <form onSubmit={onSendReset}>
              <label>Email</label>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
              />

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Sending Reset Link…'
                  : 'Send Reset Link'}
              </button>
            </form>

            <p className="helper-text">
              We'll email you a secure link. Click
              it to create a new password.
            </p>

            <div className="bottom-links">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('sign-in')
                }
              >
                Back to Sign In
              </button>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeMode('returning')
                }
              >
                Use Returning Player Instead
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .auth-page {
          min-height: calc(100vh - 80px);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 48px 16px;
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
        }

        h1 {
          margin: 0 0 10px;
          font-size: 28px;
        }

        .intro-text {
          margin: 0 0 22px;
          line-height: 1.5;
          color: #cbd5e1;
        }

        form {
          width: 100%;
        }

        label {
          display: block;
          margin: 0 0 5px;
          font-weight: 600;
        }

        input {
          box-sizing: border-box;
          display: block;
          width: 100%;
          margin: 0 0 14px;
          padding: 11px 12px;
          border: 1px solid #94a3b8;
          border-radius: 6px;
          background: #ffffff;
          color: #111827;
          font-size: 16px;
        }

        input:focus {
          outline: 3px solid
            rgba(37, 99, 235, 0.3);
          border-color: #2563eb;
        }

        .primary-button,
        .secondary-button {
          appearance: none;
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 80ms ease,
            box-shadow 80ms ease,
            background-color 150ms ease;
        }

        .primary-button {
          border: 1px solid #6d28d9;
          background: #7c3aed;
          color: #ffffff;
          box-shadow: 0 4px 0 #4c1d95;
        }

        .primary-button:hover:not(:disabled) {
          background: #6d28d9;
        }

        .primary-button:active:not(:disabled) {
          transform: translateY(4px);
          box-shadow: 0 0 0 #4c1d95;
        }

        .secondary-button {
          border: 1px solid #ca8a04;
          background: #eab308;
          color: #111827;
          box-shadow: 0 4px 0 #a16207;
        }

        .secondary-button:hover:not(:disabled) {
          background: #ca8a04;
        }

        .secondary-button:active:not(:disabled) {
          transform: translateY(4px);
          box-shadow: 0 0 0 #a16207;
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
        }

        .divider::before,
        .divider::after {
          content: '';
          height: 1px;
          flex: 1;
          background: #334155;
        }

        .helper-text {
          margin: 12px 0 0;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.5;
        }

        .bottom-links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          margin-top: 24px;
        }

        .text-button {
          appearance: none;
          padding: 0;
          border: 0;
          background: transparent;
          color: #c4b5fd;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }

        .text-button:hover {
          color: #ffffff;
        }

        .alert {
          margin: 0 0 18px;
          padding: 12px 14px;
          border: 1px solid;
          border-radius: 8px;
          font-weight: 600;
          line-height: 1.45;
        }

        .success {
          border-color: #86efac;
          background: #dcfce7;
          color: #166534;
        }

        .error {
          border-color: #fca5a5;
          background: #fee2e2;
          color: #991b1b;
        }
      `}</style>
    </div>
  )
}

function AlertMessage({
  message,
  error,
}) {
  if (error) {
    return (
      <div
        className="alert error"
        role="alert"
      >
        {error}

        <style jsx>{`
          .alert {
            margin: 0 0 18px;
            padding: 12px 14px;
            border: 1px solid;
            border-radius: 8px;
            font-weight: 600;
            line-height: 1.45;
          }

          .error {
            border-color: #fca5a5;
            background: #fee2e2;
            color: #991b1b;
          }
        `}</style>
      </div>
    )
  }

  if (message) {
    return (
      <div
        className="alert success"
        role="status"
        aria-live="polite"
      >
        {message}

        <style jsx>{`
          .alert {
            margin: 0 0 18px;
            padding: 12px 14px;
            border: 1px solid;
            border-radius: 8px;
            font-weight: 600;
            line-height: 1.45;
          }

          .success {
            border-color: #86efac;
            background: #dcfce7;
            color: #166534;
          }
        `}</style>
      </div>
    )
  }

  return null
}
