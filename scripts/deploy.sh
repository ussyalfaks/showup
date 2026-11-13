#!/usr/bin/env bash
# Build and deploy the ShowUp contract, then point the app at it.
#
#   OWNER=you.testnet ./scripts/deploy.sh                    # testnet, contract = showup.you.testnet
#   OWNER=you.testnet CONTRACT=showup2.you.testnet ./scripts/deploy.sh
#   NETWORK=mainnet OWNER=you.near ./scripts/deploy.sh       # asks you to type "yes" first
#
# Needs: Rust with the wasm32-unknown-unknown target, cargo-near, near-cli-rs (`near`),
# and OWNER's key in the system keychain or the legacy keychain (~/.near-credentials).
# CONTRACT may equal OWNER to deploy straight onto your own account.
#
# First run: creates CONTRACT as a sub-account of OWNER funded with FUND, deploys, calls new().
# Later runs: redeploys the code without calling new(), so cards and events are kept.
# If you changed the contract's stored state layout, use a new CONTRACT name instead.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
: "${OWNER:?set OWNER to your $NETWORK account, e.g. OWNER=you.$NETWORK}"
CONTRACT="${CONTRACT:-showup.$OWNER}"
FUND="${FUND:-6 NEAR}"   # ~2.8 NEAR pays for the 280 KB contract's storage; the rest pays claim gas
case "$NETWORK" in
  testnet) USDC="${USDC_TOKEN_ID:-usdc.fakes.testnet}" ;;
  mainnet) USDC="${USDC_TOKEN_ID:-17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1}" ;;
  *) echo "NETWORK must be testnet or mainnet" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="$ROOT/contract/target/near/showup.wasm"
NET=(network-config "$NETWORK")

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
exists() { near account view-account-summary "$1" "${NET[@]}" now >/dev/null 2>&1; }
# view METHOD [JSON]: prints only the return value; fails if the call fails (e.g. contract not initialised)
view() {
  local args='{}'; [ $# -ge 2 ] && args="$2"
  near contract call-function as-read-only "$CONTRACT" "$1" json-args "$args" "${NET[@]}" now 2>/dev/null
}

step "Checking tools"
for t in cargo cargo-near near; do
  command -v "$t" >/dev/null || { echo "Missing $t. See the README's 'Deploy your own' section." >&2; exit 1; }
done
rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
  || { echo "Run: rustup target add wasm32-unknown-unknown" >&2; exit 1; }
# Keys from `near ... save-to-keychain` live in the macOS keychain; older ones in ~/.near-credentials.
if [ -f "$HOME/.near-credentials/$NETWORK/$OWNER.json" ]; then
  SIGN=sign-with-legacy-keychain; SAVE=save-to-legacy-keychain
else
  SIGN=sign-with-keychain; SAVE=save-to-keychain
fi
exists "$OWNER" || { echo "$OWNER does not exist on $NETWORK." >&2; exit 1; }

if [ "$NETWORK" = mainnet ]; then
  echo "This deploys $CONTRACT on MAINNET and spends real NEAR from $OWNER (about $FUND on first deploy)."
  read -r -p 'Type "yes" to continue: ' ok
  [ "$ok" = yes ] || { echo "Cancelled."; exit 1; }
fi

step "Running contract tests"
(cd "$ROOT/contract" && cargo test --quiet)

step "Building wasm"
(cd "$ROOT/contract" && cargo near build non-reproducible-wasm)
[ -f "$WASM" ] || { echo "Build did not produce $WASM" >&2; exit 1; }

if exists "$CONTRACT"; then
  step "$CONTRACT already exists"
else
  step "Creating $CONTRACT with $FUND from $OWNER"
  near account create-account fund-myself "$CONTRACT" "$FUND" \
    autogenerate-new-keypair "$SAVE" \
    sign-as "$OWNER" "${NET[@]}" "$SIGN" send
fi

if view get_accepted_tokens >/dev/null; then
  step "Redeploying code (state kept, new() not called)"
  near contract deploy "$CONTRACT" use-file "$WASM" without-init-call \
    "${NET[@]}" "$SIGN" send
else
  step "Deploying and initialising with accepted token $USDC"
  near contract deploy "$CONTRACT" use-file "$WASM" \
    with-init-call new json-args "{\"accepted_tokens\":[\"$USDC\"]}" \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
    "${NET[@]}" "$SIGN" send
fi

step "Checking the deployed contract"
out="$(view get_accepted_tokens || echo "(view call failed)")"
grep -q "$USDC" <<<"$out" || { echo "get_accepted_tokens did not return $USDC:"; echo "$out"; exit 1; }
echo "get_accepted_tokens -> $USDC"

step "Pointing the app at $CONTRACT"
ENV="$ROOT/app/.env"
[ -f "$ENV" ] || cp "$ROOT/app/.env.example" "$ENV"
setvar() {  # setvar KEY VALUE: replace the line, or append it
  if grep -q "^$1=" "$ENV"; then sed -i '' -e "s|^$1=.*|$1=$2|" "$ENV"; else echo "$1=$2" >> "$ENV"; fi
}
setvar EXPO_PUBLIC_NETWORK "$NETWORK"
setvar EXPO_PUBLIC_CONTRACT_ID "$CONTRACT"
setvar EXPO_PUBLIC_USDC_ID "$USDC"
echo "Wrote $ENV"

cat <<EOF

Deployed $CONTRACT on $NETWORK.
  Explorer: https://$([ "$NETWORK" = testnet ] && echo testnet.)nearblocks.io/address/$CONTRACT
  Next:     cd app && npx expo start -c
Keep a few NEAR on $CONTRACT: it pays gas for gift-card claims (each card's 0.025 NEAR fee covers it).
EOF
