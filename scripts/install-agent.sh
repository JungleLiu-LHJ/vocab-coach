#!/bin/sh
set -eu

usage() {
  echo "usage: install-agent.sh [--agent auto|hermes|openclaw|both] [--update] [--ref REF]" >&2
}

AGENT_TARGET=auto
UPDATE=false
REPOSITORY_REF=${VOCAB_COACH_REPOSITORY_REF:-main}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      AGENT_TARGET=$2
      shift 2
      ;;
    --update)
      UPDATE=true
      shift
      ;;
    --ref)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      REPOSITORY_REF=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

case "$AGENT_TARGET" in
  auto|hermes|openclaw|both) ;;
  *) echo "Unknown --agent target: $AGENT_TARGET" >&2; exit 2 ;;
esac

ROOT_DIR=${VOCAB_COACH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/vocab-coach}
APP_DIR=$ROOT_DIR/app
BIN_DIR=$ROOT_DIR/bin
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd || true)

has_command() {
  command -v "$1" >/dev/null 2>&1
}

if [ ! -f "$PROJECT_ROOT/pyproject.toml" ]; then
  mkdir -p "$ROOT_DIR"
  if [ ! -d "$APP_DIR/.git" ]; then
    for command in git; do
      has_command "$command" || { echo "Required command not found: $command" >&2; exit 1; }
    done
    REPOSITORY_URL=${VOCAB_COACH_REPOSITORY_URL:-https://github.com/JungleLiu-LHJ/vocab-coach.git}
    git clone --branch "$REPOSITORY_REF" --depth 1 "$REPOSITORY_URL" "$APP_DIR"
  fi
  PROJECT_ROOT=$APP_DIR
fi

if [ "$PROJECT_ROOT" != "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$ROOT_DIR"
  git clone --local --branch "$(git -C "$PROJECT_ROOT" branch --show-current)" \
    "$PROJECT_ROOT" "$APP_DIR"
fi

if [ "$UPDATE" = true ]; then
  VOCAB_COACH_REPOSITORY_REF=$REPOSITORY_REF \
    "$APP_DIR/scripts/install.sh" --update
else
  VOCAB_COACH_REPOSITORY_REF=$REPOSITORY_REF \
    "$APP_DIR/scripts/install.sh"
fi

cd "$APP_DIR"
uv sync --frozen --extra agent

mkdir -p "$BIN_DIR"
MCP_WRAPPER=$BIN_DIR/vocab-coach-mcp
umask 077
{
  printf '#!/bin/sh\n'
  printf 'set -eu\n'
  printf 'cd %s\n' "$(printf '%s' "$APP_DIR" | sed "s/'/'\\''/g; s/^/'/; s/$/'/")"
  printf 'exec %s\n' "$(printf '%s' "$APP_DIR/.venv/bin/vocab-coach-mcp" | sed "s/'/'\\''/g; s/^/'/; s/$/'/")"
} > "$MCP_WRAPPER"
chmod 700 "$MCP_WRAPPER"

install_skill() {
  destination=$1
  mkdir -p "$destination"
  cp -R "$APP_DIR/skill/vocab-coach/." "$destination/"
}

register_hermes() {
  has_command hermes || { echo "Hermes is not installed; use --agent auto to skip it" >&2; exit 1; }
  HERMES_HOME_DIR=${HERMES_HOME:-$HOME/.hermes}
  install_skill "$HERMES_HOME_DIR/skills/vocab-coach"
  hermes mcp remove vocab-coach >/dev/null 2>&1 || true
  hermes mcp add vocab-coach --command "$MCP_WRAPPER"
  hermes mcp test vocab-coach
  echo "Installed Vocab Coach for Hermes"
}

register_openclaw() {
  has_command openclaw || { echo "OpenClaw is not installed; use --agent auto to skip it" >&2; exit 1; }
  OPENCLAW_HOME_DIR=${OPENCLAW_HOME:-$HOME/.openclaw}
  install_skill "$OPENCLAW_HOME_DIR/skills/vocab-coach"
  openclaw mcp unset vocab-coach >/dev/null 2>&1 || true
  openclaw mcp add vocab-coach --command "$MCP_WRAPPER"
  openclaw mcp doctor vocab-coach --probe
  echo "Installed Vocab Coach for OpenClaw"
}

if [ "$AGENT_TARGET" = auto ]; then
  AGENT_TARGET=
  has_command hermes && AGENT_TARGET=hermes
  has_command openclaw && AGENT_TARGET=${AGENT_TARGET:+$AGENT_TARGET,}openclaw
  if [ -z "$AGENT_TARGET" ]; then
    echo "Neither Hermes nor OpenClaw was found; install one, then rerun with --agent auto" >&2
    exit 1
  fi
fi

case "$AGENT_TARGET" in
  hermes) register_hermes ;;
  openclaw) register_openclaw ;;
  both) register_hermes; register_openclaw ;;
  hermes,openclaw) register_hermes; register_openclaw ;;
esac

if [ ! -x "$MCP_WRAPPER" ]; then
  echo "MCP wrapper was not created: $MCP_WRAPPER" >&2
  exit 1
fi
echo "MCP command: $MCP_WRAPPER"
echo "Restart the configured Agent to discover Vocab Coach tools."
