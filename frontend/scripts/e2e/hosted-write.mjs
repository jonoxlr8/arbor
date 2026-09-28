// Bounded production write qualification. All writes are normal product UI actions.
import assert from "node:assert/strict";
import { SetupError } from "./session.mjs";

const decimal = value => String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const php = value => `₱${Number(value).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const investmentDate = () => new Date(Date.now() - 3 * 86400000).toISOString().slice(0,10);

async function openPortfolio(page, baseURL) {
  await page.goto(`${baseURL}/#portfolio`);
  await page.getByRole("heading",{name:"Holdings"}).waitFor();
}

async function fillAndReview(qa, units, cost, date) {
  const {page, readState} = qa;
  const entryCount = (await readState()).activeEntries.length;
  await page.getByLabel("Investment date").fill(date);
  await page.getByLabel("BTC received").fill(units);
  await page.getByLabel("Actual amount paid (PHP)").fill(cost);
  await page.getByRole("button",{name:"Review investment"}).click();
  const confirmation = page.getByRole("region",{name:"Confirm investment"});
  await confirmation.waitFor();
  assert.match(await confirmation.innerText(),new RegExp(units.replace(".","\\.")));
  assert.match(await confirmation.innerText(),new RegExp(`Amount paid\\s+${php(cost).replace(".","\\.")}`));
  assert.equal((await readState()).activeEntries.length,entryCount,"Review created a ledger entry.");
  return {entryCount, confirmation};
}

async function saveExactlyOnce(qa, confirmation, entryCount) {
  const {page, scope, readState, journal} = qa;
  await scope("entry", async () => {
    const response = page.waitForResponse(value => value.url().endsWith("/v2/portfolio/entries") && value.request().method()==="POST",{timeout:30000});
    await confirmation.getByRole("button",{name:"Confirm and save"}).click();
    assert.equal((await response).status(),201);
  });
  await Promise.allSettled(journal.captures);
  const after = await readState();
  assert.equal(after.activeEntries.length,entryCount+1,"Confirm did not create exactly one entry.");
  return after;
}

async function recordBitcoin(qa, product, {units,cost,date,more=false}) {
  const {page, config, readState} = qa;
  const prior = (await readState()).activeEntries;
  await openPortfolio(page,config.baseURL);
  if (more) {
    const row = (await qa.readState()).portfolio.holdings.find(h => h.product_id===product.product_id && h.provider===product.provider);
    if (!row) throw new SetupError("The disposable Bitcoin holding was not available for Add more.");
    await page.locator(".holding-row").filter({hasText:row.provider_name}).filter({hasText:"Bitcoin"}).click();
    await page.getByRole("dialog").getByRole("button",{name:"Add more"}).click();
  } else {
    await page.getByRole("button",{name:/Add Investment/i}).click();
    await page.locator(`.catalogue-row[data-product="${product.product_id}"]`).click();
  }
  const {entryCount,confirmation} = await fillAndReview(qa,units,cost,date);
  const after = await saveExactlyOnce(qa,confirmation,entryCount);
  const added = after.entries.find(row => !prior.includes(row.id) && !row.voided_at && decimal(row.units)===decimal(units) && decimal(row.amount_paid_php)===decimal(cost));
  assert.ok(added,"The saved entry did not preserve actual units and PHP cost.");
  assert.equal(added.investment_date,date);
  return {after,added};
}

async function pendingJourney(qa) {
  const {page,config,scope,readState,journal} = qa;
  const before = await readState();
  await page.goto(`${config.baseURL}/#portfolio/ways`);
  await page.locator(".portfolio-canvas").waitFor();
  const options=page.locator(".implementation-option");
  let button;
  for(let index=0;index<await options.count();index++) {
    const option=options.nth(index), productId=await option.getAttribute("data-product");
    const product=before.portfolio.catalog.find(row=>row.product_id===productId);
    if (!product || before.pendingRows.some(row=>row.product_id===productId && row.provider===product.provider)) continue;
    const candidate=option.getByRole("button",{name:/Continue with/});
    if (await candidate.count()) {button=candidate;break;}
  }
  if (!button) return {status:"no unused saved provider continuation is available"};
  await scope("pending",async () => {
    const response = page.waitForResponse(value => value.url().endsWith("/v2/pending-recordings") && value.request().method()==="POST",{timeout:30000});
    await button.click({noWaitAfter:true});
    assert.equal((await response).status(),201);
  });
  await Promise.allSettled(journal.captures);
  await page.goto(`${config.baseURL}/#home`);
  const after = await readState();
  assert.equal(after.pending.length,before.pending.length+1,"Provider continuation did not persist exactly one pending item.");
  assert.equal(after.activeEntries.length,before.activeEntries.length,"Provider continuation created a holding.");
  await page.getByText("Finish recording your investment").first().waitFor();
  return {status:"pending persisted before external navigation; no ledger write"};
}

async function monthlyPreview(qa) {
  const {page,config,scope,readState,journal} = qa;
  await page.goto(`${config.baseURL}/#home/monthly`);
  await page.getByRole("heading",{name:"Invest this month"}).waitFor();
  let plannerStatus;
  await scope("monthly_preview",async () => {
    const response = page.waitForResponse(value => new URL(value.url()).pathname==="/v2/monthly-plan" && value.request().method()==="POST",{timeout:30000});
    await page.getByRole("button",{name:"Review contribution"}).click();
    const result = await response;
    plannerStatus=result.status();
    if (plannerStatus===409) return;
    assert.equal(result.status(),200);
  });
  const breakdown = page.getByRole("region",{name:"Monthly investment breakdown"});
  if (!await breakdown.count()) {
    const copy = await page.locator(".monthly-error").innerText().catch(()=>"");
    return {status:plannerStatus===409 && (copy.includes("Portfolio") || copy.includes("portfolio")) ? "correctly blocked by valuation readiness" : "monthly plan unavailable for this saved QA state"};
  }
  const crypto = breakdown.locator('.monthly-row[data-sleeve="crypto"]');
  const amount = (await crypto.locator(".monthly-row-amount").innerText()).trim();
  const totalContribution = (await breakdown.locator(":scope > header span").first().innerText()).replace(/[^\d.]/g,"");
  const before = await readState();
  const planned = Number(amount.replace(/[^\d.]/g,""));
  const eligible = Number.isFinite(planned) && planned>0 && ["ready","verify_minimum"].includes(await crypto.getAttribute("data-status")) &&
    (await crypto.locator(".monthly-row-copy").innerText()).includes("Bitcoin");
  if (!eligible) return {status:"calculated; no actionable saved Bitcoin line",bitcoinPlanned:amount};
  if (!before.checkinState) return {status:"calculated; monthly check-in unavailable for this QA state",bitcoinPlanned:amount};
  if (!before.checkin) {
    await page.getByRole("button",{name:"Submit monthly contribution"}).click();
    const checkinForm = page.locator(".monthly-activity form");
    await checkinForm.getByRole("textbox",{name:"Amount you invested outside Arbor (PHP)"}).fill(totalContribution);
    await scope("checkin",async () => {
      const response=page.waitForResponse(value => new URL(value.url()).pathname==="/v2/monthly-checkin" && value.request().method()==="POST",{timeout:30000});
      await checkinForm.getByRole("button",{name:"Confirm contribution submitted"}).click();
      assert.equal((await response).status(),200);
    });
    await Promise.allSettled(journal.captures);
    assert.equal((await readState()).activeEntries.length,before.activeEntries.length,"Monthly check-in created a ledger entry.");
  }
  const row = page.locator(".monthly-record-row").filter({hasText:"Bitcoin"}).first();
  await row.waitFor();
  await row.getByRole("button",{name:"Record investment"}).click();
  const actual = (planned>=2 ? planned-1 : planned+1).toFixed(2);
  const {entryCount,confirmation} = await fillAndReview(qa,"0.00001",actual,investmentDate());
  assert.notEqual(Number(actual),planned);
  assert.match(await page.getByRole("dialog").innerText(),/Planned contribution:/);
  const after = await saveExactlyOnce(qa,confirmation,entryCount);
  const saved = after.entries.find(entry => !before.activeEntries.includes(entry.id) && !entry.voided_at && decimal(entry.amount_paid_php)===decimal(actual));
  assert.ok(saved,"Monthly ledger did not preserve the actual paid amount.");
  assert.notEqual(decimal(saved.amount_paid_php),decimal(planned));
  return {status:"planned-versus-actual saved",bitcoinPlanned:amount,actualPaid:php(actual),
    ledgerCostMatchesActual:true,checkinTaskOwned:!before.checkin,reviewNoWrite:true,confirmExactlyOnce:true,
    recordedProduct:{product_id:saved.product_id,provider:saved.provider}};
}

export async function runHostedWriteQa(qa) {
  const {before,readState,page} = qa;
  if (!before || !qa.config.writeEnabled) throw new SetupError("Hosted write QA did not pass its owner and cleanup preflight.");
  const monthly = await monthlyPreview(qa);
  const alternatives = ["pdax_btc","coins_btc","gcrypto_btc"].filter(id => id!==monthly.recordedProduct?.product_id);
  const product = alternatives.map(id => before.portfolio.catalog.find(row => row.product_id===id))
    .find(row => row && !before.portfolio.holdings.some(holding => holding.product_id===row.product_id && holding.provider===row.provider) &&
      !before.pendingRows.some(pending => pending.product_id===row.product_id && pending.provider===row.provider));
  if (!product) throw new SetupError("No unused supported Bitcoin combination is available in the dedicated QA account.");
  const date = investmentDate();
  const first = await recordBitcoin(qa,product,{units:"0.00002",cost:"100.00",date});
  const second = await recordBitcoin(qa,product,{units:"0.00001",cost:"75.00",date});
  assert.equal(first.added.holding_id,second.added.holding_id,"Add more created a duplicate holding.");
  assert.equal(second.after.portfolio.history.length,before.historyCount,"A backdated transaction created a portfolio snapshot.");
  const holding = second.after.portfolio.holdings.find(row => row.id===first.added.holding_id);
  assert.ok(holding);
  assert.equal(decimal(holding.units),"0.00003");
  assert.equal(decimal(holding.cost_basis_php),"175");
  await openPortfolio(page,qa.config.baseURL);
  const row = page.locator(".holding-row").filter({hasText:holding.provider_name}).filter({hasText:"Bitcoin"});
  await row.waitFor();
  const rowText = await row.innerText();
  assert.match(rowText,/₱[\d,]+\.\d{2} per BTC/);
  assert.doesNotMatch(rowText,/₱[\d,]+\.\d{3,} per BTC/);
  const pending = await pendingJourney(qa);
  const finalState = await readState();
  return {mode:"write",reviewNoWrite:true,confirmExactlyOnce:true,bitcoinEntries:2,
    actualCostFirst:"₱100.00",actualCostSecond:"₱75.00",actualUnitsPreserved:true,
    aggregateHoldingReused:true,backdatedActivity:first.added.investment_date===date,
    noFabricatedSnapshot:finalState.historyCount===before.historyCount,
    bitcoinPriceTwoDecimals:true,pending:pending.status,
    monthly:{...monthly,recordedProduct:monthly.recordedProduct?.product_id ?? null}};
}
