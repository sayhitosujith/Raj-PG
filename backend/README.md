# Raj-PG API

## Local setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Without `DATABASE_URL`, the API serves the local fallback dataset so the web app can be developed immediately. For PostgreSQL/Neon, set `DATABASE_URL`, then run:

```powershell
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

- `GET /api/health` checks API and database availability.
- `GET /api/dashboard` returns dashboard data from PostgreSQL or the explicit local fallback.
