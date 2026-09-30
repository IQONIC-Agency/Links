# link-hub

Eigener Link-in-Bio-Dienst: mehrere Custom Domains, Seiten pro `domain/slug`, Editor, Länder- und VPN-Block, 18+-Age-Gate, maskierte Links, Absprung aus dem Instagram/Threads-Browser und Stats.

**Stack:** Next.js 15 (App Router) auf Vercel · Neon Postgres (Drizzle ORM) · Vercel Blob · proxycheck.io · sharp

---

## Deploy (Vercel + Neon + Blob)

1. **Repo auf GitHub pushen** und in Vercel importieren (*Add New → Project*). Jeder Push auf `main` deployt automatisch.
2. **Neon anbinden:** Vercel → Projekt → *Storage → Create → Neon*. Setzt `DATABASE_URL` automatisch.
3. **Blob anbinden:** Vercel → Projekt → *Storage → Create → Blob*. Setzt `BLOB_READ_WRITE_TOKEN` automatisch.
4. **Restliche ENV-Variablen** setzen (siehe unten), dann *Redeploy*.
5. **Datenbank-Tabellen** werden bei jedem Deploy automatisch angelegt bzw. aktualisiert (`scripts/migrate-on-build.mjs` läuft vor `next build`). Nichts zu tun.
6. **Skew Protection aktivieren:** Vercel → Projekt → *Settings → Advanced → Skew Protection* einschalten. Verhindert, dass Besucher während eines Deploys alte HTML-Seiten mit neuen JS-Dateien mischen (kaputte Buttons).
7. `https://<deine-domain>/admin` öffnen, mit `ADMIN_USER`/`ADMIN_PASSWORD` anmelden.

### Custom Domains

Vercel → Projekt → *Settings → Domains* → jede Domain hinzufügen und die angezeigten DNS-Einträge beim Domain-Anbieter setzen. Im Admin legst du dann Seiten als `domain + slug` an, z. B. `meinlink.de/anna`. `www.` und Port werden ignoriert, `www.meinlink.de/anna` = `meinlink.de/anna`.

Tipp: eine eigene Admin-Domain (z. B. `admin.meinlink.de`) anlegen und `ADMIN_HOST` darauf setzen. Dann ist `/admin` auf den öffentlichen Link-Domains gar nicht erreichbar.

## ENV-Variablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DATABASE_URL` | ja | Neon-Connection-String (setzt Vercel beim Verbinden) |
| `BLOB_READ_WRITE_TOKEN` oder `BLOB_STORE_ID` | ja | Vercel Blob (setzt Vercel beim Verbinden). Der Store muss **Public** sein. |
| `ADMIN_USER`, `ADMIN_PASSWORD` | ja | Login für `/admin` (HTTP Basic) |
| `VISITOR_SALT` | ja | Geheimer Schlüssel für die anonyme Besucher-ID. Lang und zufällig (`openssl rand -hex 32`). **Nie ändern**, sonst zählen alle Besucher ab dann als neu. |
| `PROXYCHECK_API_KEY` | empfohlen | Key von proxycheck.io. Leer = keine VPN-Prüfung. |
| `PROXYCHECK_DISABLED` | nein | `1` = Kill-Switch, proxycheck.io wird gar nicht mehr gefragt |
| `PROXYCHECK_TIMEOUT_MS` | nein | Standard `800` |
| `ADMIN_HOST` | nein | `/admin` nur auf dieser Domain erlauben |
| `STATS_API_KEY` | nein | Aktiviert `/api/stats` (leer = API aus) |
| `STATS_TIMEZONE` | nein | Standard `Europe/Berlin`, gilt für Heute/Gestern und Tagesverlauf |

## Wie es funktioniert

### Öffentliche Seite `domain/slug`
Die Middleware schreibt `domain.de/anna` intern auf `/site/domain.de/anna` um. Reihenfolge der Prüfungen (gleich für die Seite und für `/r/<id>`):
1. **Bot / Link-Vorschau** (facebookexternalhit, WhatsApp, Telegram, Googlebot, curl …) → neutrale Seite ohne Links, kein Tracking.
2. **Land geblockt** (Vercel-Header `x-vercel-ip-country`) → „nicht verfügbar“.
3. **VPN/Proxy** (wenn pro Seite aktiviert) → „nicht verfügbar“.
4. Sonst die Seite. Offline-Seiten liefern 404.

### Maskierte Links `/r/<id>`
Buttons zeigen nie auf das Ziel, sondern auf `/r/<zufällige-id>` (10 Zeichen, nicht durchzählbar). Die Ziel-URL steht nur im `Location`-Header der Weiterleitung, nie im HTML.

### 18+-Age-Gate
Pro Button einschaltbar. `/r/<id>` zeigt die Abfrage, „Ich bin 18“ setzt ein Cookie für 30 Tage, loggt `age_confirm` und leitet weiter. Mit Cookie wird direkt weitergeleitet (dann gibt es kein neues `age_confirm`-Event).

### Deeplink aus Instagram/Threads
Erst **beim Klick**, nie beim Laden:
- iOS Instagram: `instagram://extbrowser/?url=…`
- iOS Threads: `barcelona://extbrowser/?url=…`
- Android (Instagram, Threads, Facebook, TikTok): `intent://…#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=…;end`
- Ziel ist immer der eigene `/r/<id>`-Link, damit Masking, Age-Gate und Blocks auch im externen Browser greifen.
- Wenn die Seite nach 1,5 s noch sichtbar ist (User hat „Abbrechen“ getippt), geht es normal im In-App-Browser weiter.
- Der Klick wird **vorher** per `navigator.sendBeacon` geloggt.

Pro Seite (Deeplink-Toggle) und pro Button abschaltbar.

### proxycheck.io
Reihenfolge: In-Memory-LRU (5000 IPs) → Neon-Tabelle `ip_checks` (24 h) → API mit 800 ms Timeout. Bei Timeout oder Fehler wird der Besucher **durchgelassen**, VPN gilt dann als „unbekannt“. Jeder Fehler landet als eine JSON-Zeile im Vercel-Log:

```json
{"evt":"check_failed","svc":"proxycheck","error":"TimeoutError: …","ms":801,"timeoutMs":800}
```

In Vercel → *Logs* nach `"svc":"proxycheck"` filtern. Häufen sich Fehler: `PROXYCHECK_DISABLED=1` setzen und redeployen. IPs werden nur als gesalzener Hash gespeichert. Das kostenlose proxycheck.io-Kontingent sind 1.000 Abfragen/Tag, durch den Cache zählt jede IP nur einmal pro 24 h.

### Bilder
Upload im Editor → sharp: EXIF-Drehung, max. 1600 px Breite, WebP Qualität 85 → Vercel Blob. Vercel nimmt pro Request max. 4,5 MB an, deshalb verkleinert der Browser größere Handyfotos vorher.

### Schriften
Selbst gehostet über `@fontsource` (Inter, Poppins, Montserrat, Playfair Display, Roboto, Lato, Oswald, DM Sans). Es gehen keine Anfragen an Google Fonts (DSGVO).

## Tracking & Stats

Alle Events stehen in einer Tabelle `events`: `pageview`, `click`, `age_confirm` mit Land, Gerät, In-App ja/nein (+ welche App), VPN, `visitor_hash` und Zeit.

- **Besucher-ID** = HMAC-SHA-256(IP + User-Agent, `VISITOR_SALT`). Ein einfacher SHA-256 wäre durch Durchprobieren aller IPv4-Adressen umkehrbar, mit geheimem Salt nicht.
- **Pageview** wird vom Browser einmal pro Seitenaufruf gesendet (React-Doppel-Effekte zählen nicht doppelt). Neuladen und je nach Browser auch der Zurück-Button zählen als neuer Aufruf, deshalb rechnet die CTR mit eindeutigen Besuchern.
- **Klick** wird nur einmal gezählt, im In-App-Browser vor dem Absprung. `/r/<id>` selbst loggt nichts, sonst gäbe es beim Öffnen im externen Browser einen zweiten Klick.
- **CTR** = eindeutige Besucher mit Klick ÷ eindeutige Besucher mit Aufruf (nicht Klicks ÷ Aufrufe).
- Bots werden nie geloggt.

**Übersicht** (`/admin/stats`): alle Seiten gruppiert nach Model, Filter Heute/Gestern/7 Tage/30 Tage/Custom. Die Model-Zeile zählt Besucher, die mehrere Seiten eines Models besucht haben, nur einmal.

**Detail** (`/admin/stats/<id>`): Funnel Aufrufe → OF-Klicks → 18+ bestätigt, Länder, Geräte, In-App-Anteil, VPN, Verlauf pro Tag, Klicks pro Button.

Bekannte Unschärfe: Wechselt ein Besucher per Deeplink von Instagram in Safari, ändert sich der User-Agent und damit die Besucher-ID. Klick (Instagram) und 18+ (Safari) zählen dann als zwei Besucher. Pro Funnel-Stufe stimmt die Zahl trotzdem.

### Stats-API

```bash
curl -H "x-api-key: $STATS_API_KEY" "https://admin.meinlink.de/api/stats?range=7d"
curl -H "x-api-key: $STATS_API_KEY" "https://admin.meinlink.de/api/stats?range=custom&from=2026-09-01&to=2026-09-30&page=3"
```

`range` = `today | yesterday | 7d | 30d | custom` (mit `from`/`to`). Ohne `page`: Summen, Models, alle Seiten. Mit `page`: Detail wie im Admin.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local
# Option A: Neon-DB (auch ein Neon-Branch) als DATABASE_URL
# Option B: lokales Postgres, dann zusätzlich DATABASE_DRIVER=pg
npm run db:migrate
npm run dev
```

Ohne `BLOB_READ_WRITE_TOKEN` landen Uploads lokal in `.uploads/` (nur außerhalb von Vercel). Lokal gibt es keinen `x-vercel-ip-country`-Header, Land ist dann „unbekannt“ (außer proxycheck.io liefert es).

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:generate` → neue SQL-Datei in `drizzle/` committen → `npm run db:migrate`.

## Arbeitsweise

- Jedes Feature ein eigener Commit, vor dem Push nachfragen.
- Vor größeren Änderungen einen Tag setzen: `git tag vor-stats-umbau && git push --tags`. Zurück: `git revert` bis zum Tag oder in Vercel das alte Deployment wieder *Promote to Production*.
- Tracking-Änderungen gegen echte Daten prüfen, z. B.:
  ```sql
  -- doppelte Events desselben Besuchers in derselben Sekunde
  select page_id, type, visitor_hash, count(*)
  from events where created_at > now() - interval '1 day'
  group by page_id, type, visitor_hash, date_trunc('second', created_at)
  having count(*) > 1;
  ```

## Später

- **Login:** HTTP Basic ist bewusst einfach. Upgrade auf Auth.js (NextAuth) mit E-Mail-Magic-Link oder Google, sobald mehrere Personen Zugriff brauchen: Middleware-Check durch `auth()` ersetzen.
- Rate-Limit auf `/api/e`, falls jemand gezielt Fake-Events schickt.
