#!/bin/sh
set -e

mkdir -p /app/data /app/public/uploads
chown -R appuser:appuser /app/data /app/public/uploads

if [ "$(id -u)" = "0" ]; then
  exec su -s /bin/sh -c 'exec "$@"' appuser -- "$@"
fi

exec "$@"
