# Arbor development guidance

## Product context

Arbor is an AI-powered investment companion designed to help people build long-term wealth through simple, intelligent global investing.

## Repository structure

- `frontend/` contains the Next.js, React, and TypeScript application.
- `backend/` contains the FastAPI and Python application.
- Supabase provides the database and authentication integration.
- Backend investment and portfolio logic primarily lives in `backend/app/services/`; keep it separate from presentation and UI concerns where practical.

## Working conventions

- Run frontend builds, linting, and other frontend commands from `frontend/`.
- Run backend tests and other backend commands from `backend/`.
- Run Git commands from the project root.
- Preserve the existing architecture unless there is a clear, documented reason to change it.
- Make small, logical feature changes; avoid unrelated refactors.
- Run relevant tests and builds after changes, proportionate to the scope of the work.
- Do not unnecessarily upgrade dependencies or change package versions.
- Never expose, log, commit, or share secrets, API keys, passwords, tokens, or `.env` values.
- Keep investment calculations and business logic separate from UI code where practical.
- Prefer readable, beginner-friendly code and clear names: the project owner is not a professional programmer.

## Git rules

- Do not create a new Git branch unless explicitly requested.
- Do not modify existing commits.
- Do not commit or push changes unless explicitly requested.

## Completion checklist

Before finishing a coding task, report:

1. The files changed.
2. The tests and builds run, including their results.
3. The current Git status.
