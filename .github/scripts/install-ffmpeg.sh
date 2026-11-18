#!/usr/bin/env bash
# Installs ffmpeg for the video tests. The runner's apt mirror sometimes hangs, so every attempt
# has its own time limit and the whole install is retried instead of waiting for the job timeout.
set -uo pipefail

# The man-db trigger can take minutes on hosted runners and is not needed in CI.
sudo rm -f /var/lib/man-db/auto-update

for attempt in 1 2 3; do
  if timeout 120 sudo apt-get update -o Acquire::Retries=3 &&
    timeout 180 sudo apt-get install -y --no-install-recommends -o Acquire::Retries=3 ffmpeg; then
    ffmpeg -hide_banner -version | head -1
    exit 0
  fi
  echo "::warning::ffmpeg install attempt $attempt failed; retrying"
  sleep 10
done
echo "::error::ffmpeg could not be installed after 3 attempts"
exit 1
