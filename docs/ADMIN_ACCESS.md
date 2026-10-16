# Admin access

The admin triage view lives at `/admin`. Its API lives under `/api/admin/` ([#23](https://github.com/igrady2/cant-bleep-this/issues/23)). Only the maintainer can reach either one.

Two layers protect it:

1. **Cloudflare Access** (free plan, email login) sits in front of `/admin` and `/api/admin` on each hostname. Access asks for the maintainer's email, sends a one-time code, and then lets the request through with a signed JWT.
2. **The Worker checks that JWT itself** on the `/admin` page and on every admin API call. That way the routes stay closed on any hostname Access does not cover, such as a `workers.dev` or preview URL, or a hostname whose Access application is missing or misconfigured.

The Worker reads the token from the `Cf-Access-Jwt-Assertion` header, or from the `CF_Authorization` cookie if the header is missing. It accepts the token only when all of these hold:

- The signature is RS256 and verifies against a key from `https://<team domain>/cdn-cgi/access/certs`. Keys are cached for 10 minutes, and an unknown key id triggers one refetch so key rotation works.
- `aud` contains `CF_ACCESS_AUD`.
- `iss` equals `https://<team domain>`.
- `exp` has not passed, and `nbf` (if present) has. Up to 60 seconds of clock skew is allowed.

**It fails closed.** If `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is unset, or the certs can't be fetched, every admin request gets `403`. A request with no token gets `401`, and a token that fails any check gets `403`. Responses never say which check failed.

The code is in `src/lib/admin/access.ts` and uses WebCrypto, so there is no extra dependency. `src/proxy.ts` runs the same check before routing. The page (`src/app/admin/page.tsx`) and each route handler under `src/app/api/admin/` check again on their own.

## What the triage view shows

It reads only the anonymized, permanent test set (`test_cases` rows with `source = 'game'`), never live messages. Text is re-masked at the API boundary with `serializeTestCase`. Usernames are already stand-ins like Player A and Player B, and contact details show as `[redacted]`. The view never shows raw message text, real usernames, player ids or source message ids.

- **Slips** are cases from messages that passed the filter and that players confirmed as Not OK. They are grouped by the rule the deciding reviewers chose.
- **False positives** are cases from messages that the filter blocked and that players confirmed as Fine. They have their own tab. They are grouped by the reviewable rule the filter scored highest, which is the rule that blocked them.
- Each item shows the context lines, the message, the reviewers' reasons (false positives have none, because Fine reviews take no reason), every filter score, the filter version that scored it, and the test-set version it was added in.
- **Tags:** spelling, sound, meaning and context. Toggle them on each item, and filter the list by a tag or by untagged items. Tags are stored in `triage_tags` (migration `0012_admin_triage.sql`).

Migration `0012` adds `test_cases.source_status`, so the view can tell slips and false positives apart from caught and clean cases. It backfills that column from `messages` where the source message still exists. Older game cases whose source message has already been deleted keep `NULL` and do not appear in triage.

## Setup (manual, in the Cloudflare dashboard)

Do this once for production and once for each preview hostname. Nothing here goes in git.

### 1. Find the team domain

Open Cloudflare One (Zero Trust). If this is your first visit, pick a team name and the **Free** plan. The team domain is `<team-name>.cloudflareaccess.com`. You can see it under **Settings > Custom Pages** (or **Team name and domain**).

### 2. Create the Access application

In **Access > Applications > Add an application**, choose **Self-hosted**.

- **Application name:** for example `cant-bleep-this admin (production)`.
- **Session duration:** your choice. 24 hours is fine.
- **Public hostnames:** add one entry per protected path on this hostname:
  - Domain `cantbleepthis.com`, path `admin`
  - Domain `cantbleepthis.com`, path `api/admin`

  Access matches a path and everything under it, so `admin` covers `/admin` and `/admin/...`. If you also serve `www.cantbleepthis.com`, add the same two paths for it.
- **Identity providers:** leave **One-time PIN** on. It's the email login and is included on the free plan.

### 3. Add the policy

Add a policy to the application:

- **Action:** Allow
- **Include:** Emails, set to the maintainer's email address only

Don't add other rules. Save the application.

### 4. Copy the audience tag

Open the application's **Overview** (or **Basic information**) and copy the **Application Audience (AUD) Tag**. Each application has its own tag, so preview and production have different values.

### 5. Give the Worker the two values

Production Worker `cant-bleep-this`:

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --name cant-bleep-this   # e.g. https://<team-name>.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD --name cant-bleep-this           # the AUD tag from step 4
```

`CF_ACCESS_TEAM_DOMAIN` is not a password, so it can go in Wrangler `vars` or the dashboard instead. Keeping both as Worker secrets keeps them out of `wrangler.jsonc`. Either `<team-name>.cloudflareaccess.com` or `https://<team-name>.cloudflareaccess.com` works. A path, port or `http://` is rejected, and the Worker then fails closed.

### 6. Preview hostnames

Repeat steps 2 to 5 for each remote preview hostname, using a separate Access application with its own AUD tag. Set the two values on the preview Worker, not on production.

- **Custom preview hostname** (on a zone you control): same steps as production, with that hostname.
- **`workers.dev` or Preview URLs:** in the Worker's **Settings > Domains & Routes**, turn on **Cloudflare Access** for `workers.dev` and/or Preview URLs. Cloudflare creates an Access application for you. Edit its policy so it allows only the maintainer's email, then copy that application's AUD tag.

If a preview hostname has no Access application, the admin routes there still return `401`/`403`, because no valid token ever arrives. The view is just unusable there until Access is set up.

### 7. Check it

1. In a private window, open `https://cantbleepthis.com/admin`. Access should ask for an email. Enter the maintainer's email, then the code.
2. The page loads, and the **Slips** and **False positives** tabs show counts.
3. Requests that skip Access should be refused. `curl -i https://cantbleepthis.com/api/admin/triage` is stopped by Access before it reaches the Worker. If the Worker also has a `workers.dev` URL without Access, `curl -i https://<worker>.workers.dev/api/admin/triage` should return `401`.
4. Try another email. Access should refuse it.

## Local development

There is no Access in front of `npm run dev` or `npm run preview`, so no real token ever arrives and `/admin` returns `401` or `403` locally. That's intended: there is no local bypass. To work on the UI, use the unit tests (`src/components/admin/triage-board.test.tsx` and `src/lib/admin/*.test.ts`), which mock the API and generate their own signing keys.
