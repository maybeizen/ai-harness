import { test, expect } from '@playwright/test';
test('walks launch, chat, project, analysis, edit, diff, tests, and cancel', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
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
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  await composer.fill('Remember this workflow');
  await composer.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  const history = page.getByRole('region', { name: 'Conversation history' });
  await expect(
    history.getByRole('button', {
      name: 'Remember this workflow',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Select model', exact: true }),
  ).toContainText('Fixture One');
  await expect(
    page.getByRole('heading', { name: 'A useful reply' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  const project = page.getByRole('dialog', { name: 'Create project' });
  await project.getByRole('textbox').first().fill('Fixture project');
  await project
    .getByRole('button', { name: 'Save project', exact: true })
    .click();
  await expect(project).not.toBeVisible();
  await page
    .getByRole('navigation', { name: 'Projects and directories' })
    .getByRole('button', { name: 'Fixture project', exact: true })
    .click();
  await expect(history).toContainText('Your conversations will appear here.');
  await page.locator('#execution-mode').selectOption('review');
  await page.locator('#agent-workspace').selectOption({
    label: 'Fixture workspace',
  });
  await page
    .getByRole('textbox', { name: 'Agent task', exact: true })
    .fill('Analyze this project');
  await page
    .getByRole('button', { name: 'Run agent task', exact: true })
    .click();
  await expect(
    page.getByText('Fixture analysis found one suggested edit.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Agent activity' }).getByRole('status'),
  ).toContainText('Completed');
  await page.locator('#execution-mode').selectOption('edit');
  await page
    .getByRole('textbox', { name: 'Agent task', exact: true })
    .fill('Apply the approved edit');
  await page
    .getByRole('button', { name: 'Run agent task', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Approval required · edit_file' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /edit_file · completed/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Toggle workspace panel' }).click();
  await page.getByRole('button', { name: 'Git changes', exact: true }).click();
  await page.getByRole('button', { name: 'src/app.ts', exact: true }).click();
  const diff = page.getByRole('region', { name: 'Diff review' });
  await expect(diff).toBeVisible();
  await expect(diff.getByRole('heading', { name: 'src/app.ts' })).toBeVisible();
  await diff.getByRole('button', { name: 'Unified', exact: true }).click();
  await diff.getByRole('button', { name: 'Split', exact: true }).click();
  await diff.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(
    diff.getByRole('button', { name: 'Accept', exact: true }),
  ).toHaveCount(0);
  await page.locator('#execution-mode').selectOption('agent');
  await page
    .getByRole('textbox', { name: 'Agent task', exact: true })
    .fill('Run the fixture tests');
  await page
    .getByRole('button', { name: 'Run agent task', exact: true })
    .click();
  const activity = page.getByRole('region', { name: 'Agent activity' });
  await expect(activity).toContainText('1 fixture test passed');
  await expect(
    activity.getByRole('heading', { name: /run_tests · completed/ }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Agent task', exact: true })
    .fill('slow task');
  await page
    .getByRole('button', { name: 'Run agent task', exact: true })
    .click();
  await expect(
    page.getByText('Fixture task is still running.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Stop agent task', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Agent activity' }).getByRole('status'),
  ).toContainText('Cancelled');
  expect(errors).toEqual([]);
});
