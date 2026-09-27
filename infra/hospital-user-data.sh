#!/bin/bash
#
# Brings up the simulated hospital on first boot.
#
# It installs Node from the official tarball rather than from the distribution
# packages, because the version has to be the one in .nvmrc and no distribution
# promises that. This is the same rule the rest of the project follows: the Node
# version lives in one place and every machine obeys it.
#
# Everything it writes goes to /var/log/cloud-init-output.log, which is where to
# look when the service does not come up.

set -euxo pipefail

NODE_VERSION="${node_version}"
REPO_URL="${repo_url}"

# ---------------------------------------------------------------- Node
cd /tmp
curl -fsSLO "https://nodejs.org/dist/v$${NODE_VERSION}/node-v$${NODE_VERSION}-linux-arm64.tar.xz"
tar -xJf "node-v$${NODE_VERSION}-linux-arm64.tar.xz" -C /opt
ln -sfn "/opt/node-v$${NODE_VERSION}-linux-arm64" /opt/node
ln -sf /opt/node/bin/node /usr/local/bin/node
ln -sf /opt/node/bin/npm /usr/local/bin/npm

# ---------------------------------------------------------------- the code
dnf install -y git
git clone --depth 1 "$${REPO_URL}" /opt/vitalink
cd /opt/vitalink/apps/legacy-sim
npm ci --omit=dev

# The service runs as a user with no login and no home of its own. A simulator
# that serves a WSDL has no business being able to do anything else on the box.
useradd --system --no-create-home --shell /usr/sbin/nologin hospital || true
chown -R hospital:hospital /opt/vitalink

# ---------------------------------------------------------------- the service
cat > /etc/systemd/system/hospital.service <<'UNIT'
[Unit]
Description=Simulated hospital information system, speaking SOAP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hospital
WorkingDirectory=/opt/vitalink/apps/legacy-sim
ExecStart=/usr/local/bin/node src/server.js
Restart=always
RestartSec=5
Environment=LEGACY_SOAP_PORT=${soap_port}
Environment=LEGACY_SIM_PATIENTS=${patients}
Environment=LEGACY_SIM_SEED=${seed}

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now hospital.service
