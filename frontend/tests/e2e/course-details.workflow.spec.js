import { test, expect } from '@playwright/test';

function json(body, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

async function setupShell(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'mock.header.signature');
    localStorage.setItem('role', 'student');
    localStorage.setItem('userId', 'student-1');
    localStorage.setItem('userName', 'Student Alpha');
  });

  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill(json({ success: true, settings: {} }));
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications', async (route) => {
    await route.fulfill(json({ success: true, items: [] }));
  });

  await page.route('**/api/users/me/notifications/read-all', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    await route.fulfill(json({ success: true }));
  });
}

test.describe('course details workflow', () => {
  test('course details uses schoolClass target for access and join requests', async ({ page }) => {
    const accessTargets = [];
    const joinBodies = [];

    await setupShell(page);

    await page.route('**/api/education/public-school-classes/class-1', async (route) => {
      await route.fulfill(json({
        success: true,
        item: {
          _id: 'course-1',
          id: 'class-1',
          classId: 'class-1',
          courseId: 'course-1',
          title: 'Alpha Class',
          description: 'Canonical course detail',
          category: 'Morning',
          price: 0,
          tags: ['math'],
          schoolClassRef: 'class-1',
          schoolClass: {
            _id: 'class-1',
            id: 'class-1',
            title: 'Alpha Class'
          }
        }
      }));
    });

    await page.route('**/api/education/course-access-status/*', async (route) => {
      const target = route.request().url().split('/').pop();
      accessTargets.push(target);
      await route.fulfill(json({ success: true, status: '' }));
    });

    await page.route('**/api/education/join-requests', async (route) => {
      joinBodies.push(route.request().postDataJSON());
      await route.fulfill(json({ success: true, message: 'Membership request saved.' }, 201));
    });

    await page.goto('/courses/class-1', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Alpha Class' })).toBeVisible();
    await expect.poll(() => accessTargets.at(-1)).toBe('class-1');

    await page.locator('.join-request-btn').click();

    await expect.poll(() => joinBodies.length).toBe(1);
    expect(joinBodies[0]).toEqual({ classId: 'class-1' });
    await expect(page.locator('.join-request-btn')).toBeDisabled();
  });
});
