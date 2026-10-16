# Raj-PG API collection

A Postman collection of every backend route (147 requests in 27 folders), generated from the
Express code in `backend/src`.

| File | What it is |
|---|---|
| `raj-pg.postman_collection.json` | The requests, grouped by area (Auth, Resident portal, Properties…) |
| `raj-pg-local.postman_environment.json` | `baseUrl` = `http://localhost:4000` (the backend's dev server) |
| `raj-pg-production.postman_environment.json` | `baseUrl` = `https://raj-pg.netlify.app` (live, through Netlify) |

## Import

**Postman:** File → Import → drop in the collection and both environment files. Pick
**Raj-PG Local** or **Raj-PG Production** in the environment menu (top right).

**Insomnia, Bruno, Hoppscotch, Thunder Client:** each imports Postman v2.1 collections the same way.

## Sign in first

Most routes need a session. Two ways in, matching the two apps:

- **Owner or staff:** run **Auth → POST /auth/login** with
  `{ "identifier": "<email>", "password": "<password>" }`. The session comes back as a cookie,
  which Postman keeps and sends for you.
- **Resident:** run **Resident portal → POST /resident-portal/login** with
  `{ "identifier": "<email or phone>", "password": "<password>" }`. It returns a token, which the
  request saves into the `token` variable; every request sends it as `Authorization: Bearer …`.

Then run anything else. Fill in path variables (`:id`) in the Params tab; optional query parameters
are listed there switched off.

## Before you send

- **Production is live data.** Writes (POST, PUT, PATCH, DELETE) change real residents, payments
  and properties, and some send WhatsApp or email messages. Try writes against Local.
- Request bodies list the fields each route reads, with empty sample values; not every field is
  required. Each request's description (from the code comment above the route) and its source file
  say more.
- `POST /public/booking-requests` creates a real booking request and is rate-limited per address.

## Keep it up to date

The collection is generated, so do not edit it by hand. After routes change, from `backend/`:

```bash
npm run postman
```

It rewrites the three files here from `backend/src` (see `backend/scripts/generate-postman.mjs`).
