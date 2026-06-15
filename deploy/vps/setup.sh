#!/usr/bin/env bash
# One-time host setup for an Ubuntu VPS (Scaleway / OVH / Hetzner / Oracle):
# install Docker, open the OS firewall for HTTP/HTTPS. Run as a sudo user.
set -euo pipefail

echo "==> Installing Docker engine + compose plugin"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
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
