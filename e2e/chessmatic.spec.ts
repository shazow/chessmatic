import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { encodePuzzle } from '../src/lib/puzzle-link';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;
const appPath = process.env.GITHUB_ACTIONS ? '/chessmatic/' : '/';

test('places the par setup and completes a battle', async ({ page }) => {
  await page.goto(appPath);
  await expect(page.getByRole('heading', { name: /Chessmatic/ })).toBeVisible();
  await expect(page.getByText('№1 · Lone Rook')).toBeVisible();

  await page.getByRole('button', { name: 'Spoiler' }).click();
  await page.getByRole('button', { name: 'Reveal par?' }).click();
  await expect(page.getByText('Spend').locator('..')).toContainText('4 pts');

  await page.getByRole('button', { name: 'Start battle' }).click();
  await page.getByRole('button', { name: 'Finish ≫' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Position won' })).toBeVisible();
  await expect(dialog).toContainText('Par. Perfect play.');
});

test('creates and loads a custom puzzle with the legacy hash format', async ({ page }) => {
  await page.goto(appPath);
  await page.getByRole('button', { name: 'Editor' }).click();
  await page.getByLabel('Title').fill('Browser Test');
  await page.getByLabel('Par').fill('3');
  await page.getByLabel('Description').fill('Made in Playwright.');
  await page.getByRole('button', { name: /pawn · 2/i }).click();
  await page.getByRole('gridcell', { name: 'a1' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Browser Test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Shareable puzzle link')).toHaveValue(/#\?puzzle=/);

  const code = encodePuzzle({
    name: 'Old Link',
    desc: 'Still compatible.',
    par: 2,
    enemy: [{ type: 'P', col: 0, row: 0 }],
  }, data);
  await page.goto(`${appPath}#?puzzle=${code}`);
  await expect(page.getByText('Old Link')).toBeVisible();
  await expect(page.getByText('Still compatible.')).toBeVisible();
});

test('supports keyboard placement', async ({ page }) => {
  await page.goto(appPath);
  await page.getByRole('button', { name: /pawn · 2/i }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: 'h1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('gridcell', { name: /h1, your pawn, turn/ })).toBeVisible();
});

test('drags pieces onto, across, and off the board', async ({ page }) => {
  await page.goto(appPath);
  const trayPawn = page.getByRole('button', { name: /pawn · 2/i });
  const h1 = page.getByRole('gridcell', { name: 'h1' });
  const trayBox = await trayPawn.boundingBox();
  const h1Box = await h1.boundingBox();
  expect(trayBox).not.toBeNull();
  expect(h1Box).not.toBeNull();

  await page.mouse.move(trayBox!.x + trayBox!.width / 2, trayBox!.y + trayBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(h1Box!.x + h1Box!.width / 2, h1Box!.y + h1Box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('gridcell', { name: /h1, your pawn, turn/ })).toBeVisible();

  const placedPawn = page.getByRole('gridcell', { name: /h1, your pawn, turn/ });
  const g2 = page.getByRole('gridcell', { name: 'g2' });
  const placedBox = await placedPawn.boundingBox();
  const g2Box = await g2.boundingBox();
  await page.mouse.move(placedBox!.x + placedBox!.width / 2, placedBox!.y + placedBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2Box!.x + g2Box!.width / 2, g2Box!.y + g2Box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('gridcell', { name: /g2, your pawn, turn/ })).toBeVisible();

  const movedBox = await page.getByRole('gridcell', { name: /g2, your pawn, turn/ }).boundingBox();
  await page.mouse.move(movedBox!.x + movedBox!.width / 2, movedBox!.y + movedBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('gridcell', { name: 'g2' })).toBeVisible();
});

test('reloads the production app while offline', async ({ page, context }) => {
  await page.goto(appPath);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Chessmatic/ })).toBeVisible();
    await expect(page.getByText('№1 · Lone Rook')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
