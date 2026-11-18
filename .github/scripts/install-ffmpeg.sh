#!/usr/bin/env bash
# Installs ffmpeg for the video tests. The runner's apt mirror is sometimes very slow or hangs, so
# packages are kept in APT_CACHE_DIR (restored by actions/cache), each attempt has its own time
# limit and a retry resumes the partial download instead of starting over.
set -uo pipefail

cache="${APT_CACHE_DIR:?APT_CACHE_DIR is not set}"
mkdir -p "$cache/partial"
apt_opts=(-o Acquire::Retries=3 -o "Dir::Cache::Archives=$cache" -o APT::Keep-Downloaded-Packages=true)

# The man-db trigger can take minutes on hosted runners and is not needed in CI.
sudo rm -f /var/lib/man-db/auto-update

for attempt in 1 2 3; do
  if timeout 90 sudo apt-get update -o Acquire::Retries=3 &&
    timeout 300 sudo apt-get install -y --no-install-recommends "${apt_opts[@]}" ffmpeg; then
    sudo chown -R "$(id -u):$(id -g)" "$cache"
    ffmpeg -hide_banner -version | head -1
    exit 0
  fi
  echo "::warning::ffmpeg install attempt $attempt failed; retrying"
  sleep 10
done
echo "::error::ffmpeg could not be installed after 3 attempts"
exit 1
