#!/usr/bin/env bash
# CLUSTER. Pull exactly the audited subset (Commons images + YouTube videos) into data/raw/.
# Requires configs/manifest.json and configs/selection.yaml committed from the laptop.
set -euo pipefail
cd "$(dirname "$0")/../.."
test -f configs/selection.yaml || { echo "configs/selection.yaml missing — run the audit on the laptop first"; exit 1; }
python scripts/fetch.py --selection configs/selection.yaml --commons
python scripts/fetch.py --selection configs/selection.yaml --youtube --lock-hashes
