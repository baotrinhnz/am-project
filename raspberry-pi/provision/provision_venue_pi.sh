#!/usr/bin/env bash
###############################################################################
# provision_venue_pi.sh
# -----------------------------------------------------------------------------
# Cấu hình 1 Raspberry Pi mới cho 1 venue (Ambience Monitor).
# Chạy TRÊN Pi mới với user `am`:
#     bash provision_venue_pi.sh
#
# Việc script làm:
#   1. Thêm WiFi quán (NetworkManager, autoconnect ưu tiên cao)
#   2. Ghi /home/am/.env (ACR + Supabase + device_id + venue) và
#      /home/am/enviro-monitor/.env (device_id)
#   3. Deploy music_detector_auto.py + patch SCHEDULE theo giờ quán
#   4. Cài service music-detector-auto, TẮT bpm-monitor & music-recognition
#   5. Set timezone + hostname
#   6. Thêm/cập nhật row trong Supabase device_settings (display_name, venue)
#
# KHÔNG nhúng secret trong script. Key lấy theo thứ tự:
#   venue_secrets.env (cùng thư mục)  →  /home/am/.env sẵn có  →  hỏi.
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="am"
USER_HOME="/home/${USER_NAME}"
TZ_DEFAULT="Pacific/Auckland"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# ── Tìm detector script + service file (cùng thư mục hoặc thư mục cha) ────────
find_file() {
  local name="$1" c
  for c in "$SCRIPT_DIR/$name" "$SCRIPT_DIR/../$name"; do
    [ -f "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}
DETECTOR_SRC="$(find_file music_detector_auto.py)"   || die "Không thấy music_detector_auto.py cạnh script"
SERVICE_SRC="$(find_file music-detector-auto.service)" || die "Không thấy music-detector-auto.service cạnh script"

# ── Secret dùng chung (Supabase + ACRCloud) ──────────────────────────────────
SUPABASE_URL=""; SUPABASE_SERVICE_KEY=""
ACRCLOUD_HOST=""; ACRCLOUD_ACCESS_KEY=""; ACRCLOUD_ACCESS_SECRET=""
AUDD_API_TOKEN=""

if [ -f "$SCRIPT_DIR/venue_secrets.env" ]; then
  say "Đọc secret từ venue_secrets.env"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/venue_secrets.env"
fi
# Fallback: lấy Supabase từ .env sẵn có trên Pi (clone luôn có sẵn)
if [ -z "$SUPABASE_URL" ] && [ -f "$USER_HOME/.env" ]; then
  SUPABASE_URL=$(grep -E '^SUPABASE_URL=' "$USER_HOME/.env" | head -1 | cut -d= -f2- || true)
  SUPABASE_SERVICE_KEY=$(grep -E '^SUPABASE_SERVICE_KEY=' "$USER_HOME/.env" | head -1 | cut -d= -f2- || true)
fi

ask_secret() { # tên_biến  nhãn
  local var="$1" label="$2" cur="${!1}"
  if [ -z "$cur" ]; then read -rp "  $label: " cur; printf -v "$var" '%s' "$cur"; fi
}
say "Kiểm tra secret dùng chung"
ask_secret SUPABASE_URL          "Supabase URL"
ask_secret SUPABASE_SERVICE_KEY  "Supabase SERVICE key"
ask_secret ACRCLOUD_HOST         "ACRCloud host (vd identify-ap-southeast-1.acrcloud.com)"
ask_secret ACRCLOUD_ACCESS_KEY   "ACRCloud access key"
ask_secret ACRCLOUD_ACCESS_SECRET "ACRCloud access secret"
[ -z "$AUDD_API_TOKEN" ] && AUDD_API_TOKEN="unused"

# ── Thông tin riêng từng venue ───────────────────────────────────────────────
say "Thông tin venue / thiết bị"
read -rp "  DEVICE_ID (vd rpi-robbies-01): " DEVICE_ID
read -rp "  Display name (vd AM4): " DISPLAY_NAME
read -rp "  Venue name (vd Robbies Bar): " VENUE_NAME
read -rp "  Location trong venue (Enter = bỏ trống, vd Main Bar): " LOCATION
read -rp "  Hostname mới (vd rosie1): " HOSTNAME_NEW
read -rp "  Temp compensation factor [2.25]: " TEMP_COMP; TEMP_COMP="${TEMP_COMP:-2.25}"
read -rp "  Timezone [$TZ_DEFAULT]: " TZ_IN; TZ_IN="${TZ_IN:-$TZ_DEFAULT}"
read -rp "  Bật screen sharing qua Pi Connect (cài rpi-connect full + Desktop Autologin)? [y/N]: " SS_IN
ENABLE_SS="no"; [[ "${SS_IN,,}" == "y" ]] && ENABLE_SS="yes"

say "WiFi quán"
read -rp "  SSID: " WIFI_SSID
read -rsp "  Password: " WIFI_PASS; echo

[ -z "$DEVICE_ID" ]    && die "DEVICE_ID bắt buộc"
[ -z "$VENUE_NAME" ]   && die "Venue name bắt buộc"
[ -z "$HOSTNAME_NEW" ] && die "Hostname bắt buộc"
[ -z "$WIFI_SSID" ]    && die "SSID bắt buộc"

# ── Giờ mở cửa (xây SCHEDULE) ────────────────────────────────────────────────
say "Giờ mở cửa (24h). Nhập 'open close' vd: 9 22. Để trống = ngày đó đóng."
declare -A HOURS
DAYNAMES=(Mon Tue Wed Thu Fri Sat Sun)
for i in 0 1 2 3 4 5 6; do
  o=""; c=""
  read -rp "  ${DAYNAMES[$i]} : " o c || true
  if [ -n "${o:-}" ] && [ -n "${c:-}" ]; then HOURS[$i]="$o,$c"; fi
done
SCHED_BODY=""
for i in 0 1 2 3 4 5 6; do
  if [ -n "${HOURS[$i]:-}" ]; then
    oc="${HOURS[$i]}"; o="${oc%,*}"; c="${oc#*,}"
    SCHED_BODY+="    $i: ($o, $c),   # ${DAYNAMES[$i]}"$'\n'
  fi
done
[ -z "$SCHED_BODY" ] && warn "Không nhập giờ nào → quán xem như luôn đóng (detector sẽ không nhận diện). Kiểm tra lại nếu sai."

# ── Xác nhận ─────────────────────────────────────────────────────────────────
cat <<SUMMARY

──────────────── XÁC NHẬN ────────────────
 DEVICE_ID     : $DEVICE_ID   ($DISPLAY_NAME)
 Venue         : $VENUE_NAME${LOCATION:+  / $LOCATION}
 Hostname      : $HOSTNAME_NEW
 Timezone      : $TZ_IN
 Temp comp     : $TEMP_COMP
 WiFi          : $WIFI_SSID
 Screen share  : $ENABLE_SS
 Detect        : ACRCloud ($ACRCLOUD_HOST)
 Schedule      :
$(printf '%s' "$SCHED_BODY" | sed 's/^/   /')
───────────────────────────────────────────
SUMMARY
read -rp "Tiến hành cấu hình? [y/N]: " GO
[[ "${GO,,}" == "y" ]] || die "Đã hủy."

# ── 1) WiFi quán ─────────────────────────────────────────────────────────────
say "Thêm WiFi: $WIFI_SSID"
if nmcli -t -f NAME connection show | grep -qx "$WIFI_SSID"; then
  warn "WiFi '$WIFI_SSID' đã tồn tại, bỏ qua."
else
  sudo nmcli connection add type wifi con-name "$WIFI_SSID" ifname wlan0 ssid "$WIFI_SSID" \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$WIFI_PASS" \
    connection.autoconnect yes connection.autoconnect-priority 10
fi

# ── 2) .env ──────────────────────────────────────────────────────────────────
say "Ghi $USER_HOME/.env"
cat > "$USER_HOME/.env" <<ENV
# Supabase credentials
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# Device identifier
DEVICE_ID=$DEVICE_ID

# AudD (không dùng — đang dùng ACRCloud)
AUDD_API_TOKEN=$AUDD_API_TOKEN

# Temperature compensation factor (calib riêng từng Pi)
TEMP_COMPENSATION_FACTOR=$TEMP_COMP

# Music detection - ACRCloud
DETECT_SERVICE=acrcloud
VENUE_NAME=$VENUE_NAME
LOCATION=$LOCATION
ACRCLOUD_HOST=$ACRCLOUD_HOST
ACRCLOUD_ACCESS_KEY=$ACRCLOUD_ACCESS_KEY
ACRCLOUD_ACCESS_SECRET=$ACRCLOUD_ACCESS_SECRET
ENV

say "Ghi $USER_HOME/enviro-monitor/.env"
mkdir -p "$USER_HOME/enviro-monitor"
cat > "$USER_HOME/enviro-monitor/.env" <<ENV
# Supabase credentials
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# Device identifier
DEVICE_ID=$DEVICE_ID

AUDD_API_TOKEN=$AUDD_API_TOKEN
TEMP_COMPENSATION_FACTOR=$TEMP_COMP
ENV

# ── 3) Deploy detector + patch SCHEDULE ──────────────────────────────────────
say "Deploy music_detector_auto.py + patch SCHEDULE"
cp "$DETECTOR_SRC" "$USER_HOME/music_detector_auto.py"
mkdir -p "$USER_HOME/AM_logs/music_detector_auto"
python3 - "$USER_HOME/music_detector_auto.py" "$SCHED_BODY" <<'PYEOF'
import re, sys
path, body = sys.argv[1], sys.argv[2]
new = "SCHEDULE = {\n" + body + "}"
src = open(path, encoding="utf-8").read()
src2, n = re.subn(r"SCHEDULE\s*=\s*\{.*?\n\}", new, src, count=1, flags=re.DOTALL)
if n != 1:
    sys.exit("ERROR: không tìm thấy block SCHEDULE để patch")
open(path, "w", encoding="utf-8").write(src2)
print("SCHEDULE patched OK")
PYEOF

# ── 4) systemd services ──────────────────────────────────────────────────────
say "Cài service music-detector-auto + tắt ambience beat / AudD"
sudo cp "$SERVICE_SRC" /etc/systemd/system/music-detector-auto.service
sudo chown root:root /etc/systemd/system/music-detector-auto.service
sudo chmod 644 /etc/systemd/system/music-detector-auto.service
sudo systemctl daemon-reload
sudo systemctl disable --now bpm-monitor music-recognition 2>/dev/null || true
sudo systemctl enable --now music-detector-auto
sudo systemctl restart enviro-monitor || true

# ── 5) Timezone + hostname ───────────────────────────────────────────────────
say "Set timezone=$TZ_IN, hostname=$HOSTNAME_NEW"
sudo timedatectl set-timezone "$TZ_IN"
sudo hostnamectl set-hostname "$HOSTNAME_NEW"
sudo sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$HOSTNAME_NEW/" /etc/hosts || true

# ── 6) Supabase device_settings (upsert) ─────────────────────────────────────
say "Thêm/cập nhật device_settings trên Supabase"
curl -s -X POST "$SUPABASE_URL/rest/v1/device_settings?on_conflict=device_id" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"display_name\":\"$DISPLAY_NAME\",\"location\":\"$VENUE_NAME\",\"note\":\"$LOCATION\"}" \
  && echo

# ── 7) Screen sharing qua Pi Connect (tùy chọn) ──────────────────────────────
NEEDS_REBOOT="no"
if [ "$ENABLE_SS" == "yes" ]; then
  say "Bật screen sharing: cài rpi-connect (full) + Desktop Autologin"
  sudo apt-get update -qq || true
  sudo apt-get install -y rpi-connect          # bản full có screen sharing (thay rpi-connect-lite)
  sudo raspi-config nonint do_boot_behaviour B4 # Desktop Autologin → có Wayland session
  loginctl enable-linger "$USER_NAME" || true
  export XDG_RUNTIME_DIR="/run/user/$(id -u "$USER_NAME")"
  rpi-connect on || true
  NEEDS_REBOOT="yes"
  if rpi-connect status 2>/dev/null | grep -q "Signed in: yes"; then
    echo "  Pi Connect: đã đăng nhập sẵn."
  else
    warn "Pi Connect CHƯA đăng nhập. Sau khi script xong chạy: rpi-connect signin  (mở link để liên kết tài khoản)."
  fi
fi

say "XONG. Kiểm tra nhanh:"
echo "  systemctl is-active music-detector-auto enviro-monitor"
echo "  tail -f $USER_HOME/AM_logs/music_detector_auto/music_detector_auto.log"
echo
warn "Sensor chỉ có data sau khi GẮN board Enviro+."

if [ "$NEEDS_REBOOT" == "yes" ]; then
  warn "Desktop Autologin cần REBOOT để khởi động Wayland session (screen sharing mới chạy)."
  read -rp "Reboot ngay bây giờ? [y/N]: " RB
  if [[ "${RB,,}" == "y" ]]; then say "Reboot..."; sudo reboot; fi
fi
