import type { Metadata } from 'next';
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
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <div className="container">{children}</div>
        </main>

        <footer className="site-footer">
          <div className="container row" style={{ justifyContent: 'space-between' }}>
            <span>4Seas CommunityOS — Place · Event · People</span>
            <span>Chiang Mai · Asia/Bangkok</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
