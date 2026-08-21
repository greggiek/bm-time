import Link from 'next/link';

export default function LoginChoicePage() {
  return (
    <main className="shell homeShell">
      <section className="card loginChoiceCard" aria-labelledby="login-title">
        <div className="brand">BM OS</div>
        <h1 id="login-title">Log In</h1>
        <nav className="homeLinks" aria-label="Choose a BM OS login method">
          <Link href="/manager">PIN</Link>
          <Link href="/login/email">Google Workspace</Link>
        </nav>
        <Link className="loginBack" href="/">Back</Link>
      </section>
    </main>
  );
}
