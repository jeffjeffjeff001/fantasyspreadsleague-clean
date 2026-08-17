// pages/reset.js

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [ready, setReady] =
    useState(false)

  const [error, setError] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [confirm, setConfirm] =
    useState('')

  const [saving, setSaving] =
    useState(false)

  // ------------------------------------------------------------
  // Validate the recovery link and establish
  // the temporary authenticated recovery session.
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function prepareRecoverySession() {
      try {
        const params =
          new URLSearchParams(
            window.location.search
          )

        const code =
          params.get('code')

        // PKCE-style recovery links contain a code.
        if (code) {
          const {
            error: exchangeError,
          } =
            await supabase.auth
              .exchangeCodeForSession(code)

          if (exchangeError) {
            // The client may already have exchanged
            // the code automatically. Check whether
            // a valid session exists before failing.
            const {
              data: {
                session:
                  existingSession,
              },
            } =
              await supabase.auth
                .getSession()

            if (!existingSession) {
              throw exchangeError
            }
          }
        }

        const {
          data: { session },
          error: sessionError,
        } =
          await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session) {
          throw new Error(
            'No recovery session found.'
          )
        }

        if (!cancelled) {
          setError('')
          setReady(true)
        }
      } catch (recoveryError) {
        console.error(
          'Password recovery error:',
          recoveryError
        )

        if (!cancelled) {
          setError(
            'This password reset link is invalid or has expired. Please request a new reset link.'
          )

          setReady(true)
        }
      }
    }

    prepareRecoverySession()

    return () => {
      cancelled = true
    }
  }, [])

  const handleUpdate =
    async event => {
      event.preventDefault()

      setError('')
      setMessage('')

      if (
        !password ||
        password.length < 6
      ) {
        setError(
          'Password must be at least 6 characters.'
        )
        return
      }

      if (password !== confirm) {
        setError(
          'Passwords do not match.'
        )
        return
      }

      setSaving(true)

      try {
        const {
          error: updateError,
        } =
          await supabase.auth.updateUser({
            password,
          })

        if (updateError) {
          throw updateError
        }

        setPassword('')
        setConfirm('')

        setMessage(
          '✅ Password updated successfully! Redirecting you back to Fantasy Spreads League…'
        )

        setTimeout(() => {
          router.replace('/')
        }, 1200)
      } catch (updateError) {
        setError(
          updateError.message ||
            'Could not update your password.'
        )
      } finally {
        setSaving(false)
      }
    }

  const requestAnotherLink = () => {
    router.replace(
      '/auth?mode=reset'
    )
  }

  return (
    <div className="reset-page">
      <div className="reset-card">
        <h1>Create New Password</h1>

        {!ready ? (
          <p>
            Validating your reset link…
          </p>
        ) : (
          <>
            {error && (
              <div
                className="alert error"
                role="alert"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                className="alert success"
                role="status"
                aria-live="polite"
              >
                {message}
              </div>
            )}

            {!message &&
              !error && (
                <>
                  <p className="intro-text">
                    Enter your new Fantasy
                    Spreads League password
                    below.
                  </p>

                  <form
                    onSubmit={
                      handleUpdate
                    }
                  >
                    <label>
                      New Password
                    </label>

                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={event =>
                        setPassword(
                          event.target
                            .value
                        )
                      }
                      placeholder="At least 6 characters"
                    />

                    <label>
                      Confirm New Password
                    </label>

                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={event =>
                        setConfirm(
                          event.target
                            .value
                        )
                      }
                      placeholder="Re-enter password"
                    />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={saving}
                    >
                      {saving
                        ? 'Updating Password…'
                        : 'Update Password'}
                    </button>
                  </form>
                </>
              )}

            {error && (
              <button
                type="button"
                className="secondary-button"
                onClick={
                  requestAnotherLink
                }
              >
                Request Another Reset Link
              </button>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .reset-page {
          min-height: calc(100vh - 80px);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 48px 16px;
        }

        .reset-card {
          width: 100%;
          max-width: 440px;
        }

        h1 {
          margin: 0 0 12px;
          font-size: 28px;
        }

        .intro-text {
          margin: 0 0 22px;
          color: #cbd5e1;
          line-height: 1.5;
        }

        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
        }

        input {
          box-sizing: border-box;
          display: block;
          width: 100%;
          margin-bottom: 14px;
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
          margin-top: 12px;
          border: 1px solid #64748b;
          background: #475569;
          color: #ffffff;
          box-shadow: 0 4px 0 #334155;
        }

        .secondary-button:active {
          transform: translateY(4px);
          box-shadow: none;
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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
