#!/usr/bin/env bash
# One-time host setup for an Ubuntu VPS (Scaleway / OVH / Hetzner / Oracle):
# install Docker, open the OS firewall for HTTP/HTTPS. Run as a sudo user.
set -euo pipefail

echo "==> Adding swap if RAM < ~1.8GB (the client build can OOM on 1GB boxes)"
mem=$(free -m | awk '/^Mem:/{print $2}')
if [ "${mem:-0}" -lt 1800 ] && [ ! -e /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Installing Docker (official script — handles new/odd Ubuntu releases)"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

# OS firewall: Scaleway/OVH/Hetzner Ubuntu images don't block inbound by
# default (you control access via the provider's Security Group). These ACCEPT
# rules are harmless no-ops there, and open 80/443 on hosts that do filter
# (e.g. Oracle). Best-effort.
echo "==> Ensuring 80/443 are open at the OS level"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
sudo netfilter-persistent save 2>/dev/null || true

echo "==> Done. Log out/in (for the docker group), then:"
echo "    DOMAIN=your.domain docker compose -f deploy/vps/docker-compose.yml up -d --build"
echo "    Make sure TCP 80 + 443 are allowed in your provider's Security Group."
