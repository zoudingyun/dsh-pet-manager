/**
 * 让运行时重载：管理器改完 pet 目录后请 dsh-pet 重建桌面窗口。
 *
 * 只发一次本机回环请求，不直连运行时的内部对象——两个插件各有自己的进程边界，
 * 走它公开的 /reload 路由是唯一稳定契约。
 * 必须始终成立：请求失败不能让管理器报错崩掉；运行时没装/没启用时应当静默降级，
 * 因为「装了宠物但运行时不可用」是一个合法状态，不是管理器出错。
 * @module dsh-pet-manager/src/host/reload-runtime
 */
import { RUNTIME_ROUTE_SEGMENT } from '../shared/constants.ts';

/** 重载请求的超时：运行时只重启一个子进程，几秒足够，超时就不等了。 */
const RELOAD_TIMEOUT_MS = 5000;

/** 重载结果：成功、或一条可展示的原因。 */
export interface ReloadOutcome {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * 请运行时重载配置。
 *
 * @param origin - webServer 给出的本机来源（如 `http://127.0.0.1:3080`）。
 * @returns 重载结果；失败只描述原因，不抛错。
 */
export async function reloadRuntime(origin: string): Promise<ReloadOutcome> {
  const url = origin + RUNTIME_ROUTE_SEGMENT + '/reload';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal });
    if (!response.ok) {
      return { ok: false, message: `运行时返回 ${response.status}（宠物包已改，重载未完成）` };
    }
    return { ok: true, message: '已请运行时重载' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `运行时未响应（${reason}）；宠物包已改，重启后生效` };
  } finally {
    clearTimeout(timer);
  }
}
