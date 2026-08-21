import Link from "next/link";

export default function Home() {
  return (
    <main className="shell homeShell">
      <section className="card homeCard" aria-labelledby="home-title">
        <h1 className="brand" id="home-title">BM OS</h1>
        <nav className="homeLinks" aria-label="BM OS destinations">
          <Link href="/kiosk">Time Clock</Link>
          <Link href="/login">Log In</Link>
        </nav>
      </section>
    </main>
  );
}
