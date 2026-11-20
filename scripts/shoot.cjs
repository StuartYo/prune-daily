// Screenshots of the local preview at several widths. Usage: node scripts/shoot.cjs <outDir> <day> <movesJSON>
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const [out, day, movesJson] = process.argv.slice(2);
const moves = JSON.parse(movesJson);
const sizes = [[1440, 900], [390, 844], [1920, 945], [1366, 768]];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, hasTouch: w < 500 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const tag = `${w}`;
    await page.goto(`http://localhost:5199/splash.html?day=${day}&reset=1`);
    await page.setViewportSize({ width: w, height: w < 500 ? 512 : 512 });
    await page.waitForSelector('.splash-title');
    await page.screenshot({ path: `${out}/${tag}_0_splash.png` });
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`http://localhost:5199/game.html?day=${day}`);
    await page.waitForSelector('.hit');
    await page.screenshot({ path: `${out}/${tag}_1_start.png` });
    for (let s = 0; s < moves.length; s++) {
      for (const id of moves[s]) {
        await page.locator(`.hit[data-id="${id}"]`).dispatchEvent('click');
        await page.waitForTimeout(350);
      }
      if (s === 0) await page.screenshot({ path: `${out}/${tag}_2_snipped.png` });
      await page.getByRole('button', { name: /^Grow/ }).click();
      if (s === 1) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/${tag}_3_growing.png` });
      }
      await page.waitForTimeout(1700);
    }
    await page.waitForSelector('.score');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}_4_result.png` });
    await page.getByRole('button', { name: /grove/i }).click();
    await page.waitForSelector('.plot');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}_5_grove.png` });
    console.log(tag, errors.length ? errors : 'no console errors');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
