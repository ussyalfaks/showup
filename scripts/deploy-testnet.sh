#!/usr/bin/env bash
# Kept for older instructions. Same as: NETWORK=testnet ./scripts/deploy.sh
#   OWNER=you.testnet ./scripts/deploy-testnet.sh
NETWORK=testnet exec "$(dirname "$0")/deploy.sh" "$@"
