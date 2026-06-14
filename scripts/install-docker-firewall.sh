#!/usr/bin/env bash
# Install persistent DOCKER-USER rules via a systemd oneshot (survives reboot).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
unit_path="/etc/systemd/system/deployher-docker-firewall.service"
script_path="$repo_root/scripts/docker-firewall.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "install-docker-firewall: run as root" >&2
  exit 1
fi

chmod +x "$script_path"

cat >"$unit_path" <<EOF
[Unit]
Description=Deployher Docker DOCKER-USER firewall rules
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$script_path

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable deployher-docker-firewall.service
systemctl start deployher-docker-firewall.service
echo "install-docker-firewall: enabled deployher-docker-firewall.service"
