#!/bin/sh
# Rebuilds carrotbox_editor.js and serves CarrotBox at http://localhost:8123/
# (needs Perl and Node.js). Usage: ./dev.sh [port]
cd "$(dirname "$0")" && perl build.pl || exit 1
exec node tools/serve.js "${1:-8123}"
