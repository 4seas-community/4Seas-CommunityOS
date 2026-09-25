import type { Metadata } from 'next';
import Image from 'next/image';
import logo from '../../public/4seas-logo.png';
import './globals.css';

export const metadata: Metadata = {
  title: '4Seas CommunityOS',
  description: 'Organize the Place, Event, and People for Community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <Image src={logo} alt="4Seas" width={100} height={23} style={{ height: 23, width: 'auto' }} priority />
          <strong>CommunityOS</strong>
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
