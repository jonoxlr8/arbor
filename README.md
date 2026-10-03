# Arbor

**Invest with a plan you understand.**

Arbor helps Filipinos make long-term investing simpler: choose a plan, record the investments you own, track your progress and understand what the numbers mean.

**You choose. Arbor calculates, tracks, simulates and explains.** Your investments stay with your providers. Arbor does not hold funds, connect a brokerage account to place orders, execute trades, or choose securities and providers for you.

[Website](https://arbor.ph) · [Product boundary](docs/PRODUCT_BOUNDARY.md)

## What Arbor does

- **Plan creation:** financial-readiness assessment, goal and horizon inputs, comparison of standard approaches, and an explicit user-selected plan. Readiness and short-term paths can limit long-term planning tools.
- **Home:** recorded portfolio value and history, actual goal progress, your chosen plan, monthly investment budget and recorded monthly progress. A budget is a target, not evidence that an investment happened.
- **Portfolio:** supported holdings, dated investment records, recorded cost and gain/loss where available, PHP/USD displays, reference-price freshness, and five holding sort orders. Missing data remains unavailable rather than becoming zero.
- **Ways to invest:** neutral supported-product information and official provider links. You select the provider and confirm its current eligibility, fees and terms; Arbor does not rank suitability.
- **Plus planning and insights:** monthly contribution exploration, What If, current allocation, comparison with your chosen asset-class targets, historical plan alignment and monthly recorded-activity review. Scenarios do not alter recorded holdings or guarantee future returns.
- **Ask Arbor:** bounded, deterministic explanations of supported questions about your saved plan, recorded portfolio, target gaps, monthly budget, chosen implementation options and investing concepts. Reviewed English, Tagalog and Taglish aliases are supported; ambiguous questions ask for clarification. Ask is not a general-purpose chatbot and does not give buy/sell/hold or market-timing instructions.
- **Account controls:** authentication and recovery, Terms checks, owner-scoped data export, account restrictions and reviewed deletion workflows.

Arbor distinguishes recorded purchases, opening positions, corrections, planning assumptions and investment performance. Market/reference values are dated information, not executable quotes. Stale or incomplete data can pause planning rather than produce an invented result.

## Current access

Arbor is in **private beta**. The current server policy gives authenticated accounts **Arbor Plus — Private Beta** access, without a credit card, billing date or trial countdown. The private-beta label is not an invitation-only access gate.

Free and Plus capability checks exist in the application, but a production Free rollout, paid subscription checkout and automatic paid conversion are not enabled. Local entitlement fixtures are for testing only. See [access policy](docs/ENTITLEMENTS.md) and the authoritative [server implementation](backend/app/services/entitlements.py); some milestone documentation describes earlier stages.

## Privacy and Admin scope

Authenticated data requests use the signed-in identity and database access controls. Browser configuration must never contain a service-role key or other secret.

Optional Ask feedback stores a vote, fixed-choice reason, answer topic/version, random feedback ID, account ID and creation date. Questions, answers, financial figures and email are not included in feedback. It is covered by owner export and reviewed erasure. Feedback becomes eligible for manual cleanup after 90 days, subject to scoped holds; this is not a guaranteed deletion deadline.

Admin capabilities are separate and narrowly scoped:

- Investment-request review can read submitted request information and update its review status.
- Account-deletion review is read-only and does not execute erasure.
- Ask feedback review shows votes, reasons, topics, dates and topic totals without customer identity or portfolio access.

Admin access is server-controlled; it does not grant general access to customer financial records. Capability activation and destructive maintenance require their own reviewed operational scope. See [Privacy](https://arbor.ph/privacy), [account erasure](docs/ACCOUNT_ERASURE_MANUAL.md) and the [feedback design](docs/proposals/ask_feedback_review.md).

## Stack and repository

| Area | Technology / location |
| --- | --- |
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts — `frontend/` |
| API and calculations | Python, FastAPI, Pydantic — `backend/` |
| Authentication and data | Supabase Auth and PostgreSQL with owner-scoped access |
| Hosting | Vercel frontend; Render API and scheduled jobs |
| Automated checks | Node test runner, pytest, Playwright and dedicated local SQL/JWT checks |

Ask's current request path uses reviewed matching and deterministic services, not LLM-generated financial answers. An OpenAI dependency exists in the backend requirements; it does not make the current Ask flow a model call.

## Local development

Use Node.js 22+ and a Python version compatible with [backend/requirements.txt](backend/requirements.txt). Use a dedicated development database/Auth project with the reviewed schema and seed data. Repository migrations include operational proposals; do not apply every SQL file indiscriminately to a hosted database.

### Backend

From the repository root:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Create an ignored `backend/.env` with your development `SUPABASE_URL`, least-privileged `SUPABASE_KEY`, `APP_ENV=development` and `CORS_ALLOWED_ORIGINS=http://localhost:3000`. Use the matching development project; do not substitute a privileged key to bypass access controls.

```sh
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

In a second terminal, from the repository root:

```sh
cd frontend
npm ci
cp .env.example .env.local
```

Set the development project URL/publishable key in `.env.local`, with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

```sh
npm run dev
```

Open `http://localhost:3000`. Public Next.js variables are embedded at build time. Live portfolio availability also requires its separately reviewed market-data configuration; see [live portfolio](docs/LIVE_PORTFOLIO.md). See [deployment configuration](DEPLOYMENT.md) for production HTTPS/CORS requirements, authentication redirects, email setup and build configuration.

## Checks

From `frontend/`:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run e2e:test
npm run build
```

Production builds require the public HTTPS configuration described in [DEPLOYMENT.md](DEPLOYMENT.md), and the current font build can require network access.

From an activated backend environment in `backend/`:

```sh
python -m pip install pytest
python -m pytest
```

`pytest` is a development test dependency, separate from the production requirements file. Some database/JWT checks require their own isolated setup; a passing unit suite does not certify hosted database permissions.

For browser QA, follow [E2E_AUTH.md](docs/E2E_AUTH.md). Use a dedicated identity or synthetic fixture with the repository harness; leave personal browser sessions alone. Hosted writes require explicit, bounded authorization.

## Further reading

- [V2 portfolio engine](docs/PORTFOLIO_ENGINE_V2.md)
- [Contribution calculations](docs/CONTRIBUTION_ENGINE.md)
- [Historical portfolio reconstruction](docs/HISTORICAL_PORTFOLIO_RECONSTRUCTION.md)
- [Consumer design](docs/CONSUMER_DESIGN.md)
- [Development guidance](AGENTS.md)

Built by Jonathan Isidoro.
