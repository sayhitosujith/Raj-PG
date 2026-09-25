# Raj-PG

PG management application for tenants and owners.

## Planned stack

- Mobile: Flutter and Dart for Android and iOS
- Navigation and state: Flutter-native navigation with a lightweight state layer
- API: Node.js, Express, and TypeScript
- Database: PostgreSQL, Prisma, and Neon-compatible configuration
- Authentication: Email/password and phone OTP
- Payments: Razorpay with server-side order and webhook verification
- Notifications: Push, email, and SMS providers behind backend interfaces
- Deployment: Render for the API, Neon for PostgreSQL, and Play Store/App Store builds

## MVP scope

- Tenant and owner role-based access
- PG and room discovery
- Booking requests and availability
- Owner property, room, tenant, rent, maintenance, and announcement management
- Booking or rent payment integration

## Local prerequisites

Install the Flutter SDK and add it to `PATH`, then verify:

```powershell
flutter doctor
```

## Current web integration

- React dashboard: `web/`
- Express API: `backend/`
- Dashboard data loads from `GET /api/dashboard`
- Local development uses an explicit API fallback when `DATABASE_URL` is not set
- PostgreSQL/Neon models and migrations are defined in `backend/prisma/schema.prisma`

Run the API and web client in separate terminals:

```powershell
cd backend
npm install
npm run dev
```

```powershell
cd web
npm install
npm run dev
```

For live PostgreSQL data, copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL`, then run `npm run prisma:generate` and `npm run prisma:migrate -- --name init` from `backend/`.
