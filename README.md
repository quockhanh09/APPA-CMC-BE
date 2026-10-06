# APPA-CMC-BE

## Registration intake

The public `POST /api/registrations` endpoint stores registration details and
initializes the application workflow. Authenticated CMS users can read these
records through `GET /api/applications`; workflow actions remain under
`/api/applications/:id`. Registration records are persisted in `src/data/db.json`.

Staff accounts created in the CMS are also saved by the backend in the same data
file. On Render, attach a persistent disk and set `DB_FILE` to a file on its mount
path (for example `/var/data/db.json`) so staff accounts and submitted
registrations survive service restarts and redeploys. Configure `CORS_ORIGINS`
as a comma-separated list if additional website origins are needed; the
registration site, CMS, and local Vite origins are already allowed.
