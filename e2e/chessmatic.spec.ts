import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { encodePuzzle } from '../src/lib/puzzle-link';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;
const appPath = process.env.BASE_PATH ?? '/';
const firstPuzzleName = data.puzzles[0].name;

test('places the optimal setup and completes a battle', async ({ page }) => {
  await page.goto(appPath);
  await expect(page.getByRole('heading', { name: /Chessmatic/ })).toBeVisible();
  await expect(page.getByText(firstPuzzleName)).toBeVisible();
  await expect(page.getByRole('button', { name: 'VI', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Spoiler' }).click();
  await page.getByRole('button', { name: 'Reveal optimal?' }).click();
  await expect(page.getByText('Spend').locator('..')).toContainText(`${data.puzzles[0].optimalCost} pts`);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Position won' })).toBeVisible();
  await expect(dialog).toContainText('That is the cheapest possible answer.');

  await page.reload();
  const solvedChip = page.getByRole('button', { name: new RegExp(`^I ?${data.puzzles[0].optimalCost}$`) });
  await expect(solvedChip).toBeVisible();
  await expect(solvedChip).toHaveAttribute('title', `Solved — best ${data.puzzles[0].optimalCost} pts`);
  await expect(page.getByRole('button', { name: 'II', exact: true })).toHaveAttribute('title', 'Start here');
});

test('steps through the scoresheet and scrubs the previous run', async ({ page }) => {
  await page.goto(appPath);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Spoiler' }).click();
  await page.getByRole('button', { name: 'Reveal optimal?' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  const firstMove = page.locator('.sheet button.mv').first();
  await firstMove.click();
  await expect(firstMove).toHaveClass(/sel/);

  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(firstMove).toHaveClass(/sel/);

  await page.getByRole('button', { name: 'Rewind to setup' }).click();
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy replay link' }).click();
  await expect(page.locator('.sheet')).toContainText(/Replay link (copied|ready)/);
  await expect(firstMove).not.toHaveClass(/sel/);
  await firstMove.click();
  await expect(firstMove).toHaveClass(/sel/);
});

test('loads a shared replay link with the solution pre-placed', async ({ page }) => {
  const code = encodePuzzle({
    name: 'Shared Replay',
    desc: 'Includes a solution.',
    targetCost: data.puzzles[0].par,
    enemy: data.puzzles[0].enemy,
    solution: data.puzzles[0].solution,
  }, data);
  await page.goto(`${appPath}#puzzle=${code}`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByText('Shared Replay')).toBeVisible();
  await expect(page.getByText(/shared solution/)).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Position won' })).toBeVisible();
});

test('creates and loads a custom puzzle from its hash route', async ({ page }) => {
  await page.goto(appPath);
  await page.getByRole('button', { name: 'Editor' }).click();
  const editorActions = page.locator('.editor-actions');
  await expect(editorActions.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(editorActions.locator('a, button')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Random' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Spoiler' })).toHaveCount(0);
  await page.getByLabel('Title').fill('Browser Test');
  await page.getByLabel('Target').fill('3');
  await page.getByLabel('Description').fill('Made in Playwright.');
  await page.getByRole('button', { name: /pawn · 2/i }).click();
  await page.getByRole('gridcell', { name: 'a1' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Browser Test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Shareable puzzle link')).toHaveValue(/#puzzle=/);

  const code = encodePuzzle({
    name: 'Old Link',
    desc: 'Still compatible.',
    targetCost: 2,
    enemy: [{ type: 'P', col: 0, row: 0 }],
  }, data);
  await page.goto(`${appPath}#puzzle=${code}`);
  await expect(page.getByText('Old Link')).toBeVisible();
  await expect(page.getByText('Still compatible.')).toBeVisible();

  const brand = page.getByRole('link', { name: 'Reset Chessmatic' });
  await expect(brand).toHaveAttribute('href', './');
  await brand.click();
  await expect(page).toHaveURL(new RegExp(`${appPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.getByText(firstPuzzleName)).toBeVisible();
});

test('supports keyboard placement', async ({ page }) => {
  await page.goto(appPath);
  await page.getByRole('button', { name: /pawn · 2/i }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: 'h1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('gridcell', { name: /h1, your pawn, turn/ })).toBeVisible();
});

test('generates random puzzles and a repeatable UTC daily puzzle', async ({ page }) => {
  await page.goto(appPath);
  const daily = page.getByRole('link', { name: 'DAILY', exact: true });
  const random = page.getByRole('link', { name: 'Random', exact: true });
  const expectedDate = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const utilityActions = page.locator('.utility-actions').locator('a, button');

  await expect(utilityActions.nth(0)).toHaveText('Random');
  await expect(utilityActions.nth(1)).toHaveText('Editor');
  await expect(daily).toHaveAttribute('href', '#daily');
  await expect(random).toHaveAttribute('href', '#random');
  await daily.click();
  await expect(page).toHaveURL(/#daily$/);
  await expect(page.getByText('Daily Challenge')).toBeVisible();
  await expect(page.getByText(`Generated for ${expectedDate} UTC.`)).toBeVisible();
  await expect(daily).toHaveAttribute('aria-current', 'page');
  const firstDailySetup = await page.getByRole('gridcell').evaluateAll((cells) => cells
    .map((cell) => cell.getAttribute('aria-label'))
    .filter((label) => label?.includes(', enemy ')));

  await page.reload();
  const secondDailySetup = await page.getByRole('gridcell').evaluateAll((cells) => cells
    .map((cell) => cell.getAttribute('aria-label'))
    .filter((label) => label?.includes(', enemy ')));
  expect(secondDailySetup).toEqual(firstDailySetup);

  await random.click();
  await expect(page).toHaveURL(/#random=[A-Za-z0-9-]+$/);
  await expect(page.getByText('Random Challenge')).toBeVisible();
  await expect(page.getByText(/^Generated from seed /)).toBeVisible();
  await expect(random).toHaveAttribute('aria-current', 'page');
  const randomSetup = await page.getByRole('gridcell').evaluateAll((cells) => cells
    .map((cell) => cell.getAttribute('aria-label'))
    .filter((label) => label?.includes(', enemy ')));
  await page.reload();
  const reloadedRandomSetup = await page.getByRole('gridcell').evaluateAll((cells) => cells
    .map((cell) => cell.getAttribute('aria-label'))
    .filter((label) => label?.includes(', enemy ')));
  expect(reloadedRandomSetup).toEqual(randomSetup);
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
    await expect(page.getByText(firstPuzzleName)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
