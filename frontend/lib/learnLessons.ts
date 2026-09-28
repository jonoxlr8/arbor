export type LessonCategory = "Basics" | "ETFs" | "Funds" | "Crypto" | "Arbor";
export type Lesson = {
  id: string;
  title: string;
  category: LessonCategory;
  summary: string;
  sections: { heading: string; body: string }[];
  sources: { label: string; url: string }[];
  reviewed: string;
  askDraft: string;
};

const investor = "https://www.investor.gov";
const bsp = "https://www.bsp.gov.ph";
const uitfRules = `${bsp}/Regulations/MORB/2021MORNBFI.pdf`;
const preparedness = `${investor}/introduction-investing/general-resources/investor-preparedness-checklist`;
const source = (label: string, url: string) => ({ label, url });
const reviewed = "2026-09-28";

/** Reviewed, static education. No user data, generated answers, or remote HTML. */
export const learnLessons: Lesson[] = [
  {
    id: "investing-101", title: "Investing 101", category: "Basics", summary: "Start with your time horizon, risk and financial foundation.",
    sections: [
      { heading: "Start with the time you have", body: "Your time horizon is when you expect to need the money. Money needed soon has less time to recover from a market decline. Willingness to see prices swing is different from having the financial capacity to absorb a loss." },
      { heading: "Build a foundation", body: "Emergency savings and difficult-to-manage high-interest debt matter before long-term investing. Arbor's readiness paths flag these considerations; they do not determine whether a particular investment is suitable for you." },
    ],
    sources: [source("Investor.gov: Introduction to Investing", `${investor}/introduction-investing`), source("Investor.gov: Investor Preparedness Checklist", preparedness)],
    reviewed, askDraft: "Can you explain investment risk and time horizon in simpler terms?",
  },
  {
    id: "etfs", title: "What are ETFs?", category: "ETFs", summary: "Shares, market prices and what Arbor asks you to record.",
    sections: [
      { heading: "A fund traded as shares", body: "An exchange-traded fund (ETF) holds a portfolio of investments. Its shares trade on an exchange at a market price, which can differ from the fund's net asset value. A broad ETF may diversify across many companies; a narrow one may concentrate exposure." },
      { heading: "Record what you actually received", body: "Your provider's execution record shows the actual shares you received. Arbor asks for that quantity and your investment date; a reference market price is not an execution receipt." },
    ],
    sources: [source("Investor.gov: Exchange-Traded Funds", `${investor}/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2`)],
    reviewed, askDraft: "Can you explain the difference between an ETF and a UITF in simpler terms?",
  },
  {
    id: "uitfs", title: "What are UITFs?", category: "Funds", summary: "Understand fund units and NAVPU.",
    sections: [
      { heading: "A pooled investment", body: "A unit investment trust fund (UITF) pools participants' money under a fund plan. Your interest is recorded in units. The net asset value per unit (NAVPU) is a dated fund valuation, not a guaranteed sale price." },
      { heading: "Units and current value", body: "Your provider statement can show the units credited to you. If Arbor supports a manual current-value entry for a fund, that value is not an investment addition and does not imply units were purchased." },
    ],
    sources: [source("BSP: UITF rules and NAVPU", uitfRules)],
    reviewed, askDraft: "What do UITF units and NAVPU mean for my Arbor record?",
  },
  {
    id: "fund-types", title: "UITF vs mutual fund vs ETF", category: "Funds", summary: "Three fund structures, with different pricing and access.",
    sections: [
      { heading: "Different structures", body: "A UITF is governed by its trust fund plan; a mutual fund issues fund shares; an ETF issues shares that trade on an exchange. All can hold diversified portfolios, but their legal structure and purchase process differ." },
      { heading: "Different prices", body: "ETF shares trade at market prices during market hours. UITFs use a dated NAVPU, while mutual funds use a calculated net asset value. Check each product's official documents for dealing times, fees and risks. There is no universal best type." },
    ],
    sources: [source("BSP: UITF rules", uitfRules), source("Investor.gov: Exchange-Traded Funds", `${investor}/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2`)],
    reviewed, askDraft: "How do UITFs, mutual funds and ETFs differ?",
  },
  {
    id: "feeder-funds", title: "How global feeder funds work", category: "Funds", summary: "A Philippine fund can invest through an underlying global fund.",
    sections: [
      { heading: "The feeder structure", body: "A feeder fund invests substantially in another fund. This can give a Philippine investor exposure to an underlying global strategy through a local fund. Read the fund plan to see its target fund and risks." },
      { heading: "Look through the layers", body: "The local fund's currency, the underlying assets' currencies, conversion costs and fund fees can all affect a peso investor's result. The fund's dated NAVPU is not the same thing as a live exchange-traded price." },
    ],
    sources: [source("BSP: UITF feeder-fund rules", uitfRules)],
    reviewed, askDraft: "How does a Philippine feeder fund invest globally?",
  },
  {
    id: "diversification", title: "Global equity vs Technology", category: "Basics", summary: "Broad exposure and a concentrated sector tilt.",
    sections: [
      { heading: "Broad is not the same as narrow", body: "Global equity can spread exposure across companies, industries and markets. A dedicated Technology sleeve adds sector concentration. A global fund may already own technology companies, so the exposures can overlap." },
      { heading: "Diversification has limits", body: "Diversification can reduce reliance on one investment, but it cannot prevent all losses. Arbor shows your chosen target weights; it does not select a security for you." },
    ],
    sources: [source("Investor.gov: Asset Allocation and Diversification", `${investor}/introduction-investing/getting-started/asset-allocation`)],
    reviewed, askDraft: "Why is Technology more concentrated than global equity?",
  },
  {
    id: "bitcoin", title: "Bitcoin basics", category: "Crypto", summary: "Volatility, custody and avoiding scams.",
    sections: [
      { heading: "Price and custody", body: "Bitcoin is a crypto asset whose price can move sharply. How a provider holds assets and handles withdrawals matters. Arbor records the amount you report; Arbor does not custody Bitcoin or execute a trade." },
      { heading: "Protect yourself", body: "Verify the provider and destination carefully, protect account access and be wary of guaranteed-return claims or unsolicited investment messages. A reference BTC/PHP value in Arbor is not a provider execution price." },
    ],
    sources: [source("Investor.gov: Crypto Assets", `${investor}/additional-resources/spotlight/crypto-assets`)],
    reviewed, askDraft: "What should a beginner understand about Bitcoin custody and risk?",
  },
  {
    id: "fees-fx", title: "Fees, FX and minimums", category: "Basics", summary: "Why a provider result can differ from an Arbor reference.",
    sections: [
      { heading: "Costs can be layered", body: "Funds may charge ongoing expenses; a provider can charge transaction fees or apply a bid–ask spread. FX conversion adds another possible difference when investment and planning currencies differ." },
      { heading: "Check current terms", body: "Provider minimums, fees and exchange rates can change. Verify the latest terms in the official provider app or documentation before acting. Arbor's reference values are for tracking, not an execution quote." },
    ],
    sources: [source("Investor.gov: Understanding Fees", `${investor}/introduction-investing/getting-started/understanding-fees`), source("Investor.gov: Foreign Currency Exchange", `${investor}/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/foreign`)],
    reviewed, askDraft: "Why might my provider value differ from Arbor's reference value?",
  },
  {
    id: "finding-units", title: "Where to find your units", category: "Arbor", summary: "Use your provider's actual record, not an estimated quantity.",
    sections: [
      { heading: "Look for the credited quantity", body: "Your provider's transaction confirmation, statement or holding screen commonly shows shares, fund units or BTC credited. Use the actual quantity and investment date when adding an investment in Arbor." },
      { heading: "Do not reverse-engineer a trade", body: "A planned PHP amount divided by a reference price may not equal the quantity executed after fees, spreads and timing. Arbor does not infer purchased units from a planned contribution." },
    ],
    sources: [source("Investor.gov: Exchange-Traded Funds", `${investor}/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2`)],
    reviewed, askDraft: "Where should I find the actual units to record in Arbor?",
  },
  {
    id: "recorded-cost", title: "Recorded cost and gain/loss", category: "Arbor", summary: "Added capital is not investment profit.",
    sections: [
      { heading: "Cost is what you actually paid", body: "Arbor can compare a current holding value with its complete recorded PHP cost. If an opening position or addition has unknown cost, the complete gain/loss is unavailable rather than calculated against only known costs." },
      { heading: "Portfolio value change is different", body: "A portfolio-value graph compares recorded values over time. Contributions and changes to holdings can affect it, so Arbor calls this portfolio value change, not investment return. Adding money is not profit." },
    ],
    sources: [source("Investor.gov: Introduction to Investing", `${investor}/introduction-investing`)],
    reviewed, askDraft: "Why isn't a contribution counted as investment profit?",
  },
  {
    id: "providers", title: "Choosing where to invest", category: "Arbor", summary: "You choose a provider; Arbor shows factual options.",
    sections: [
      { heading: "Your choice", body: "Arbor can show supported ways to access an investment, but does not rank a provider as best for you. Product availability, current fees, minimums and account requirements should be checked in the provider's official materials." },
      { heading: "Use safe links", body: "Open a provider through its official link, check the destination and never enter account credentials through a message sent by a stranger. Arbor does not ask for your provider password." },
    ],
    sources: [source("Investor.gov: Investor Preparedness Checklist", preparedness)],
    reviewed, askDraft: "What should I check when choosing a provider?",
  },
  {
    id: "arbor-workflow", title: "How Arbor records investments", category: "Arbor", summary: "Additions, corrections and monthly follow-up are separate.",
    sections: [
      { heading: "An addition is a record", body: "Add Investment and Add more record the date and actual units you received. You can optionally enter the actual PHP amount paid. Editing corrects a record; voiding it retains the correction history and is not a market sale." },
      { heading: "A plan is not a purchase", body: "A monthly check-in or provider-continuation pending item does not add units, create a holding or establish a cost. If you completed an investment, come back and record the actual units received. A reminder does not mean you invested." },
    ],
    sources: [],
    reviewed, askDraft: "How do monthly follow-up and actual investment records differ in Arbor?",
  },
];

export const learnCategories = ["All", "Basics", "ETFs", "Funds", "Crypto", "Arbor"] as const;
export function lessonById(id: string) { return learnLessons.find(lesson => lesson.id === id); }
export function safeLessonSource(url: string) { return /^https:\/\/[^\s]+$/.test(url); }
