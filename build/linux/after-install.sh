#!/bin/sh
# Let non-root users talk to 1189:884x / 1189:8890 keyboards over hidraw.
cat > /etc/udev/rules.d/70-mini-key.rules <<'RULES'
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="1189", MODE="0660", TAG+="uaccess"
RULES
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger 2>/dev/null || true
