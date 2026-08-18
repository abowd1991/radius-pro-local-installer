/**
 * NetworkPlugin Interface — Plugin System للأجهزة المختلفة
 * كل جهاز (MikroTik, Cisco, Ubiquiti) = Plugin مستقل
 * Radius Pro Local V2
 */

export interface SpeedProfile {
  downloadKbps: number;
  uploadKbps: number;
}

export interface NetworkPlugin {
  readonly name: string;
  /** الاتصال بجهاز NAS */
  connect(nasIp: string, credentials: Record<string, string>): Promise<void>;
  /** قطع اتصال مستخدم */
  disconnect(username: string, nasIp: string, secret: string): Promise<boolean>;
  /** تغيير سرعة مستخدم */
  changeSpeed(username: string, nasIp: string, secret: string, speed: SpeedProfile): Promise<boolean>;
  /** فحص اتصال الجهاز */
  ping(nasIp: string): Promise<boolean>;
}
