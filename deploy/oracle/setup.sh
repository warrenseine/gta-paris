#!/usr/bin/env bash
# One-time host setup for an Oracle Cloud Ampere A1 (Ubuntu) instance:
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

echo "==> Opening the OS firewall for 80/443 (Ubuntu images block these by default)"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || echo "(install iptables-persistent to persist firewall rules across reboots)"

echo "==> Done. Log out/in (for the docker group), then:"
echo "    DOMAIN=play.example.com docker compose -f deploy/oracle/docker-compose.yml up -d --build"
echo "    Also add an ingress rule for TCP 80 + 443 in the Oracle VCN Security List."
