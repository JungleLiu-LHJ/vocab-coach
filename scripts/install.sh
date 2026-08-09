#!/bin/sh
set -eu

REPOSITORY_URL=${VOCAB_COACH_REPOSITORY_URL:-https://github.com/JungleLiu-LHJ/vocab-coach.git}
ROOT_DIR=${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}
APP_DIR=$ROOT_DIR/app
DATA_DIR=$ROOT_DIR/data
UPDATE=false

if [ "${1:-}" = "--update" ]; then
  UPDATE=true
elif [ "$#" -gt 0 ]; then
  echo "usage: install.sh [--update]" >&2
  exit 2
fi

for command in git uv; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if ! uv python find '>=3.12,<3.15' >/dev/null 2>&1; then
  echo "Python 3.12, 3.13, or 3.14 is required" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR" "$DATA_DIR"
chmod 700 "$ROOT_DIR" "$DATA_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  if [ -e "$APP_DIR" ]; then
    echo "Install target exists but is not a Git checkout: $APP_DIR" >&2
    exit 1
  fi
  git clone --branch main --depth 1 "$REPOSITORY_URL" "$APP_DIR"
elif [ "$UPDATE" = true ]; then
  if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
    echo "Refusing to update a checkout with local changes: $APP_DIR" >&2
    exit 1
  fi
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" merge --ff-only origin/main
fi

DB_PATH=$DATA_DIR/vocab.db
DB_URL=sqlite:///$DB_PATH
ENV_FILE=$APP_DIR/.env
if [ ! -e "$ENV_FILE" ]; then
  umask 077
  {
    printf 'VOCAB_DATABASE_URL=%s\n' "$DB_URL"
    printf 'VOCAB_HOST=127.0.0.1\n'
    printf 'VOCAB_PORT=8000\n'
    printf 'LLM_BASE_URL=\nLLM_API_KEY=\nLLM_MODEL=\n'
  } > "$ENV_FILE"
fi

cd "$APP_DIR"
uv sync --frozen
VOCAB_DATABASE_URL=$DB_URL uv run vocab-coach doctor

printf 'Vocab Coach is ready at %s\n' "$APP_DIR"
printf 'Database: %s\n' "$DB_PATH"
