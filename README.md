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

## WhatsApp messages to residents

The backend sends WhatsApp messages through Meta's WhatsApp Business Platform (Cloud API):
rent reminders, payment confirmations with the PDF receipt, announcements and housekeeping
updates. Residents can turn them off in their portal; each message is sent at most once
(logged in `WhatsAppMessage`). Without the variables below, WhatsApp is simply off.

### 1. Meta setup (once)

1. Create a Meta Business account and, at developers.facebook.com, an app of type **Business**
   with the **WhatsApp** product added.
2. Under WhatsApp -> API setup, add your business phone number. It must not be registered on the
   WhatsApp or WhatsApp Business app (delete it there first, or use a new number). Verify it by SMS.
3. Business settings -> System users: create a system user, give it the app and the WhatsApp
   account, and generate a **permanent token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`. The 24-hour token on the API setup page is only for trying it.
4. Add a payment method in WhatsApp Manager (Meta bills per message; utility messages are cheap).

### 2. Message templates

In WhatsApp Manager -> Message templates, create these, category **Utility**, language
**English** (`en`). Keep the names and the variable order exactly; the app fills {{1}}, {{2}}, ...
in this order (`backend/src/notifications.ts`). Meta rejects a body that starts or ends with a
variable, which is why each ends with fixed text.

| Name | Header | Body | Variables |
|---|---|---|---|
| `rent_reminder` | none | `Hi {{1}}, this is {{2}}. Your rent of {{3}} for {{4}} at {{5}} is due by {{6}}. Please pay on time to avoid a late fee. Thank you.` | name, business, amount, month(s), property, due date |
| `rent_overdue` | none | `Hi {{1}}, this is {{2}}. Your rent of {{3}} for {{4}} at {{5}} was due on {{6}} and is now overdue. Please pay today to avoid further late fees.` | same as above |
| `payment_received` | **Document** | `Hi {{1}}, {{2}} has received {{3}} for {{4}} at {{5}}. Your receipt is attached. Thank you!` | name, business, amount, month, property |
| `announcement` | none | `Hi {{1}}, a new notice from {{2}}: {{3}}. {{4}} Thank you.` | name, business, title, message |
| `housekeeping_update` | none | `Hi {{1}}, {{2}} here. Your housekeeping request for {{3}} is now {{4}}. Note: {{5}}. Thank you.` | name, business, date and slot, status, owner's note |

Meta asks for sample values when you submit each one; approval usually takes minutes to a day.
Meta may re-categorise `announcement` as Marketing (a higher per-message price) depending on
what you post; keep notices operational (maintenance, rules, timings).

### 3. Server variables (Render -> Environment)

`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, optionally `WHATSAPP_TEMPLATE_LANGUAGE`
(default `en`), and `CRON_SECRET` (any long random string). Then Settings -> WhatsApp messages
shows "Connected"; **Send test** sends Meta's built-in `hello_world` template.

### 4. Daily rent reminders

Render's free plan sleeps, so an external scheduler starts the run. At cron-job.org (free),
create a job: URL `https://raj-pg-api.onrender.com/api/cron/rent-reminders`, method GET, every
day at 09:00 **Asia/Kolkata**, header `x-cron-key: <CRON_SECRET>`, and a 60 s timeout (the first
call may wake the server). Reminder 1, reminder 2 and the overdue notice each go once per month;
**Run rent reminders now** in Settings does the same run on demand.

## Email

The backend emails residents their **payment receipts** (PDF attached; always sent, since they are
records), **rent reminders** and **announcements**, and emails **you** each new **booking
request** (to the contact email in Settings -> Workspace details). Residents can turn email updates
off in their portal. Every email is logged with WhatsApp messages in `OutboundMessage` and sent at
most once per event.

1. Create a free account at resend.com and an API key (API Keys -> Create).
2. Domains -> Add domain (e.g. `rajpg.in`), add the DNS records it shows at your domain registrar,
   and wait for "Verified". Without a verified domain Resend only delivers to your own address.
3. On Render -> Environment add `RESEND_API_KEY`, `EMAIL_FROM` (e.g.
   `Raj Properties <noreply@rajpg.in>`) and optionally `APP_URL`.
4. Settings -> Email shows "Connected"; **Send test** sends a test email.
