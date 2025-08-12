// pages/index.js
import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>Fantasy Spreads League</title>
      </Head>

      {/* Centered hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-6 py-16 text-center">
        <img
          src="/logo.png.png"             // <-- uses your current filename
          alt="Fantasy Spreads League"
          className="h-28 w-auto sm:h-40"
        />
        <h1 className="sr-only">Fantasy Spreads League</h1>
        <p className="text-xl sm:text-2xl text-slate-300">
          Where <span className="font-semibold text-white">Fantasy</span> Meets the{' '}
          <span className="font-semibold text-brand-400">Line</span>.
        </p>
      </section>
    </>
  )
}
