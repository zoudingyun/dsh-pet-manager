/**
 * 浏览器半边的 HTTP 客户端：调管理器自己的路由段。
 *
 * 只做请求与形状校验，不缓存、不重试——面板上的每个动作都是用户显式点的，
 * 失败必须如实回显而不是静默重试。
 * 必须始终成立：ROUTE_PATH 带浏览器挂载前缀（反代/子路径部署时缺它就 404）。
 * @module dsh-pet-manager/src/client/api
 */
import { ROUTE_SEGMENT, routePathOf } from '../shared/constants.ts';
import type { PetPack } from '../shared/types.ts';

/** 浏览器侧地址：按文档基准解析，带挂载前缀。 */
const ROUTE_PATH = routePathOf(typeof document === 'undefined' ? undefined : document.baseURI);

/** 一次请求的结果：成功带数据，失败带人话。 */
export interface CallResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly message?: string;
}

/** 发一个 JSON 请求并解析统一信封。 */
async function call<T>(action: string, init: RequestInit = {}): Promise<CallResult<T>> {
  try {
    const response = await fetch(ROUTE_PATH + '/' + action, {
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    const body = (await response.json()) as
      | { ok: true; value: T }
      | { ok: false; error: { code: string; message: string } };
    if (body.ok) return { ok: true, value: body.value };
    return { ok: false, message: body.error.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** 列出宠物包。 */
export async function listPacks(): Promise<CallResult<PetPack[]>> {
  return call<PetPack[]>('packs');
}

/** 删除一个宠物包。 */
export async function removePack(prefix: string): Promise<CallResult<{ prefix: string; reload: { ok: boolean; message: string } }>> {
  return call('remove', { method: 'POST', body: JSON.stringify({ prefix }) });
}

/** 从本地目录导入宠物包。 */
export async function importPack(sourceDir: string): Promise<CallResult<{ prefix: string; reload: { ok: boolean; message: string } }>> {
  return call('import', { method: 'POST', body: JSON.stringify({ sourceDir }) });
}

/** 启用/停用某只宠物。 */
export async function togglePet(
  prefix: string,
  petId: string,
  enabled: boolean,
): Promise<CallResult<{ display: string; reload: { ok: boolean; message: string } }>> {
  return call('toggle', { method: 'POST', body: JSON.stringify({ prefix, petId, enabled }) });
}

export { ROUTE_SEGMENT };
