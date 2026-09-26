import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '4Seas CommunityOS',
  description: 'Organize the Place, Event, and People for Community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', gap: 16 }}>
          <strong>4Seas CommunityOS</strong>
          <nav style={{ display: 'flex', gap: 12, fontSize: 14 }}>
            <a href="/">Home</a>
            <a href="/events">Events</a>
            <a href="/venues">Venues</a>
            <a href="/create">Create</a>
            <a href="/me">Me</a>
          </nav>
        </header>
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
