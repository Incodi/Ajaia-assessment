import { expect, test } from '@playwright/test';

async function login(page, username) {
  await page.goto('/');
  await page.getByLabel('User').selectOption({ label: username });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();
}

test('owner edits, formats, autosaves, reopens, and deletes a document', async ({ page }) => {
  await login(page, 'emma');
  await page.getByRole('button', { name: 'New document' }).click();

  const title = page.getByLabel('Document title');
  const body = page.getByRole('textbox', { name: 'Document content' });
  await title.fill('Browser autosave document');
  await body.fill('Saved from a real browser');
  await body.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.getByRole('button', { name: 'B' }).click();
  await expect(body).toContainText('Saved from a real browser');
  await expect.poll(() => body.locator('b, strong').count()).toBe(1);
  await expect(page.locator('.save-status')).toHaveText('Unsaved changes');
  await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

  await page.getByRole('link', { name: 'All documents' }).click();
  await page.getByRole('button', { name: /Browser autosave document/ }).click();
  await expect(page.getByLabel('Document title')).toHaveValue('Browser autosave document');
  await expect(page.getByRole('textbox', { name: 'Document content' }).locator('b, strong'))
    .toHaveText('Saved from a real browser');

  const attachments = page.locator('.attachments-panel');
  const dangerousMenu = page.locator('.danger-dropdown');
  await expect(attachments).toBeVisible();
  await expect(dangerousMenu).toBeVisible();
  await expect(dangerousMenu).not.toHaveAttribute('open', '');
  await expect(attachments.locator('xpath=following-sibling::*[1]')).toHaveClass(/danger-dropdown/);
  await dangerousMenu.locator('summary').click();
  await page.getByRole('button', { name: 'Delete document' }).click();
  await expect(page.getByText('Delete this document permanently?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Delete document' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete document' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Browser autosave document/ })).toHaveCount(0);
});

test('sharee can edit and autosave but does not see owner controls', async ({ page }) => {
  await login(page, 'emma');
  await page.getByRole('button', { name: 'New document' }).click();

  const title = page.getByLabel('Document title');
  const body = page.getByRole('textbox', { name: 'Document content' });
  await title.fill('Shared browser document');
  await body.fill('Owner content');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.save-status')).toHaveText('Saved');

  await page.getByLabel('Username').fill('ishmael');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.locator('.collaborator-list')).toContainText('ishmael');
  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'ishmael');

  await page.getByRole('button', { name: /Shared browser document/ }).click();
  await expect(page.getByLabel('Shared document')).toHaveValue('Shared browser document');
  await expect(page.getByLabel('Shared document')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('heading', { name: 'Share document' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete document' })).toHaveCount(0);

  const sharedBody = page.getByRole('textbox', { name: 'Document content' });
  await sharedBody.fill('Edited by Ishmael');
  await expect(page.locator('.save-status')).toHaveText('Unsaved changes');
  await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toHaveText('Edited by Ishmael');
});
