/**
 * Icons must be plain static files. On Cloudflare Pages, _routes.json sends
 * /*.png and /*.ico to static assets, so app/ icon conventions (which Next
 * emits as Worker routes) 404 in production — /icon.png did after #38.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { metadata } from '../src/app/layout';

const root = join(__dirname, '..');

function iconUrls(): string[] {
  const icons = metadata.icons as { icon: Array<{ url: string }>; apple: { url: string } };
  return [...icons.icon.map((i) => i.url), icons.apple.url];
}

describe('site icons', () => {
  it('declares favicon, png icon and apple touch icon', () => {
    expect(iconUrls()).toEqual(['/favicon.ico', '/icon.png', '/apple-icon.png']);
  });

  it('every declared icon exists in public/', () => {
    for (const url of iconUrls()) expect(existsSync(join(root, 'public', url)), url).toBe(true);
  });

  it('no app/ icon route files that Pages would bypass', () => {
    for (const f of ['favicon.ico', 'icon.png', 'apple-icon.png', 'icon.ico', 'apple-icon.jpg']) {
      expect(existsSync(join(root, 'src/app', f)), 'src/app/' + f).toBe(false);
    }
  });
});
