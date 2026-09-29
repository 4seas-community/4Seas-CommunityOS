import type { Metadata } from 'next';
import { canUseAdmin, getCurrentMember } from '../lib/session-server';
import Image from 'next/image';
import Link from 'next/link';
import logo from '../../public/4seas-logo.png';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '4Seas CommunityOS',
    template: '%s · 4Seas CommunityOS',
  },
  description: 'Organize the Place, Event, and People for Community.',
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/venues', label: 'Venues' },
  { href: '/create', label: 'Create' },
  { href: '/me', label: 'Me' },
  { href: '/admin', label: 'Admin' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  const isAdminUser = canUseAdmin(member);
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand" aria-label="4Seas CommunityOS home">
              <Image src={logo} alt="4Seas" width={100} height={23} style={{ height: 23, width: 'auto' }} priority />
              <span>
                Community<small>OS</small>
              </span>
            </Link>
            <nav className="site-nav" aria-label="Primary">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={item.href === '/admin' && isAdminUser ? { fontWeight: 600 } : undefined}
                >
                  {item.label}
                  {item.href === '/admin' && isAdminUser && (
                    <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>●</span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <div className="container">{children}</div>
        </main>

        <footer className="site-footer">
          <div className="container row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>4Seas CommunityOS — Place · Event · People</span>
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <Link href="/admin" className="muted" style={{ textDecoration: 'underline' }}>
                Admin Console
              </Link>
              <span>Chiang Mai · Asia/Bangkok</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}