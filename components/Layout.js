// components/Layout.js
import Link from './LegacyLink'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/30 backdrop-blur">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 group">
              {/* Swap /logo.svg with your real file in /public */}
              <img src="/logo.png" alt="Football Junkie" className="h-8 w-8" />
              <span className="font-display text-lg tracking-wide group-hover:opacity-90">
                Football Junkie
              </span>
            </a>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/picks"><a className="link-muted">Submit Picks</a></Link>
            <Link href="/dashboard"><a className="link-muted">Dashboard</a></Link>
            <Link href="/nfl-scores"><a className="link-muted">NFL Scores</a></Link>
            {/* <- Requested label change lives here */}
            <Link href="/join">
              <a className="btn-primary">Join League / Sign In</a>
            </Link>
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} Football Junkie
      </footer>
    </div>
  )
}
