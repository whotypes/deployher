#!/usr/bin/env bash
# Block WAN access to Docker-published infra ports. UFW alone does not affect Docker's
# iptables rules; DOCKER-USER is the supported hook for host-level filtering.
set -euo pipefail

INFRA_PORTS="5432,6379,3900,3901,3902,3903,8081,8082,8787,3000"

ext_if="$(ip -4 route show default 2>/dev/null | awk '{print $5; exit}')"
if [[ -z "${ext_if}" ]]; then
  echo "docker-firewall: could not detect default network interface" >&2
  exit 1
fi

rule_exists() {
  iptables -C DOCKER-USER -i "$ext_if" ! -s 127.0.0.1 -p tcp -m multiport --dports "$INFRA_PORTS" -j DROP >/dev/null 2>&1
}

if rule_exists; then
  echo "docker-firewall: DOCKER-USER drop rule already present (interface $ext_if)"
  exit 0
fi

iptables -I DOCKER-USER 1 -i "$ext_if" ! -s 127.0.0.1 -p tcp -m multiport --dports "$INFRA_PORTS" -j DROP
echo "docker-firewall: installed DOCKER-USER drop for tcp/$INFRA_PORTS on $ext_if (non-loopback sources)"
