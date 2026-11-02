# Azanto: progress log

Everything done to turn the Quick Drop super-app into **Azanto** (Taxi + Food), as of 2026-11-02.

- **Live site:** https://azanto.buytogetherindia.com
- **Admin:** https://azanto.buytogetherindia.com/admin
- **Repo:** https://github.com/appzetogit/azanto (branch `main`)
- **API base for the Flutter apps:** `https://azanto.buytogetherindia.com/api/v1`

---

## 1. Repository

| Step | Detail |
|---|---|
| Fresh history | The old `.git` (from `appzetogit/quick-drop`) was removed and the project re-initialised. The full Quick Drop history is still on GitHub in `quick-drop`. |
| New remote | Pushed to `appzetogit/azanto`. Commits are authored as `omp10 <omparteki2002@gmail.com>` (repo-local git config). |
| Pre-commit hook | `.githooks/` is in the repo but not enabled in this clone. Enable it with `git config core.hooksPath .githooks`. |

### Commits

| Commit | What |
|---|---|
| `053fcc3` | First commit: the Quick Drop code as it was |
| `7297001` | Rebrand to Azanto; product cut to Taxi + Food (frontend + backend switch-off) |
| `bf3897d` | Landing-page CMS defaults come from one Azanto source |
| `7916fbe` | Taxi socket accepts the shared Azanto customer token (pushed by `appzetogit`) |
| `15d49b0` | Indore + Jaipur demo seed (food + taxi) |
| `32dee1d` | Quick Commerce and Service Provider deleted from the backend; code-review fixes |
| `db4517e` | Image seed: Wikimedia-friendly thumbnails and User-Agent |

---

## 2. Deployment (side by side, nothing else touched)

The server also runs about 44 other pm2 apps, including `/opt/master` (`master-api`). Azanto runs completely separately from all of them:

| Piece | Value |
|---|---|
| Code | `/opt/azanto` (copied from a commit; not a git checkout). `DEPLOYED_COMMIT` holds the commit id. |
| Process | pm2 app **`azanto-api`**, config `/opt/azanto/azanto.ecosystem.config.cjs` |
| Port | `5015` |
| Database | MongoDB `appzeto_azanto` (local). It is separate from `appzeto_master`. |
| Uploads | `/var/www/azanto-uploads`, served at `/uploads/` |
| Web build | `/var/www/azanto-web` |
| nginx | `/etc/nginx/sites-available/azanto.buytogetherindia.com.conf` (own server block) |
| SSL | Let's Encrypt via certbot, auto-renews (expires 2027-01-31) |
| DNS | `A azanto.buytogetherindia.com → 145.223.21.188` |
| Redis / queues / background jobs | Off, as on master |

### Connecting to the server

```bash
ssh root@145.223.21.188
```

- **Login:** key-based. The dev machine's `~/.ssh/id_ed25519` (fingerprint `SHA256:dJhz0p/ScMDp4OKgcFBI81MWCfL/CZKlFyofgCuX3KM`) is in the server's `authorized_keys`, so no password is needed. The root password exists, but it isn't recorded here and should be rotated (§6).
- **New machine:** add its public key to `/root/.ssh/authorized_keys` from a machine that already has access. Don't share the password.
- **Handy commands once connected:**

```bash
cd /opt/azanto/Backend                    # app code + .env
cat /opt/azanto/DEPLOYED_COMMIT           # which commit is live
pm2 describe azanto-api                   # status, restarts, uptime
pm2 logs azanto-api --lines 100           # live logs (Ctrl+C to stop)
pm2 restart azanto-api --update-env       # restart ONLY azanto, picking up .env changes
curl -s http://127.0.0.1:5015/health      # {"status":"UP","mongo":"connected",...}
nginx -t && systemctl reload nginx        # always test before reloading: one bad config takes every site down
```

- **Database shell:** `mongosh mongodb://127.0.0.1:27017/appzeto_azanto`. It is local to the server; double-check the database name before any write, because `appzeto_master` sits next to it.
- **Seed scripts** (run from `/opt/azanto/Backend`): `node scripts/seed-demo-zones.mjs [--dry|--remove]` and `node scripts/seed-demo-images.mjs [--dry|--force]`.

### How a deploy is done
1. **Backend:** `git archive` of `Backend` + `deploy` into `/opt/azanto.new`. Carry over `.env`, `node_modules` and the ecosystem file, then swap the directories (the previous one is kept as `/opt/azanto.prev`).
2. **Backend restart:** `pm2 restart azanto-api --update-env`, then wait for `/health` to return 200. If it doesn't, roll back.
3. **Frontend:** build **locally**, not on the server. The server has about 2 GB of free RAM and the build allows up to 8 GB, so a server build could get other apps killed. Upload `dist/` and swap it into `/var/www/azanto-web`.
4. **Never** run `pm2 restart all`, `pm2 delete all` or `pm2 kill` on this box.

### Server `.env` (values not recorded here)
Azanto's `.env` started as a copy of master's, with these changes:
- `PORT=5015`
- `MONGODB_URI=…/appzeto_azanto`
- `UPLOAD_STORAGE_ROOT=/var/www/azanto-uploads`
- `UPLOAD_BASE_URL=https://azanto.buytogetherindia.com/uploads`
- `FRONTEND_URL` / `SOCKET_CORS_ORIGIN` lead with `https://azanto.buytogetherindia.com`
- `RAZORPAY_WEBHOOK_SECRET`: a random placeholder; set the real one before payments
- `DEPLOY_WEBHOOK_SECRET`: emptied
- **`USE_DEFAULT_OTP=true` + `ALLOW_INSECURE_DEFAULT_OTP=true`**: static OTP, see §6
- `GOOGLE_MAPS_API_KEY`: the new Azanto key, also built into the web bundle

Each time it was edited, a backup was saved as `.env.bak.<timestamp>` in `/opt/azanto/Backend`.

---

## 3. Rebrand: Quick Drop → Azanto

- **Brand assets** from the supplied logo, in `Frontend/public/brand/`: `azanto-logo.png` (mark and wordmark), `azanto-mark.png` (the "A" with the pin), `azanto-wordmark.png` and the app and favicon icons (32/180/192/512).
- **Theme tokens:** `--color-azanto-50…900` and `--color-azanto-ink` in `Frontend/src/shared/styles/global.css`. Brand magenta is `#fd0f6d`.
- **Logo everywhere:** favicon, page title, landing page, admin login, admin sidebars, food app navbars and footer, push notifications, Razorpay checkout. The old K9 / Quick Drop / other-brand logo files were deleted.
- **Name:** 275 text replacements in 117 files, covering UI, emails, legal defaults, invoices and storage keys.
- **Database:** stored settings in `appzeto_azanto` were rebranded too: company name, emails and landing CMS.
- **New landing page `/`:** hero, Rides and Food cards, how it works, partners (drivers go to `/taxi/driver`, restaurants to `/food/restaurant/login`), FAQ, a download band and the footer. Hero text, FAQs, store links and contacts can be edited in the admin landing settings. Contact details and store badges stay hidden until they are filled in.
- **New admin login:** a pink brand panel with the logo and wave beside a clean form.

**Intentionally still "Quick Drop":**
- The **OTP SMS text** in `Backend/src/core/otp/webtechSms.js`. It is registered with DLT (India's SMS registry) and must match word for word. Register an Azanto template first.
- The **`@quickdropsindia.com` addresses** (support, noreply), until an Azanto email domain exists.
- The **`quickdropsKeeps`** trip-bill field. The new name is `platformKeeps`; the old one stays as an alias for older app builds.

---

## 4. Product cut: Taxi + Food only

Plan: `docs/AZANTO_TAXI_FOOD_PLAN.md`. Phases 0 to 3 are all done.

- **Admin panel:** the switcher shows only **Master Settings**, **Food** and **Taxi**. All Quick Commerce, Medical (pharmacy) and Service Provider routes, menus and Master-page options are gone, as are restaurant "store mode" and the `/partner` sign-up.
- **Frontend:** the `ServiceProvider` and `partner` modules, the medical pages, StockManager and the `/qc` URL-rewrite layer in `axios.js` were deleted.
- **Backend:**
  - `src/modules/quickCommerce` and `src/modules/serviceProvider` were deleted (about 560 files), along with their scripts and tests.
  - About 40 core files had their QC/SP branches removed: payments webhook, QR credit, rider finance, ledger, manual assign, auth, zones, admin overviews and more.
  - `/api/v1/qc/*` and `/api/v1/sp/*` return 404. Admin access, module switches and app services list only `food` and `taxi`.
  - Stored-access auth constants are kept as inert values, so a legacy QC/SP-only admin gains nothing.
- **Tests:** the default `npm test` chain passes 31 of 32 suites. The one failure, `test:security` ("userOtpService.js gates its static OTP on NODE_ENV"), was there before this work; it conflicts with the fixed-1234 QA OTP feature.

---

## 5. Data in `appzeto_azanto`

### Admin
- `admin@azanto.com`, a platform superadmin (food + taxi). The password was set at seeding; **change it after first login**.

### Demo zones and restaurants: `Backend/scripts/seed-demo-zones.mjs`
| | Indore | Rajasthan (Jaipur) |
|---|---|---|
| Food zone + taxi service location + taxi zone | ✅ | ✅ |
| Restaurants (invented names, approved, open 09:00–23:30) | 8 | 8 |
| Menu | 3–5 sections, 11–13 dishes each | same, prices about 10% higher |
| Owner phones (log in with OTP 1234) | 6000010001–6000010008 | 6000020001–6000020008 |
| Taxi fares (base / per km) | Bike ₹25/₹7 · Auto ₹35/₹12 · Mini ₹60/₹14 · Sedan ₹80/₹17 | ×1.1 |

- **Totals:** 16 restaurants, 56 menu sections, 187 dishes, 4 vehicle types and 8 zone price rows.
- **Usage:** `node scripts/seed-demo-zones.mjs` (idempotent), `--dry`, `--remove` (deletes only what it created, tagged `seedTag: azanto-demo-v1`).
- **Checked on the live API:** each city lists its 8 restaurants.

### Home categories and photos: `Backend/scripts/seed-demo-images.mjs`
- 14 global home categories: Thali, Biryani, Pizza, Dosa, Momos, Chaat, Kachori, Paneer, Chicken, Noodles, Poha, Sweets, Pasta, Coffee. The customer category page matches dishes by these words.
- Photos for every category, dish and restaurant cover come from **Wikimedia Commons**. They are stored locally under `/uploads`, not hotlinked, and the source page is kept in `imageCredit`. Most are CC-BY or CC-BY-SA, so **replace them with owned photos before a public launch**.
- Re-running skips anything that already has a photo; `--force` re-fetches.
- **Linking:** matching dishes are moved into their home category, for example every biryani into "Biryani". The public category list only shows global categories that approved dishes point at, so unlinked categories never appear. The dish's original menu section is kept in `seedRestaurantCategoryId`.
- **Result:** all 14 categories are public with photos, 217 of 217 photos are stored, and 102 dishes are linked.
- **Order matters:** run `seed-demo-zones.mjs` first, then `seed-demo-images.mjs`. Re-running the zones seed moves dishes back to their menu sections; re-running the images seed links them again.

---

## 5b. Where to switch services on or off per zone

| What | Where in admin |
|---|---|
| Show or hide **Food** or **Taxi** in the customer app, everywhere or zone by zone | **Master Settings → App Services** (`/admin/master/app-services`). One switch per service, plus one per zone beneath it. "Off everywhere" wins over any zone switch. |
| Draw, edit or deactivate a **food** delivery zone | **Food → Zone Setup** |
| Which zone a **restaurant** serves | **Food → Restaurants → Edit restaurant** (its zone and location), plus its delivery radius |
| Draw, edit or deactivate a **taxi** zone; zone-wise fares | **Taxi → Zones / Geo fencing** and **Taxi → Pricing → Set price** |

The App Services switches are read by the customer **app** through the platform app-services endpoint. The website's own pages don't check them.

---

## 6. Security notes

- **Static OTP is on.** Every customer, driver and restaurant login accepts `1234` for any phone number. That's fine for a demo. Before real users arrive, fix SMS delivery and remove `USE_DEFAULT_OTP` and `ALLOW_INSECURE_DEFAULT_OTP` from the server `.env`.
- **Change the root password** for `145.223.21.188`: it was shared in chat. Deploys use the SSH key on the dev machine, so they don't need it.
- **Restrict the Google Maps key** in Google Cloud Console to `https://azanto.buytogetherindia.com/*` and the Maps APIs in use. Web map keys are visible in the page's JavaScript.
- **Change the admin password** after first login.

---

## 7. Open items

| Item | Who / what's needed |
|---|---|
| Razorpay | The server's keys (`rzp_test_…`, copied from master) are rejected by Razorpay. Save valid keys and the webhook secret in **Master Settings → Payments**. Until then online payments fail; cash works. |
| SMS / OTP template | Register an Azanto DLT template, then update `webtechSms.js` and turn static OTP off. |
| Email domain | Replace the `@quickdropsindia.com` support and noreply addresses. |
| Landing contacts | Add phone, email, address, socials and store links in the admin landing settings. |
| Drivers and riders | None are seeded. Fares quote and restaurants list, but completing a ride or a food delivery needs approved drivers or riders online in the zone. |
| Restaurant compliance | FSSAI, GST, PAN and bank details aren't set on the demo restaurants. |
| Deploy automation | `.github/workflows/deploy.yml` still targets `/opt/master` and is manual-only. Azanto deploys are manual (§2). |
| Tests outside the default chain | `bike-parcel-with-delivery`, `delivery-formula`, `food-coupon-at-placement` and `ninety-nine-store-listing` were already failing before this work. |
| Dead code | `core/identity/identityLink.service.js` has no callers left. |
