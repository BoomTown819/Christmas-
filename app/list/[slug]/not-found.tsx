import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="main">
      <section className="empty" style={{ marginTop: 40 }}>
        <h2>We couldn’t find that wishlist</h2>
        <p>The link may have a typo, or its owner made a new link. Ask them to send it again.</p>
        <div className="empty-actions"><Link href="/" className="btn btn-primary">Go to Our Christmas</Link></div>
      </section>
    </main>
  );
}
