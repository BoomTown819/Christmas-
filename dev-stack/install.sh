#!/bin/bash
# Downloads Supabase Auth and PostgREST and creates signing keys, for a local test stack
# (Postgres 16 must already be installed). Hosted Supabase does all of this for you.
set -e
cd "$(dirname "$0")"
curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar xJ
mkdir -p auth && curl -sSL https://github.com/supabase/auth/releases/download/v2.164.0/auth-v2.164.0-x86.tar.gz | tar xz -C auth
pip install --break-system-packages -q aiosmtpd pyjwt
python3 - <<'PY'
import jwt, time, json, secrets
s = secrets.token_urlsafe(40); exp = int(time.time()) + 10 * 365 * 86400
json.dump({"secret": s,
  "anon": jwt.encode({"role": "anon", "iss": "supabase-local", "exp": exp}, s, algorithm="HS256"),
  "service": jwt.encode({"role": "service_role", "iss": "supabase-local", "exp": exp}, s, algorithm="HS256")}, open("keys.json", "w"))
PY
echo "Installed. Next: ./start.sh, then apply ../supabase/migrations/*.sql"
