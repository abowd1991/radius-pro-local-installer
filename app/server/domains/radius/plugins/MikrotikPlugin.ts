/**
 * MikrotikPlugin — Plugin لأجهزة MikroTik
 * يرسل CoA عبر radclient
 * Radius Pro Local V2
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { NetworkPlugin, SpeedProfile } from './NetworkPlugin';
import { Logger } from '../../../core/Logger';
import { Metrics } from '../../../core/Metrics';
import { Config } from '../../../core/ConfigService';

const execAsync = promisify(exec);

export class MikrotikPlugin implements NetworkPlugin {
  readonly name = 'mikrotik';

  async connect(_nasIp: string, _credentials: Record<string, string>): Promise<void> {
    // MikroTik لا يحتاج اتصال مسبق — CoA يُرسل مباشرة
  }

  /**
   * قطع اتصال مستخدم عبر CoA Disconnect-Request
   */
  async disconnect(username: string, nasIp: string, secret: string): Promise<boolean> {
    const start = Date.now();
    try {
      const cmd = `echo "User-Name=${username}" | radclient -x ${nasIp}:${Config.COA_PORT} disconnect "${secret}"`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 10_000 });

      const success = stdout.includes('Disconnect-ACK') || !stdout.includes('Disconnect-NAK');
      Metrics.record('coa.disconnect_ms', Date.now() - start, { context: 'MikrotikPlugin' });

      if (!success) {
        Logger.warn(`MikrotikPlugin: disconnect NAK for ${username}@${nasIp}`, {
          context: 'MikrotikPlugin',
          errorCode: 'COA_001',
          data: { stdout: stdout.slice(0, 200) },
        });
      }

      return success;
    } catch (err) {
      Logger.error(`MikrotikPlugin: disconnect failed for ${username}@${nasIp}`, {
        context: 'MikrotikPlugin',
        errorCode: 'COA_002',
        error: err,
      });
      return false;
    }
  }

  /**
   * تغيير سرعة مستخدم عبر CoA Change-Request
   */
  async changeSpeed(username: string, nasIp: string, secret: string, speed: SpeedProfile): Promise<boolean> {
    const start = Date.now();
    try {
      const rateLimit = `${speed.uploadKbps}k/${speed.downloadKbps}k`;
      const cmd = [
        `echo "User-Name=${username}`,
        `Mikrotik-Rate-Limit=${rateLimit}"`,
        `| radclient -x ${nasIp}:${Config.COA_PORT} coa "${secret}"`,
      ].join(' ');

      const { stdout } = await execAsync(cmd, { timeout: 10_000 });
      const success = stdout.includes('CoA-ACK');
      Metrics.record('coa.speed_change_ms', Date.now() - start, { context: 'MikrotikPlugin' });
      return success;
    } catch (err) {
      Logger.error(`MikrotikPlugin: changeSpeed failed for ${username}@${nasIp}`, {
        context: 'MikrotikPlugin',
        errorCode: 'COA_004',
        error: err,
      });
      return false;
    }
  }

  async ping(nasIp: string): Promise<boolean> {
    try {
      await execAsync(`ping -c 1 -W 2 ${nasIp}`, { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const mikrotikPlugin = new MikrotikPlugin();
