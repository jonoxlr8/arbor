// Integrated completion review: normal disposable-account authentication and
// guarded loopback fixture only. No hosted financial/profile writes, fake chart
// history, generated transactions or production feature changes.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {withAuthenticatedBrowser} from './auth.mjs';
import sharp from 'sharp';

const mode = process.argv[2] ?? 'plus';
assert.ok(['plus', 'onboarding', 'free'].includes(mode));
const output = '/tmp/arbor-completion-final';
await mkdir(output, {recursive:true});

// Exact decimal comparison for fixture assertions, not allocation generation.
const normalized = value => String(value).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const amounts = plan => Object.fromEntries(plan.rows.map(row => [row.sleeve, normalized(row.amount)]));
const targets = value => Object.fromEntries(value.plan.final_allocation.map(row => [row.role, row.percentage_points]));
const holdingRecords = value => value.holdings.map(h => ({id:h.id, product:h.product_id, units:h.units, manual:h.manual_value_php}));

await withAuthenticatedBrowser(async ({page, context, reused}) => {
  let stage = 'fixture guard', api, authorization, pageErrors = 0, consoleErrors = 0, blockedWrites = 0, expectedMissingProfile = 0;
  const screenshots = [], results = {}, failedResponses = [], portfolioRequests = [];
  page.setDefaultTimeout(25000);
  page.on('pageerror', () => pageErrors++);
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (mode === 'onboarding' && location && new URL(location).pathname === '/profiles/me' && /404/.test(message.text())) expectedMissingProfile++;
    else consoleErrors++;
  });
  page.on('response', result => {
    const url = new URL(result.url());
    if (result.status() >= 400 && ['localhost','127.0.0.1'].includes(url.hostname)) failedResponses.push({path:url.pathname,status:result.status()});
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/v2/portfolio')) portfolioRequests.push(url.pathname);
    if (url.pathname === '/profiles/me' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      api = url.origin; authorization = request.headers().authorization;
    }
  });
  await context.route('**/rest/v1/**', async route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      blockedWrites++; await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const response = (path, method = 'GET') => page.waitForResponse(r =>
    new URL(r.url()).pathname === path && r.request().method() === method);
  const request = async (path, method = 'GET', data) => {
    assert.ok(api && authorization && ['localhost', '127.0.0.1'].includes(new URL(api).hostname));
    const result = await context.request.fetch(`${api}${path}`, {method,
      headers:{Authorization:authorization}, ...(data !== undefined ? {data} : {})});
    assert.equal(result.headers()['x-arbor-completion-fixture'], 'isolated');
    assert.equal(result.status(), 200, `Fixture ${method} ${path}`);
    return result.json();
  };
  const go = async destination => {
    await page.evaluate(hash => {location.hash = hash;}, destination);
    const label = {home:'Home', portfolio:'Portfolio', ask:'Ask Arbor', settings:'Settings'}[destination.split('/')[0]];
    await page.waitForFunction(label => Array.from(document.querySelectorAll('nav a[aria-current="page"]')).some(a => a.textContent.trim() === label), label);
    if (destination === 'home') await page.getByRole('region', {name:'What should I do next?'}).getByRole('button').waitFor();
    if (destination === 'ask') await page.getByRole('textbox', {name:'Your question about your Arbor plan'}).waitFor();
    if (destination.startsWith('home/monthly')) await page.getByRole('region', {name:'Invest this month', exact:true}).waitFor();
  };
  const add = () => page.getByRole('button', {name:'+ Add Investment', exact:true});
  const capture = async (name, fullPage = true) => {
    await page.evaluate(() => scrollTo(0, 0));
    // Long Ways to invest pages contain correctly lazy-loaded logos. Eager-load
    // only for the review capture, so offscreen lazy images cannot stall it.
    await page.locator('img[loading="lazy"]').evaluateAll(images => images.forEach(img => {img.loading = 'eager';}));
    await page.waitForFunction(() => Array.from(document.images).filter(img => img.getBoundingClientRect().width).every(img => img.complete));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${name}`);
    assert.equal(await page.locator('[data-nextjs-dialog]').count(), 0, 'No framework overlay');
    const visible = await page.locator('body').innerText();
    assert.doesNotMatch(visible, /Codex|sb_secret_|Bearer ey/i, 'No account/test/credential identity in gallery');
    const filename = `${mode}-${name}.png`;
    await page.screenshot({path:`${output}/${filename}`, fullPage, animations:'disabled'});
    const publicName = mode === 'onboarding' && ({'choose-approach-390-light':'approaches','customization-bitcoin-390-light':'customize','final-plan-80-10-10-390-light':'final-plan'})[name];
    if (publicName) {
      const panel = page.locator('.plan-choice');
      assert.doesNotMatch(await panel.innerText(),/Codex|@|Bearer|https:/i);
      await mkdir('public/product/vision',{recursive:true});
      await sharp(await panel.screenshot({animations:'disabled'})).webp({quality:85}).toFile(`public/product/vision/${publicName}.webp`);
    }
    screenshots.push(filename);
  };
  const appearance = async (width, theme) => {
    await page.setViewportSize({width, height:950});
    await page.emulateMedia({colorScheme:theme, reducedMotion:'reduce'});
    await page.waitForFunction(theme => getComputedStyle(document.documentElement).colorScheme === theme, theme);
  };
  const matrix = async (prefix, destinations, widths = [1440, 1024, 768, 390, 320]) => {
    for (const width of widths) for (const theme of ['light', 'dark']) {
      await appearance(width, theme);
      for (const destination of destinations) {
        stage = `${prefix} ${destination} ${width} ${theme}`;
        await go(destination);
        if (destination === 'portfolio') {
          if (prefix.includes('empty') || mode === 'free') await page.getByRole('heading', {name:'Ways to invest', exact:true}).waitFor();
          else await page.locator('.holding-row').first().waitFor();
        }
        await capture(`${prefix}-${destination.replaceAll('/', '-')}-${width}-${theme}`);
      }
    }
  };
  const choose = async (sleeve, product, fromMonthly = false) => {
    stage = `choose ${product}`;
    const container = page.locator(`${fromMonthly ? '.monthly-row' : '.implementation-sleeve'}[data-sleeve="${sleeve}"]`);
    await container.getByRole('button', {name:fromMonthly ? /Change investment|Choose where to invest/ : /^(Choose investment|Change)$/}).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator(`input[type="radio"][value="${product}"]`).check();
    if (fromMonthly) await capture(`monthly-investment-choice-${sleeve}-${product}-390-light`, false);
    const saved = response('/v2/implementation-choices', 'PUT');
    await dialog.getByRole('button', {name:/^Use /}).click();
    const result = await saved;
    assert.equal(result.status(), 200);
    await dialog.waitFor({state:'detached'});
    return result.json();
  };
  const calculate = async amount => {
    await page.getByLabel('Contribution amount (PHP)', {exact:true}).fill(amount);
    const calculated = response('/v2/monthly-plan', 'POST');
    await page.getByRole('button', {name:'Review contribution', exact:true}).click();
    const result = await calculated;
    assert.equal(result.status(), 200);
    await page.getByRole('region', {name:'Monthly investment breakdown', exact:true}).waitFor();
    return result.json();
  };
  const ask = async question => {
    await go('ask');
    await page.getByRole('textbox', {name:'Your question about your Arbor plan'}).fill(question);
    const answered = response('/chat', 'POST');
    await page.getByRole('button', {name:'Ask Arbor', exact:true}).click();
    const result = await answered;
    assert.equal(result.status(), 200, `Ask ${question}`);
    await page.getByRole('button', {name:'Ask Arbor', exact:true}).waitFor();
    return (await result.json()).reply;
  };
  const addHolding = async (product, label, amount) => {
    await add().click();
    assert.equal(await page.locator('.catalogue-row').count(), 12);
    await page.locator(`.catalogue-row[data-product="${product}"]`).click();
    await page.getByLabel(label, {exact:true}).fill(amount);
    if (product === 'gcash_global_equity') assert.equal(await page.getByLabel('Units (optional)', {exact:true}).isVisible(), false);
    await capture(`record-${product}-390-light`, false);
    const read = response('/v2/portfolio');
    await page.getByRole('button', {name:'Save Investment', exact:true}).click();
    const result = await (await read).json();
    await add().waitFor();
    return result;
  };

  try {
    const restored = response('/profiles/me');
    await page.reload();
    const initial = await restored;
    assert.equal(initial.headers()['x-arbor-completion-fixture'], 'isolated');
    assert.ok(api && authorization);
    assert.equal(initial.status(), mode === 'onboarding' ? 404 : 200);
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    await page.emulateMedia({colorScheme:'light', reducedMotion:'reduce'});

    if (mode === 'onboarding') {
      stage = 'first-run answers';
      await page.setViewportSize({width:390, height:950});
      for (const [field, kind, answer] of [
        ['full_name','input','Alex'], ['country','button','Philippines · PHP'],
        ['goal_target','skip','Not yet'], ['horizon','button','10+ years'],
        ['emergency_savings','button','3–6 months'], ['high_interest_debt','button','None'],
        ['current_portfolio_value','input','0'], ['monthly_investment','input','10000'],
        ['risk_response','button','Keep investing'],
      ]) {
        if (['goal_target','risk_response'].includes(field)) {
          for(const width of [390,320]) for(const theme of ['light','dark']) {
            await appearance(width,theme);await capture(`onboarding-${field}-${width}-${theme}`);
          }
          await appearance(390,'light');
        }
        if (kind === 'input') await page.locator(`#${field}`).fill(answer);
        else await page.getByRole('button', {name:answer, exact:true}).click();
        if (kind !== 'skip') await page.getByRole('button', {name:field === 'risk_response' ? 'See my investing profile' : 'Continue →', exact:true}).click();
      }
      await page.getByRole('heading', {name:'Your investing profile', exact:true}).waitFor();
      await capture('onboarding-informational-profile-390-light');
      await page.getByRole('button', {name:'Compare approaches', exact:true}).click();
    } else {
      await page.locator('.app-shell').waitFor();
      const profile = await initial.json();
      assert.equal(profile.profile.full_name, 'Alex');
      await go('settings');
      await page.getByRole('radio', {name:'System', exact:true}).check();
      if (mode === 'free') {
        const access = await request('/account/entitlements');
        assert.equal(access.effective_tier, 'free');
        await matrix('free', ['home','portfolio','ask','settings'], [1440,390,320]);
        await go('ask');
        assert.equal(await page.getByRole('textbox', {name:'Your question about your Arbor plan'}).isDisabled(), true, 'Exhausted Free composer is deliberately disabled');
        assert.equal(await page.getByRole('link', {name:'Explore Arbor Plus', exact:true}).count(), 1);
        await go('portfolio');
        assert.equal(await add().count(), 0);
        await choose('global_equity', 'gotrade_vt');
        assert.match(await page.locator('.implementation-saved-choice').innerText(), /VT/);
        assert.equal(portfolioRequests.length, 0, 'Free never fetches Plus portfolio storage');
        results.freeWays = true; results.freeQuotaExhausted = true;
      } else {
        const access = await request('/account/entitlements');
        assert.equal(access.effective_tier, 'plus');
        assert.equal(access.availability.live_portfolio, true);
        assert.equal(access.availability.monthly_checkin, true);
        const current = await request('/v2/portfolio');
        assert.equal(current.holdings.length, 0, 'Start with an empty fixture');
        await page.getByRole('button', {name:/^Change Plan/}).click();
      }
    }

    if (mode !== 'free') {
      stage = 'explicit plan choice';
      await page.getByRole('heading', {name:'Choose your approach', exact:true}).waitFor();
      assert.equal(await page.locator('.approach-options [aria-pressed="true"]').count(), 0);
      await appearance(390, 'light');
      await capture('choose-approach-390-light');
      await page.getByRole('button', {name:/^Aggressive/}).click();
      await page.getByRole('button', {name:'Continue', exact:true}).click();
      await page.getByRole('heading', {name:'Customize your plan', exact:true}).waitFor();
      if(mode === 'onboarding') {
        assert.equal(await page.locator('input[name="technology-choice"][value="0"]').isChecked(), true);
        assert.equal(await page.locator('input[name="bitcoin-choice"][value="0"]').isChecked(), true);
      } else {
        // Editing correctly restores prior explicit choices, unlike first onboarding.
        await page.locator('input[name="technology-choice"][value="0"]').check();
        await page.locator('input[name="bitcoin-choice"][value="0"]').check();
      }
      await capture('customization-core-390-light');
      await page.locator('input[name="technology-choice"][value="10"]').check();
      await capture('customization-technology-390-light');
      await page.locator('input[name="bitcoin-choice"][value="10"]').check();
      if(mode === 'onboarding') await page.locator('.customization-preview').getByText('80%',{exact:true}).waitFor();
      await capture('customization-bitcoin-390-light');
      const preview = response(mode === 'onboarding' ? '/v2/plan-preview' : '/v2/profiles/preview', 'POST');
      await page.getByRole('button', {name:'Review my plan', exact:true}).click();
      const previewBody = await (await preview).json();
      assert.deepEqual(targets(mode === 'onboarding' ? previewBody : previewBody.proposed),
        {global_equity:80, defensive:0, technology_tilt:10, crypto:10});
      await page.getByRole('heading', {name:'Your plan is ready', exact:true}).waitFor();
      await capture('final-plan-80-10-10-390-light');
      if(mode === 'onboarding') {
        for(const width of [390,320]) for(const theme of ['light','dark']) {await appearance(width,theme);await capture(`final-plan-${width}-${theme}`);}
        await appearance(390,'light');
      }
      const saved = response(mode === 'onboarding' ? '/v2/profiles' : '/v2/profiles/me', mode === 'onboarding' ? 'POST' : 'PUT');
      await page.getByRole('button', {name:'Use this as my plan', exact:true}).click();
      assert.equal((await saved).status(), 200);
      if (mode === 'onboarding') {
        await page.getByRole('heading', {name:'Your plan is ready', exact:true}).waitFor();
        await capture('plan-ready-390-light');
        await page.getByRole('button', {name:'See ways to invest', exact:true}).click();
      } else { stage = 'saved plan routing to Ways to invest'; await go('portfolio/ways'); }
      await page.getByRole('heading', {name:'Ways to invest', exact:true}).waitFor();
      assert.deepEqual(await page.locator('.implementation-sleeve').evaluateAll(nodes => nodes.map(n => n.dataset.sleeve)),
        ['global_equity','technology_tilt','crypto']);
      for (const link of await page.locator('.provider-open').all()) {
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      }
      stage = 'Ways to invest capture'; await capture('ways-80-10-10-390-light');
      results.explicitPlan = '80/10/10, Defensive unchanged; backend preview and confirmed save';
      if (mode === 'onboarding') {
        await go('home'); await capture('first-home-390-light');
        await go('portfolio'); await capture('first-portfolio-390-light');
      }

      if (mode === 'plus') {
        stage = 'empty portfolio and Home';
        await matrix('empty', ['home','portfolio'], [1440,390,320]);
        await appearance(390, 'light'); await go('portfolio/ways');
        for (const [sleeve, product] of [['global_equity','gotrade_vt'], ['technology_tilt','gotrade_vgt'], ['crypto','pdax_btc']]) await choose(sleeve, product);
        const chosen = await request('/profiles/me');
        assert.deepEqual(chosen.profile.implementation_choices, {global_equity:'gotrade_vt', technology_tilt:'gotrade_vgt', crypto:'pdax_btc'});
        stage = 'empty monthly exact amounts';
        await go('home/monthly');
        const empty = await calculate('10000');
        assert.deepEqual(amounts(empty), {global_equity:'8000', technology_tilt:'1000', crypto:'1000'});
        assert.equal(normalized(empty.current_portfolio_value), '0');
        await capture('monthly-empty-exact-390-light');
        await page.locator('.monthly-providers').scrollIntoViewIfNeeded();
        await page.locator('.monthly-providers').screenshot({path:`${output}/plus-monthly-provider-groups-390-light.png`, animations:'disabled'});
        screenshots.push('plus-monthly-provider-groups-390-light.png');
        const unmodified = await calculate('1000');
        await choose('technology_tilt', 'gcash_technology', true);
        const minimum = await calculate('1000');
        assert.deepEqual(amounts(minimum), amounts(unmodified), 'Implementation choices do not change sleeve amounts');
        assert.equal(minimum.rows.find(row => row.sleeve === 'technology_tilt').status, 'below_minimum');
        assert.equal(normalized(minimum.waiting_amount), '100');
        assert.deepEqual(targets(await request('/profiles/me')), targets(chosen));
        await capture('monthly-below-minimum-390-light');
        results.minimum = {waiting:minimum.waiting_amount, providerChangeKeepsAmounts:true};
        await choose('technology_tilt', 'gotrade_vgt', true);

        stage = 'investment catalogue and records';
        await go('portfolio');
        for (const theme of ['light','dark']) {
          await appearance(390, theme); await add().click();
          for (const [category, count] of [['Funds',6], ['ETFs',3], ['Bitcoin',3], ['All',12]]) {
            await page.getByRole('group', {name:'Investment categories'}).getByRole('button', {name:category, exact:true}).click();
            assert.equal(await page.locator('.catalogue-row').count(), count);
          }
          await capture(`catalogue-390-${theme}`, false);
          await page.keyboard.press('Tab');
          assert.ok(await page.evaluate(() => !!document.activeElement.closest('dialog')));
          await page.keyboard.press('Escape');
        }
        await appearance(390, 'light');
        await addHolding('gcash_global_equity', 'Current value (PHP)', '8000');
        await addHolding('gotrade_vt', 'Shares', '1');
        const portfolio = await addHolding('pdax_btc', 'Bitcoin amount (BTC)', '0.001');
        assert.equal(normalized(portfolio.total_value_php), '16600');
        assert.equal(portfolio.holdings.find(h => h.product_id === 'gcash_global_equity').units, null);
        assert.equal(portfolio.holdings.find(h => h.product_id === 'pdax_btc').provider, 'pdax');
        assert.equal(await page.getByRole('group', {name:'Portfolio sections'}).getByRole('button').count(), 4);
        assert.equal(await page.getByRole('button', {name:'Monthly contribution', exact:true}).count(), 0);
        results.portfolio = {totalPHP:portfolio.total_value_php, holdings:3, manualOnlyFund:true};
        await matrix('populated', ['home','portfolio','ask','settings']);
        await appearance(390, 'light'); await go('portfolio');
        await page.getByRole('button', {name:'Allocation', exact:true}).click();
        await page.getByLabel('Current allocation', {exact:true}).waitFor();
        await capture('allocation-390-light');
        await page.getByRole('button', {name:'History', exact:true}).click();
        await page.getByRole('heading', {name:'Your recorded history', exact:true}).waitFor();
        await capture('activity-real-snapshot-390-light');

        stage = 'recorded portfolio monthly gaps'; await go('home/monthly');
        const populated = await calculate('10000');
        assert.equal(normalized(populated.current_portfolio_value), '16600');
        assert.deepEqual(amounts(populated), {global_equity:'7680', technology_tilt:'2320', crypto:'0'});
        assert.notDeepEqual(amounts(populated), amounts(empty));
        results.monthly = {empty:amounts(empty), recorded:amounts(populated), source:populated.source};
        for (const width of [1440,390,320]) for (const theme of ['light','dark']) {
          await appearance(width, theme); await capture(`monthly-gap-${width}-${theme}`);
        }

        stage = 'Ask deterministic plan and portfolio';
        const questions = [
          ['Why do I have Technology in my plan?', /10%|10 percent/],
          ['Why do I have Bitcoin in my plan?', /10%|10 percent/],
          ['Did Arbor choose Bitcoin for me?', /you|your.*choice|not/i],
          ['Do I need Bitcoin?', /optional|not required/i],
          ['What are my targets?', /80%/],
          ['Where can I invest?', /Gotrade|GFunds|DragonFi/],
          ['How much should I invest this month?', /7,680/],
          ['Why is this amount going to Global Equity?', /7,680/],
          ['Why is my Technology amount below minimum?', /2,320/],
          ['What should I do next?', /monthly|contribution|check-in|review/i],
          ['What is my portfolio worth?', /16,600/],
          ['How is my fund valued?', /entered|manual|recorded/i],
          ['What should I buy?', /decide|decision|cannot|can’t|not.*recommend|don’t select securities/i],
        ];
        results.ask = [];
        for (const [question, expected] of questions) {
          stage = `Ask: ${question}`;
          const answer = await ask(question);
          assert.match(answer, expected, question);
          results.ask.push({question, passed:true});
        }
        await appearance(1440, 'light'); await capture('ask-response-1440-light');
        await appearance(390, 'light'); await capture('ask-response-390-light');
        await appearance(390, 'dark'); await capture('ask-response-390-dark');

        stage = 'completion separate from holdings';
        const before = await request('/v2/portfolio');
        await go('home/monthly'); await calculate('10000');
        const activity = page.getByRole('region', {name:'Monthly check-in', exact:true});
        await activity.getByRole('button', {name:'Submit monthly contribution', exact:true}).click();
        await page.getByLabel('Amount you invested outside Arbor (PHP)', {exact:true}).fill('10000');
        const completed = response('/v2/monthly-checkin', 'POST');
        await activity.getByRole('button', {name:'Confirm contribution submitted', exact:true}).click();
        const completion = await (await completed).json();
        assert.equal(normalized(completion.current.amount_php), '10000');
        const duplicate = await request('/v2/monthly-checkin', 'POST', {month:completion.month, amount_php:'10000'});
        assert.equal(duplicate.history.length, 1);
        assert.equal(duplicate.current.completed_at, completion.current.completed_at);
        const after = await request('/v2/portfolio');
        assert.deepEqual(holdingRecords(after), holdingRecords(before));
        assert.deepEqual(after.history, before.history);
        await go('home'); await page.getByRole('heading', {name:/You’re set for/}).waitFor();
        await capture('home-monthly-complete-390-dark');
        await page.reload(); await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
        await page.getByRole('heading', {name:/You’re set for/}).waitFor();
        assert.match(await ask('How much did I record this month?'), /10,000/);
        await go('home/monthly');
        await activity.getByRole('button', {name:'Undo completion', exact:true}).click();
        const undone = response('/v2/monthly-checkin/undo', 'POST');
        await activity.getByRole('button', {name:'Confirm undo completion', exact:true}).click();
        const undo = await (await undone).json();
        assert.equal(undo.current, null); assert.ok(undo.history[0].undone_at);
        assert.deepEqual(holdingRecords(await request('/v2/portfolio')), holdingRecords(before));
        results.completion = {reload:true, idempotent:true, undone:true, holdingsUnchanged:true, historyUnchanged:true};

        stage = 'update manual value and clean records'; await go('portfolio');
        await page.getByRole('button', {name:/^View ATRAM Global Equity/}).click();
        await page.getByRole('button', {name:'Update current value', exact:true}).click();
        await page.getByLabel('Current value (PHP)', {exact:true}).fill('9000');
        const updated = response('/v2/portfolio');
        await page.getByRole('button', {name:'Save current value', exact:true}).click();
        assert.equal(normalized((await (await updated).json()).total_value_php), '17600');
        await page.getByRole('dialog').waitFor({state:'detached'});
        await add().waitFor();
        while (await page.locator('.holding-row').count()) {
          const previousCount = await page.locator('.holding-row').count();
          await page.locator('.holding-row').first().click();
          await page.getByRole('dialog').getByRole('button', {name:/^Remove /}).click();
          const removed = response('/v2/portfolio');
          await page.getByRole('button', {name:'Remove from Arbor', exact:true}).click();
          await (await removed).json();
          await page.getByRole('dialog').waitFor({state:'detached'});
          await page.waitForFunction(count => document.querySelectorAll('.holding-row').length === count - 1, previousCount);
          await add().waitFor();
        }
        assert.equal((await request('/v2/portfolio')).holdings.length, 0);
        await page.getByRole('heading', {name:'Ways to invest', exact:true}).waitFor();
        results.cleanup = 'Zero holdings; completion undone. Process-local snapshot/undo history retained until fixture restart.';
      }
    }
    assert.equal(pageErrors, 0); assert.equal(consoleErrors, 0); assert.equal(blockedWrites, 0);
    const summary = {mode, reused, screenshotCount:screenshots.length, screenshots, pageErrors, consoleErrors, expectedMissingProfile, blockedWrites,
      hostedFinancialWrites:0, results};
    await writeFile(`${output}/summary-${mode}.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({mode, screenshotCount:screenshots.length, pageErrors, consoleErrors, expectedMissingProfile, blockedWrites, hostedFinancialWrites:0, results}));
  } catch (error) {
    await page.screenshot({path:`${output}/${mode}-failure.png`, fullPage:true, animations:'disabled'}).catch(() => {});
    const layout = await page.evaluate(() => ({viewport:innerWidth, document:document.documentElement.scrollWidth,
      overflow:[...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(el => ({tag:el.tagName,classes:typeof el.className === 'string' ? el.className : '',right:Math.round(el.getBoundingClientRect().right)}))}));
    await writeFile(`${output}/failure-${mode}.json`, JSON.stringify({stage, errorName:error.name,
      assertion:error.name === 'AssertionError' ? error.message.split('\n')[0] : undefined, layout,
      screenshots, pageErrors, consoleErrors, blockedWrites, failedResponses}, null, 2));
    console.error(`Completion QA stopped at ${stage} (${error.name}); sensitive details omitted.`);
    throw new Error('Completion QA failed; inspect sanitized stage and screenshot');
  }
});
