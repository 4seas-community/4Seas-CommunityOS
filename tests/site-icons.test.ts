/**
 * Icons must be plain static files. On Cloudflare Pages, _routes.json sends
 * /*.png and /*.ico to static assets, so app/ icon conventions (which Next
 * emits as Worker routes) 404 in production — /icon.png did after #38.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

  it('no app/ metadata image routes whose extension Pages sends to static assets', () => {
    // Read the exclude list from the stage script so the premise can't silently drift.
    const stage = readFileSync(join(root, 'scripts/cf-stage.sh'), 'utf8');
    const routes = JSON.parse(stage.slice(stage.indexOf("<< 'ROUTES'") + 11, stage.indexOf('\nROUTES', stage.indexOf("<< 'ROUTES'"))));
    const excludedExts = (routes.exclude as string[])
      .filter((p) => p.startsWith('/*.'))
      .map((p) => p.slice(2));
    expect(excludedExts).toContain('.png');

    // Next file conventions that become routes: favicon, icon*, apple-icon*, opengraph-image*, twitter-image*.
    const convention = /^(favicon|icon\d*|apple-icon\d*|opengraph-image\d*|twitter-image\d*)\.[a-z]+$/;
    const offenders = (readdirSync(join(root, 'src/app'), { recursive: true }) as string[])
      .filter((f) => convention.test(f.split('/').pop()!))
      .filter((f) => excludedExts.some((ext) => f.endsWith(ext)));
    expect(offenders).toEqual([]);
  });
});
