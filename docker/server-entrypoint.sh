#!/bin/sh
set -e

npm run db:migrate
exec "$@"
