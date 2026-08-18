const PROFILE_NAME = 'RadiusPro';

/**
 * PPTP encryption is negotiated from the PPP profile in MikroTik, not from
 * the pptp-client interface. The command is idempotent for new and existing
 * NAS devices and forces MPPE when the server requires it.
 */
export function buildMikrotikPptpProfileCommand(): string {
  return `:if ([:len [/ppp profile find where name="${PROFILE_NAME}"]] = 0) do={ /ppp profile add name="${PROFILE_NAME}" }
/ppp profile set [find where name="${PROFILE_NAME}"] use-encryption=require only-one=yes change-tcp-mss=yes`;
}

export function buildMikrotikPptpClientCommand(vpnServerAddress: string, username: string, password: string): string {
  return `/interface pptp-client add name=radius-vpn connect-to=${vpnServerAddress} user=${username} password=${password} profile=${PROFILE_NAME} add-default-route=no disabled=no`;
}
