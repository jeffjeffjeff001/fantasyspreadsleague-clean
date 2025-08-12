// pages/index.js
import Link from '../components/LegacyLink'

export default function Home() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Fantasy Spreads League</h1>
      <nav style={{ marginTop: 20 }}>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin"><a>Admin</a></Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/join"><a>Join League / Sign in</a></Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/picks"><a>Submit Picks</a></Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/profile"><a>My Profile</a></Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/dashboard"><a>League Dashboard</a></Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/nfl-scores"><a>NFL Scores</a></Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
