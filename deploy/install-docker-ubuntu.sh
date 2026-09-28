#!/usr/bin/env bash
# Run with sudo on the new Ubuntu VM, not on the development Mac.
set -euo pipefail
if [[ $(id -u) != 0 ]]; then
  echo 'Run this script with sudo on your Ubuntu VM.' >&2
  exit 1
fi
source /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 ]]; then
  echo 'This helper is for a fresh Ubuntu 24.04 VM. Use Docker’s official instructions for another OS.' >&2
  exit 1
fi
apt-get update
apt-get install -y ca-certificates curl git
install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg --output /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
docker_arch=$(dpkg --print-architecture)
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable\n' "$docker_arch" > /etc/apt/sources.list.d/routemeet-docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
