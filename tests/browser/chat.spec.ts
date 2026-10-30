import { test, expect, type Page } from '@playwright/test';
async function connect(page: Page) {
  await page.goto('/tests/chat.html');
  await page
    .getByRole('button', { name: 'Connect a provider', exact: true })
    .click();
  const card = page.getByRole('region', { name: 'OpenAI API', exact: true });
  await card
    .getByLabel('OpenAI API API key', { exact: true })
    .fill('fixture-key');
  await card
    .getByRole('button', { name: 'Connect API key', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Select model', exact: true }).click();
  await page.getByRole('option', { name: 'Fixture One', exact: true }).click();
}
test('connects, selects a model, streams Markdown, copies, follows up, and changes model', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await connect(page);
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Hello');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  await expect(page.getByLabel('Copy code', { exact: true })).toBeVisible();
  await page.getByLabel('Copy code', { exact: true }).click();
  await expect(page.getByLabel('Code copied')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('A follow-up');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.chatFixture.requests.length))
    .toBe(2);
  expect(
    await page.evaluate(() => window.chatFixture.requests[1]?.messages.length),
  ).toBe(3);
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Select model', exact: true }).click();
  await page.getByRole('option', { name: 'Fixture Two', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Message', exact: true }),
  ).toBeEmpty();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.cache/chat-desktop.png', fullPage: true });
});
test('cancels partial replies, excludes them from context, and prevents duplicate sends', async ({
  page,
}) => {
  await connect(page);
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('slow');
  await page
    .getByRole('button', { name: 'Send message', exact: true })
    .dblclick();
  await expect(
    page.getByRole('button', { name: 'Stop generation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Message', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('combobox', { name: 'AI provider connection' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Stop generation', exact: true })
    .click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.chatFixture.requests.length)).toBe(1);
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Continue');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.chatFixture.requests[1]?.messages.map((message) => message.role),
    ),
  ).toEqual(['user', 'user']);
});
test('supports multiline input, provider errors, and a clean new chat', async ({
  page,
}) => {
  await connect(page);
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  await composer.fill('first');
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('first\n');
  await composer.fill('provider error');
  await composer.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Provider rate limit');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'What’s on your mind?' }),
  ).toBeVisible();
});
test('collapses navigation into an accessible sheet at narrow window sizes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/tests/chat.html');
  await page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Connections', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: 'Your AI connections' }),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 700);
});
test('restores durable conversations and supports search, rename, pin, export and confirmed deletion', async ({
  page,
}) => {
  await connect(page);
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Remember this conversation');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true }),
  ).toBeVisible();
  const history = page.getByRole('region', { name: 'Conversation history' });
  await expect(
    history.getByRole('button', {
      name: 'Remember this conversation',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'AI provider connection' }),
  ).toContainText('OpenAI API');
  await expect(
    page.getByRole('button', { name: 'Select model', exact: true }),
  ).toContainText('Fixture One');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: 'Remember this conversation',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await history
    .getByRole('button', {
      name: 'Rename Remember this conversation',
      exact: true,
    })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('A saved answer');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await history
    .getByRole('button', { name: 'Pin A saved answer', exact: true })
    .click();
  await expect(
    history.getByRole('button', { name: 'Unpin A saved answer', exact: true }),
  ).toBeVisible();
  await history
    .getByRole('searchbox', { name: 'Conversations', exact: true })
    .fill('missing');
  await expect(history.getByText('No matching conversations.')).toBeVisible();
  await history
    .getByRole('searchbox', { name: 'Conversations', exact: true })
    .fill('saved');
  await history
    .getByRole('button', { name: 'Copy export of A saved answer', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.chatFixture.copied.length))
    .toBe(1);
  const exported = await page.evaluate(
    () =>
      JSON.parse(window.chatFixture.copied[0] ?? '{}') as {
        conversation: { title: string };
      },
  );
  expect(exported.conversation.title).toBe('A saved answer');
  await history
    .getByRole('button', { name: 'Delete A saved answer', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    history.getByRole('button', { name: 'A saved answer', exact: true }),
  ).toBeVisible();
  await history
    .getByRole('button', { name: 'Delete A saved answer', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Delete conversation', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'What’s on your mind?' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    history.getByRole('button', { name: 'A saved answer', exact: true }),
  ).toHaveCount(0);
});
test('switching away stops a generation and restores its partial reply', async ({
  page,
}) => {
  await connect(page);
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  await composer.fill('slow saved response');
  await composer.press('Enter');
  await expect(
    page.getByText('A partial response waiting for cancellation.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page
    .getByRole('button', { name: 'slow saved response', exact: true })
    .click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(
    page.getByText('A partial response waiting for cancellation.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send message', exact: true }),
  ).toBeVisible();
});
