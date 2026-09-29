# Puts the project's user-level tools on PATH: `vp` (vite-plus) and `spacetime`.
#
# Source it (`. scripts/env.sh`); don't execute it. Safe to source repeatedly,
# and works in bash and zsh. Agent shells are not interactive, so they don't
# get the PATH that ~/.zshrc sets up; this is the one place that fixes that.
#
# Note: vite-plus's bin directory also holds shims for node, npm, npx, pnpm and
# bun that route to `vp`'s managed toolchain. Putting it first on PATH is what
# vite-plus intends, so those commands resolve there once this is sourced.

for __dir in "$HOME/.local/bin" "$HOME/.local/share/vite-plus/bin"; do
  case ":$PATH:" in
    *":$__dir:"*) ;;
    *) [ -d "$__dir" ] && PATH="$__dir:$PATH" ;;
  esac
done
unset __dir
export PATH
