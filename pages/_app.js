// pages/_app.js
import '../styles/globals.css'
import Link from '../components/LegacyLink'
import { AuthProvider } from '../context/AuthContext'
import { Analytics } from "@vercel/analytics/react"

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Site-wide header */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/">
              <a className="flex items-center gap-3">
                <img
                  src="/logo.png.png"  // put your file at /public/logo.svg (or change to /logo.png)
                  alt="Fantasy Spreads League"
                  className="h-8 w-8 object-contain"
                />
                <span className="text-lg font-semibold tracking-tight text-white">
                  Fantasy Spreads League
                </span>
              </a>
            </Link>

            <nav className="flex items-center gap-6 text-sm text-slate-300">
              <Link href="/picks"><a className="hover:text-white">Submit Picks</a></Link>
              <Link href="/dashboard"><a className="hover:text-white">Dashboard</a></Link>
              <Link href="/nfl-scores"><a className="hover:text-white">NFL Scores</a></Link>
              <Link href="/profile"><a className="hover:text-white">My Profile</a></Link>
              <Link href="/admin"><a className="hover:text-white">Admin</a></Link>

              <Link href="/join">
                <a className="ml-2 rounded-full bg-brand-500 px-4 py-2 font-medium text-white shadow-xl-soft hover:bg-brand-400">
                  Join League / Sign In
                </a>
              </Link>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Component {...pageProps} />
        </main>

        <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} Football Junkie
        </footer>
      </div>
      <Analytics />
    </AuthProvider>
  )
}
