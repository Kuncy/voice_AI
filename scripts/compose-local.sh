#!/usr/bin/env sh
set -eu

repository_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sed '/exclude_from_hc:/d' "$repository_dir/docker-compose.yml" |
  docker compose --project-directory "$repository_dir" --env-file "$repository_dir/.env.local" \
    -f - -f "$repository_dir/docker-compose.local.yml" "$@"
