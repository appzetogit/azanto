# Azanto: rename + cut down to Taxi + Food

Two pieces of work:
1. Rename "Quick Drop" to "Azanto".
2. Make the product **Taxi + Food only**. This removes Quick Commerce (QC), Medical/Pharmacy (a QC panel) and Service Provider (SP).

The phases are ordered so that every step ships on its own and nothing breaks in between.

---

## Phase 0: Rename Quick Drop → Azanto

There are about 250 occurrences across about 150 files.

**Rename (display text):**
- page titles: `Frontend/index.html` (the "Quick Drop" browser tab)
- headers, sidebars, landing page, footer, FAQ, legal, help, terms, privacy and refund pages
- admin login and signup copy
- email subjects and bodies: `Backend/src/services/email.service.js`, `utils/email.js`, `taxi/services/mailService.js`
- invoice and PDF text
- default business name
- default Terms and Privacy text: `core/settings/defaultTerms.js`, `defaultPrivacyPolicy.js`
- `Frontend/package.json` name
- the Flutter docs

**Rename (internal identifiers):** azanto is a fresh install, so no existing users or stored data are affected.
- browser storage keys such as `Quick Drop_current_ride` and `Quick Drop_user_profile` → `azanto_*`
- the Cloudinary folder default `Quick Drop-taxi` → `azanto-taxi`
- map and script ids such as `Quick Drop-google-maps`

**Do NOT change without a decision:**

| What | Why |
|---|---|
| OTP SMS text in `Backend/src/core/otp/webtechSms.js` ("Your Quickdrop Login OTP is … Quickdrops Pvt Ltd") | It has to match the DLT-registered SMS template word for word. If we change it before an Azanto template is registered, OTP SMS stops delivering. |
| `quickdropsKeeps` field in the taxi trip-bill API (`taxi/admin/tripBill.js`) | It's an API field name. I'll add `platformKeeps` and keep the old name as an alias, so the Flutter app and admin panel don't break. |
| `@quickdropsindia.com` addresses (default business email, SP `noreply@`, review seed) | Need a real Azanto email domain. |
| Brand image `https://i.ibb.co/5GzXz7r/Quick Drop-Brand-Image.png` (about 15 uses, the default image in notifications) | Need an Azanto logo URL, or I can serve the logo from `/public`. |

The rename also changes data already saved in the database (business settings and legal pages). The azanto database is new, so I'll update the stored values there once.

---

## Phase 1: Admin panel and web app, Taxi + Food only (frontend)

The main panel lives at `/admin`, in `Food/components/admin/AdminRouter.jsx`. Taxi admin runs as its own app at `/taxi/admin`.

**1a. Remove the vertical tabs and routes**
- `Food/components/admin/AdminSidebar.jsx`: remove the Services, Quick and Medical tabs (:1232-1295) and their branding and menus (`VERTICAL_BRANDING` QC and medical at :210-336). Reduce `rebaseAdminMenu` and `verticalAdminPath` to food-only.
- `Taxi/modules/admin/components/AdminLayout.jsx`: remove the Services, Quick and Medical tabs (:1555-1592).
- `Food/components/admin/AdminPageGate.jsx`: keep only food and taxi in `PANELS`.
- `AdminRouter.jsx`: remove the `quick-commerce/*`, `medical/*`, `sp/*` and `stores` routes, `StoresRedirect`, and the lazy imports of StockManager, the medical pages and SP admin.
- `Food/utils/masterSidebarMenu.js`: remove the QC and SP entries (orders, transactions, tax, banners, push, referral, coupons, tickets, service workers and reports).
- `Food/utils/adminAccess.js`: remove the QC and medical `PANEL_BASES` and `PAGE_RULES`, and the `/admin/sp` check. Also update `foodAdminAccess.js` and `config/constants.js` `MODULES`.

**1b. Master (cross-vertical) pages: keep only food and taxi tabs or options in:**
- `MasterOrders`, `MasterFees`, `MasterCancellation`, `MasterReferral`, `MasterCoupons`
- `PromoCeiling`, `DeliveryEarnings`, `DeliveryIncentives`, `MasterDeliveryRadius`
- `SupportInbox`, `ZonePicker`, `CommissionOverview`, `PlatformEarnings`, `CashLimitSettings`
- `Banners`, `LandingPageManagement`, `AdminAccounts` (panel list)

**1c. Shared food admin screens: remove QC and prescription branches in:**
- `AddRestaurant` (store-type UI), `EditRestaurant`, `RestaurantsList`
- `DocumentReviews`, `AdminRestaurantDocuments`, `FoodsList`, `FeeSettings`
- the zone screens
- `ViewOrderDialog` (prescription block), `useAdminNotifications`
- manual-assign (the `/qc` socket)
- delivery-partner screens (the `quickCommerce` rider capability)

**1d. Restaurant dashboard:** remove QC "store mode" (`restaurant_vertical === "qc"`) from:
- `RestaurantSidebar`, `ExploreMore`, `ItemDetailsPage`
- `OrdersMain` (prescription and medical logic)
- the Stock manager route

**1e. Delete QC-only and SP-only code**
- `Frontend/src/modules/ServiceProvider/` (whole module), the `@sp` vite alias, and the `SERVICE_PROVIDER_ENABLED` flag in `config/features.js`
- `Frontend/src/modules/partner/` (store and medical sign-up). Remove the `/partner/*` route and point the landing page's "Partner with us" link to `/food/restaurant/login`.
- `Food/pages/admin/medical/*`, `VerticalVocabulary.jsx`, `verticalVocabulary.js`, `quickCommerceStoreType.js`, `adminPanel.js`, `StockManager.jsx`, `QuickSection.jsx`, `app/slices/quickSlice.js`
- `services/api/axios.js`: remove the QC URL-rewrite layer (:303-445) and the qc refresh-token branch
- `services/api/index.js`: remove `stockAPI`, the medical and prescription admin calls, and the qc order base

**Kept (not QC):**
- `DeliveryV2`: the food rider app
- the Food "99 Store" value shelf
- `sellerApp.js`
- the landing page: already food and taxi only, apart from some wording

---

## Phase 2: Backend, switch QC and SP off (no deletion yet)

QC is a **source fork** of food. About 33 shared core files import its models and services, including the Razorpay webhook, rider finance, manual assign, auth middleware and zones. See `Backend/src/modules/quickCommerce/FORK_COLLAPSE.md`: deleting it carelessly can quietly send wallet and payout writes to the wrong collection. So this phase stops the traffic and leaves the code in place:

- `src/routes/index.js`: unmount `/v1/qc` and `/v1/sp`. They return 404.
- `server.js`: don't start the `/qc` socket namespace, the SP socket handlers or the SP booking scheduler.
- Admin `servicesAccess` and `meta.services`, App Services and module registry: list only `food` and `taxi`, so the admin panel and the Flutter app never offer the other verticals.
- `package.json` `test`: drop the `qc*`/`sp*` suites from the default run, but keep the files.
- Update the seeded admin's `servicesAccess` to `["food","taxi"]`.

---

## Phase 3: Backend, delete QC and SP code (separate change, later)

This is the risky part. It touches payments and rider money, so it goes in its own change with its own test pass:
- Repoint or remove each of the about 33 `core/*` imports of `modules/quickCommerce/...` and `modules/serviceProvider/...`. Follow FORK_COLLAPSE.md, and pass models in instead of switching import paths on payment code.
- Delete `src/modules/quickCommerce/`, `src/modules/serviceProvider/`, the QC/SP tests and the `/qc` handling in workers and queues.
- Run the full food and taxi test suite. Boot-test against a copy of the database.

**Done (code):** both module directories, the QC/SP-only tests and scripts are deleted. Every QC/SP branch in `core/*` and the food module was removed rather than repointed, since this database never held QC or SP data. Nothing still imports either module. The boot test against a database copy is still open.

---

## Phase 4: Verify and ship

- Frontend: `npm run build` passes, and a grep shows no `quick-commerce`, `/qc`, `@sp` or `medical` routes are left.
- Admin panel in the browser: only Food and Taxi tabs, master pages show only those two, and no dead links.
- Backend: `npm test` (food and taxi suites). The server boots, and `/api/v1/qc/*` and `/api/v1/sp/*` return 404.
- Commit and push to `appzetogit/azanto`, then redeploy to `azanto.buytogetherindia.com` (the `azanto-api` app only).

Order: **Phase 0 + 1 + 2 together** (one deploy), then **Phase 3** on its own.
