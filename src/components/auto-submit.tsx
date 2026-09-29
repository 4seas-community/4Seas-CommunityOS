'use client';

import { useEffect } from 'react';

/**
 * Submits a plain HTML form as soon as it mounts.
 *
 * Used by the magic-link landing pages: the form itself is a normal POST (works
 * with JavaScript disabled and is never triggered by a mail scanner merely
 * fetching the page), while a real browser submits it immediately, so clicking the
 * link in the email is still one click.
 */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [formId]);
  return null;
}
