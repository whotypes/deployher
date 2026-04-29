#!/bin/sh
set -eu

MODE="${DEPLOYHER_EDGE_USE_PATH_ROUTING:-1}"
OUT=/tmp/Caddyfile

if [ "$MODE" = "1" ]; then
  cat <<'EOF' >"$OUT"
{
  admin off
}

:3000 {
  encode zstd gzip

  @api {
    path /api/*
    path /internal/*
    path /d/*
    path /preview/*
    path /health
    path /health/*
  }

  handle @api {
    reverse_proxy app-api:3000
  }

  @tenant host *.localhost
  handle @tenant {
    reverse_proxy app-api:3000
  }

  handle {
    reverse_proxy app-api:3000
  }
}
EOF
else
  API_HOST="${DEPLOYHER_API_HOSTNAME:?DEPLOYHER_API_HOSTNAME is required when DEPLOYHER_EDGE_USE_PATH_ROUTING=0}"
  DASH_HOST="${DEPLOYHER_DASH_HOSTNAME:?DEPLOYHER_DASH_HOSTNAME is required when DEPLOYHER_EDGE_USE_PATH_ROUTING=0}"
  PRIMARY="${DEPLOYHER_PRIMARY_DOMAIN:?DEPLOYHER_PRIMARY_DOMAIN is required when DEPLOYHER_EDGE_USE_PATH_ROUTING=0}"

  LANDING_LIST="${DEPLOYHER_LANDING_HOSTNAMES:-}"
  if [ -z "$LANDING_LIST" ]; then
    LANDING_LIST="${DEPLOYHER_LANDING_HOSTNAME:-$PRIMARY}"
  fi

  # shellcheck disable=SC2086
  set -- $LANDING_LIST
  if [ "$#" -lt 1 ]; then
    echo "edge-entry: set DEPLOYHER_LANDING_HOSTNAMES or DEPLOYHER_LANDING_HOSTNAME" >&2
    exit 1
  fi

  LANDING_MATCH=""
  for h in "$@"; do
    LANDING_MATCH="$LANDING_MATCH $h"
  done

  {
    echo '{'
    echo '  admin off'
    echo '}'
    echo ''
    echo ':3000 {'
    echo '  encode zstd gzip'
    echo ''
    echo "  @api_host host $API_HOST"
    echo '  handle @api_host {'
    echo '    reverse_proxy app-api:3000'
    echo '  }'
    echo ''
    echo "  @dash host $DASH_HOST"
    echo '  handle @dash {'
    echo '    reverse_proxy app-api:3000'
    echo '  }'
    echo ''
    echo "  @landing host${LANDING_MATCH}"
    echo '  handle @landing {'
    echo '    reverse_proxy marketing:80'
    echo '  }'
    echo ''
    echo "  @previews host *.$PRIMARY"
    echo '  handle @previews {'
    echo '    reverse_proxy app-api:3000'
    echo '  }'
    echo ''
    echo '  handle {'
    echo '    respond "Not Found" 404'
    echo '  }'
    echo '}'
  } >"$OUT"
fi

exec caddy run --config "$OUT"
