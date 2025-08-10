// context/AuthContext.js
import { createContext, useState, useEffect, useContext } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

  // on load & on auth change
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.email)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.email)
      else setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(email) {
    const { data } = await supabase
      .from('profiles')
      .select('first_name,last_name,username,email')
      .eq('email', email)
      .single()
    setProfile(data)
  }

  return (
    <AuthContext.Provider value={{ session, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
