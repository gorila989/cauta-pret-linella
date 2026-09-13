# Catalog persistence repair — 2026-09-13

## Findings

The installed application is a Chrome-hosted WebAPK/PWA, served from
https://cauta-pret-linella-2.onrender.com/index.html. It is not a native SQLite APK.
The connected Samsung SM-A600FN contained a catalog dated 2026-06-28 19:53,
with 3480 stored products (3250 visible after category filtering).

The matching GitHub main revision was af768a1. The original client bypassed
downgrade protection with `force: true` on refresh, overwrote the catalog date
with refresh completion time, and checked the existing catalog outside its
write transaction. A failed IndexedDB read was treated as an absent database.
The server stored its active JSON catalog beside application source; the
checked-in Render configuration did not declare persistent storage. Render
dashboard inspection confirmed the service uses Free compute without disk support.

## Changes

- Startup uses the existing validated IndexedDB catalog. Read errors do not
  cause initial-catalog fallback.
- Validation checks nonempty product data, names and finite nonnegative prices.
- Version comparison and catalog plus metadata writes share one atomic
  IndexedDB transaction. Older, undated and equal-version replacements are
  rejected when an installed version can be compared. Refresh no longer
  relabels server data or bypasses comparison.
- Browser persistent storage is requested. The browser still controls whether
  it grants this request; user deletion of site data is outside this guarantee.
- Server data location can be configured independently of application source.
  First startup seeds only an absent catalog; existing invalid data causes an
  explicit failure. Atomic file replacement and downgrade checks protect writes.
- User selected free hosting. Render configuration explicitly uses Free compute;
  no disk or subscription is provisioned. The phone catalog is authoritative.
- Scoped refresh includes the phone's catalog version. If the server no longer
  has that base, it performs a full scrape instead of merging fresh selected
  categories with stale unselected categories and advertising a new version.

## Executed tests

- Python unittest: isolated A -> B -> C catalogs survive repeated startup
  initialization; old/invalid replacements are rejected; a corrupt active file
  is preserved and reported instead of replaced by the seed. Passed.
- Existing bundled catalog passes the strengthened validation. Passed.
- JavaScript syntax check. Passed.
- Real phone, isolated origin http://localhost:8765 via ADB reverse: A -> B -> C,
  three reloads after each update with server still offering A, concurrent stale
  writes, equal-version replacement and invalid data. Passed with no page errors.
- Real phone: `am force-stop com.android.chrome`, reopen, confirm C. Passed.
- Full phone reboot: after USB authorization was restored, C was still active.
  Passed with no page errors; the inspected logcat crash buffer was empty.
- Free-host restart scope test: matching base preserves scoped refresh; missing
  or stale base forces full refresh. Passed (two Python tests total).

No app data was cleared and no app was uninstalled. Production catalog was
read only. The phone tests exercise corrected code at a separate local origin,
not the production installed PWA. No new APK was built or installed because
this project is a PWA whose wrapper is managed by Chrome.

## Remaining deployment work

Publish the reviewed files, verify the served v72 service worker/client, and
repeat the persistence tests on the installed PWA while preserving its real
catalog. Publication awaits explicit GitHub authorization after automatic
approval review rejected the push. Render and phone access now work.

Free hosting does not preserve the server's filesystem across deployments or
instance replacement. This solution preserves the validated catalog on the
same phone/browser origin and blocks stale server fallback. It does not provide
cross-device cloud backup or recovery after the user deletes browser site data.

## Reproduction tools

`python -m unittest test_persistence.py` runs isolated server tests.
`node persistence-test-server.cjs` serves the app with seed A on port 8765.
Forward port 8765 to the phone with ADB reverse and forward local port 9224 to
Chrome's `chrome_devtools_remote`. `node test-phone.cjs` runs on a fresh isolated
test origin; `node test-phone.cjs --verify` checks that C remains after a restart.
Install Playwright or set PLAYWRIGHT_MODULE to its existing module path.

## Render account inspection after login

Verified in Render dashboard: service srv-d8nat5m7r5hc73ajv94g uses the Free
compute plan and main commit af768a18948f64dc416476c1d8cdb325e0c4b90c.
The Disk page explicitly refuses persistent disks on Free compute. The displayed
Starter compute price is USD 7/month, excluding disk charges. No paid upgrade,
deployment, or GitHub publication was performed. ADB authorization was restored.
