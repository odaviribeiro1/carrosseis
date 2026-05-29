import { test, expect } from '@playwright/test';
import { attachCapture, gotoTimed, logTiming, screenshot, SLOW_MS } from './_helpers';
import { loginAsOwner } from '../fixtures/auth';

// Visit every authenticated route as owner; capture console/page/network errors, timing,
// and a screenshot. This is the net that catches broken queries / RLS / schema-exposure bugs.

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/create', name: 'create-carousel' },
  { path: '/settings/members', name: 'members' },
  { path: '/settings/credentials', name: 'credentials' },
];

test.describe('authed routes health', () => {
  for (const r of ROUTES) {
    test(`route ${r.path} loads cleanly`, async ({ page }, info) => {
      const cap = attachCapture(page);
      await loginAsOwner(page);
      const ms = await gotoTimed(page, r.path);
      logTiming(`${r.path} (authed)`, ms);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body')).toBeVisible();
      // not bounced back to /login
      await expect(page).not.toHaveURL(/\/login/);
      await screenshot(page, info, `authed-${r.name}`);

      // surface (don't hard-fail on benign) — assert no fatal page errors / 5xx
      const fatalConsole = cap.consoleErrors.filter(
        (e) => !/favicon|Failed to load resource.*(401|403|404)|net::ERR_/i.test(e),
      );
      const serverErrors = cap.failedRequests.filter((f) => /^(5\d\d) /.test(f));
      expect(cap.pageErrors, `${r.path} uncaught errors`).toEqual([]);
      expect(serverErrors, `${r.path} 5xx requests`).toEqual([]);
      if (fatalConsole.length) {
        test.info().annotations.push({ type: 'console', description: `${r.path}: ${fatalConsole.join(' | ')}` });
      }
      if (ms > SLOW_MS) test.info().annotations.push({ type: 'slow', description: `${r.path} ${ms}ms` });
    });
  }
});
