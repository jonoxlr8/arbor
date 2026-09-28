// Explicit, dedicated-account-only production QA entry point.
import assert from "node:assert/strict";
import { withHostedQa } from "./hosted-browser.mjs";
import { SetupError } from "./session.mjs";

const writeRequested = process.argv.includes("--write");
if (process.argv.some(arg => arg.startsWith("--") && arg !== "--write")) {
  console.error("Only the reviewed --write mode is supported."); process.exitCode = 1;
} else if (writeRequested !== (process.env.ARBOR_HOSTED_QA_WRITE === "1")) {
  console.error("Write mode needs both --write and ARBOR_HOSTED_QA_WRITE=1; omit both for read-only QA."); process.exitCode = 1;
} else {
  try {
    const result = await withHostedQa(async qa => writeRequested
      ? (await import("./hosted-write.mjs")).runHostedWriteQa(qa)
      : runReadOnlyQa(qa));
    // These summaries contain counts and status labels only, never account or financial data.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof SetupError ? error.message : "Hosted QA setup failed; sensitive details withheld.");
    process.exitCode = 1;
  }
}

async function runReadOnlyQa({page, config, profileStatus, network, markStep}) {
  markStep("read-only profile");
  assert.equal(profileStatus,200,"A saved dedicated QA profile is needed for the read-only V3 tour.");
  page.setDefaultTimeout(20000);
  await page.locator(".app-shell").waitFor();
  const inspected = [];
  let chartViews = 0;
  let portfolioDetailChecked = false;
  const go = async (hash, expected) => {
    await page.goto(`${config.baseURL}/#${hash}`);
    await page.locator(".app-shell").waitFor();
    await page.getByRole("heading",{name:expected,exact:hash !== "home"}).first().waitFor();
  };
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const [hash,heading] of [["home",/Hello|Good/],["portfolio","Portfolio"],["ask","Ask Arbor"]]) {
      markStep(`read-only ${hash} ${width}`);
      await go(hash,heading);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
      if (hash === "home" || hash === "portfolio") {
        await page.getByRole("region",{name:"Portfolio value graph"}).first().waitFor();
        chartViews++;
      }
      inspected.push(`${hash}:${width}`);
      if (hash === "portfolio" && width === 390 && await page.locator(".holding-row").count()) {
        await page.locator(".holding-row").first().click();
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        portfolioDetailChecked = true;
      }
    }
  }
  await page.setViewportSize({width:390,height:900});
  await page.emulateMedia({colorScheme:"dark"});
  for (const [hash,heading] of [["home",/Hello|Good/],["portfolio","Portfolio"],["ask","Ask Arbor"]]) {
    markStep(`read-only dark ${hash}`);
    await go(hash,heading);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    inspected.push(`${hash}:390:dark`);
  }
  await page.emulateMedia({colorScheme:"light"});
  markStep("read-only Learn draft");
  await go("ask","Ask Arbor");
  await page.getByRole("tab",{name:"Learn"}).click();
  await page.getByRole("tabpanel",{name:"Learn"}).waitFor();
  const lessonCount = await page.locator(".learn-row").count();
  assert.equal(lessonCount,12);
  await page.locator(".learn-row").first().click();
  await page.getByRole("button",{name:"Ask Arbor about this"}).click();
  assert.ok((await page.locator("textarea").inputValue()).length>0,"Lesson prompt was not left as an editable draft.");
  assert.equal(await page.locator(".chat-answer-row").count(),0,"Lesson prompt auto-sent unexpectedly.");
  markStep("read-only Settings");
  await go("settings","Settings");
  await page.getByRole("button",{name:"Sign out"}).waitFor();
  assert.equal(network.blockedWrites,0,"Read-only tour attempted an unexpected API write.");
  return {mode:"read-only",authenticated:true,views:inspected.length,learnLoaded:true,
    lessonCount,lessonDraftOnly:true,chartViews,settingsLoaded:true,portfolioDetailChecked};
}
