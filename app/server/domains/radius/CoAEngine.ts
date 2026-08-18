/**
 * CoAEngine — إرسال CoA مع Loop Prevention
 * يمنع إرسال نفس CoA مرتين خلال 5 دقائق
 * Radius Pro Local V2
 */

import { nasRepository } from './repositories/NasRepository';
import { mikrotikPlugin } from './plugins/MikrotikPlugin';
import { Queue } from '../../core/Queue';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { EventBus, Events } from '../../core/EventBus';
import { Config } from '../../core/ConfigService';
import type { NetworkPlugin } from './plugins/NetworkPlugin';
import * as coaServiceInfra from '../../services/coaService';

// Loop Prevention: تتبع آخر CoA لكل مستخدم
const coaLastSent = new Map<string, number>();

export class CoAEngine {
  private plugins = new Map<string, NetworkPlugin>();

  constructor() {
    this.plugins.set('mikrotik', mikrotikPlugin);
  }

  /**
   * قطع اتصال مستخدم
   * يُضاف للـ Queue — لا يُنفَّذ بشكل متزامن
   */
  async queueDisconnect(username: string, nasId: number): Promise<void> {
    // Loop Prevention
    if (this.isRecentlySent(username, 'disconnect')) {
      Logger.warn(`CoAEngine: loop detected for ${username} — skipping disconnect`, {
        context: 'CoAEngine',
        errorCode: 'COA_003',
      });
      return;
    }

    const nas = await nasRepository.findById(nasId);
    if (!nas || !nas.nasname || !nas.secret) {
      Logger.warn(`CoAEngine: NAS#${nasId} not found or missing credentials`, {
        context: 'CoAEngine',
        errorCode: 'RAD_002',
      });
      return;
    }

    this.markSent(username, 'disconnect');

    Queue.add('coa.disconnect', {
      username,
      nasIp: nas.nasname,
      secret: nas.secret,
      nasType: nas.type ?? 'mikrotik',
    });

    Logger.info(`CoAEngine: queued disconnect for ${username}@${nas.nasname}`, {
      context: 'CoAEngine',
    });
  }

  /**
   * قطع جلسة واحدة بـ nasIp + sessionId (يستدعي coaService كـ Infrastructure)
   */
  async disconnectSession(
    username: string,
    nasIp: string,
    sessionId?: string,
    framedIp?: string,
  ) {
    if (this.isRecentlySent(username, `disconnect:${sessionId ?? nasIp}`)) {
      Logger.warn(`CoAEngine: loop detected for ${username}:${sessionId} — skipping`, { context: 'CoAEngine' });
      return { success: false, message: 'Loop prevention', error: 'COA_003' };
    }
    const start = Date.now();
    const result = await coaServiceInfra.disconnectSession(username, nasIp, sessionId, framedIp);
    Metrics.record('coa.disconnect_session_ms', Date.now() - start, { context: 'CoAEngine' });
    if (result.success) {
      this.markSent(username, `disconnect:${sessionId ?? nasIp}`);
      await EventBus.publish(Events.COA_SENT, { username, nasIp, type: 'disconnect' });
    } else {
      await EventBus.publish(Events.COA_FAILED, { username, nasIp, type: 'disconnect' });
    }
    return result;
  }

  /**
   * قطع جميع جلسات مستخدم (يستدعي coaService كـ Infrastructure)
   */
  async disconnectAllSessions(username: string) {
    if (this.isRecentlySent(username, 'disconnect:all')) {
      Logger.warn(`CoAEngine: loop detected for ${username}:all — skipping`, { context: 'CoAEngine' });
      return { success: false, message: 'Loop prevention', error: 'COA_003' };
    }
    this.markSent(username, 'disconnect:all');
    const start = Date.now();
    const result = await coaServiceInfra.disconnectUserAllSessions(username);
    Metrics.record('coa.disconnect_all_ms', Date.now() - start, { context: 'CoAEngine' });
    return result;
  }

  /**
   * تغيير سرعة مستخدم (يستدعي coaService كـ Infrastructure)
   */
  async changeUserSpeed(username: string, uploadMbps: number, downloadMbps: number) {
    const start = Date.now();
    const result = await coaServiceInfra.changeUserSpeed(username, uploadMbps, downloadMbps);
    Metrics.record('coa.change_speed_ms', Date.now() - start, { context: 'CoAEngine' });
    return result;
  }

  /**
   * تحديث خصائص الجلسة (يستدعي coaService كـ Infrastructure)
   */
  async updateSessionAttributes(
    username: string,
    nasIp: string,
    sessionId: string,
    framedIp?: string,
    attributes?: { downloadSpeed?: number; uploadSpeed?: number; sessionTimeout?: number },
  ) {
    const start = Date.now();
    const result = await coaServiceInfra.updateSessionAttributes(username, nasIp, sessionId, framedIp, attributes);
    Metrics.record('coa.update_attrs_ms', Date.now() - start, { context: 'CoAEngine' });
    return result;
  }

  /**
   * معالجة مهمة disconnect من Queue
   */
  async processDisconnect(job: { data: { username: string; nasIp: string; secret: string; nasType: string } }): Promise<void> {
    const { username, nasIp, secret, nasType } = job.data;
    const plugin = this.plugins.get(nasType) ?? mikrotikPlugin;

    const start = Date.now();
    const success = await plugin.disconnect(username, nasIp, secret);
    Metrics.record('coa.total_disconnect_ms', Date.now() - start, { context: 'CoAEngine' });

    if (success) {
      await EventBus.publish(Events.COA_SENT, { username, nasIp, type: 'disconnect' });
    } else {
      await EventBus.publish(Events.COA_FAILED, { username, nasIp, type: 'disconnect' });
    }
  }

  private isRecentlySent(username: string, type: string): boolean {
    const key = `${username}:${type}`;
    const lastSent = coaLastSent.get(key);
    if (!lastSent) return false;
    const elapsed = (Date.now() - lastSent) / 1000 / 60; // بالدقائق
    return elapsed < Config.COA_LOOP_PREVENTION_MINUTES;
  }

  private markSent(username: string, type: string): void {
    const key = `${username}:${type}`;
    coaLastSent.set(key, Date.now());
  }
}

export const coaEngine = new CoAEngine();
