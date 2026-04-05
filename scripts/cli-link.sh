#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
usage: bash scripts/cli-link.sh [--yes] [--help]

  Links dist/deployher-cli -> ~/.local/bin/deployher.
  If ~/.local/bin is not on PATH, offers to append an export to ~/.zshrc
  (prompts first; use --yes for CI/non-interactive).

  CLI_LINK_NO_ZSHRC=1  skip PATH / .zshrc handling entirely (symlink only).
EOF
}

AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    -h | --help)
      usage
      exit 0
      ;;
    -y | --yes)
      AUTO_YES=true
      ;;
    *)
      echo "error: unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/dist/deployher-cli"
if [[ ! -f "$BIN" ]]; then
  echo "error: $BIN not found. Run: bun run build:cli" >&2
  exit 1
fi
chmod +x "$BIN" 2>/dev/null || true
mkdir -p "${HOME}/.local/bin"
ln -sf "$BIN" "${HOME}/.local/bin/deployher"
echo "linked ${HOME}/.local/bin/deployher -> $BIN"

path_has_local_bin() {
  [[ ":${PATH}:" == *":${HOME}/.local/bin:"* ]]
}

if path_has_local_bin; then
  exit 0
fi

echo ""
echo "this shell (run now):"
echo '  export PATH="$HOME/.local/bin:$PATH"'

if [[ -n "${CLI_LINK_NO_ZSHRC:-}" ]]; then
  echo ""
  echo "add ~/.local/bin to PATH permanently (e.g. in ~/.zshrc):"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
  exit 0
fi

ZSHRC="${HOME}/.zshrc"
MARKER="# deployher cli:link — ~/.local/bin on PATH"

if [[ -f "$ZSHRC" ]] && grep -qF "$MARKER" "$ZSHRC" 2>/dev/null; then
  echo ""
  echo "PATH block already in ~/.zshrc; open a new terminal tab or: source ~/.zshrc"
  exit 0
fi

if [[ -f "$ZSHRC" ]] && grep -vE '^[[:space:]]*#' "$ZSHRC" | grep -qF ".local/bin" 2>/dev/null; then
  echo ""
  echo "~/.zshrc already mentions .local/bin on a non-comment line; open a new terminal or fix PATH there."
  exit 0
fi

append_zshrc() {
  {
    printf '\n%s\n' "$MARKER"
    printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"'
  } >>"$ZSHRC"
  echo ""
  echo "appended to ~/.zshrc — run: source ~/.zshrc   (or open a new terminal)"
}

want_append=false
if [[ "$AUTO_YES" == true ]]; then
  want_append=true
elif [[ -t 1 ]]; then
  echo ""
  read -r -p "Append export PATH=\"\$HOME/.local/bin:\$PATH\" to ~/.zshrc? [y/N] " reply </dev/tty || reply=""
  case "$reply" in
    [yY] | [yY][eE][sS]) want_append=true ;;
  esac
else
  echo ""
  echo "no TTY for prompts: not editing ~/.zshrc. Open a terminal for an interactive prompt, or:"
  echo "  bun run cli:link -- --yes"
  exit 0
fi

if [[ "$want_append" == true ]]; then
  append_zshrc
else
  echo ""
  echo "skipped ~/.zshrc. Add PATH yourself or re-run and answer y."
fi
