#!/bin/bash
# Starts the local Supabase-compatible stack used for testing.
set -e
cd "$(dirname "$0")"
SECRET=$(python3 -c "import json;print(json.load(open('keys.json'))['secret'])")
export PGDATA=/var/lib/wl-pg/data
if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA" && chown -R postgres /var/lib/wl-pg
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -U postgres --auth=trust >/dev/null"
  NEW=1
fi
chown -R postgres "$PGDATA"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -o '-p 54322 -k /tmp' -l /var/lib/wl-pg/pg.log start -w >/dev/null"
PSQL="psql -h /tmp -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
[ -n "$NEW" ] && $PSQL -f bootstrap.sql
nohup python3 mailsink.py > mail.log 2>&1 &
GOTRUE_DB_DRIVER=postgres GOTRUE_DB_MIGRATIONS_PATH=$PWD/auth/migrations DATABASE_URL="postgres://supabase_auth_admin:authpw@127.0.0.1:54322/postgres?search_path=auth" \
GOTRUE_SITE_URL=http://localhost:3000 API_EXTERNAL_URL=http://localhost:54321 GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**" \
GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_JWT_SECRET=$SECRET GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_DISABLE_SIGNUP=false \
GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 \
GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x GOTRUE_SMTP_ADMIN_EMAIL=noreply@wishlist.local GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify \
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn GOTRUE_PASSWORD_MIN_LENGTH=8 \
nohup ./auth/auth > auth.log 2>&1 &
sleep 4
# Auth's migrations create auth.users / auth.uid(); now the app schema can be applied by the caller.
cat > pgrst.conf <<CONF
db-uri = "postgres://authenticator:authpw@127.0.0.1:54322/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
server-host = "127.0.0.1"
db-channel-enabled = true
CONF
nohup ./postgrest pgrst.conf > pgrst.log 2>&1 &
nohup node gateway.mjs > gateway.log 2>&1 &
sleep 1
echo "stack up"
