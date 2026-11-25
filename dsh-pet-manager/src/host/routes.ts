/**
 * 路由层：把管理器的四个动作挂到 webServer。
 *
 * 只做「解析请求 → 调 operations / pet-packs → 写响应」，不写业务规则。
 * 必须始终成立：所有响应都是 JSON；错误带稳定 code；不把绝对路径以外的服务器信息外泄。
 * @module dsh-pet-manager/src/host/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { ROUTE_SEGMENT } from '../shared/constants.ts';
import type { ManagerResult, PetPack } from '../shared/types.ts';
import { importPetPack, removePetPack, setPetEnabled } from './operations.ts';
import { scanPetPacks } from './pet-packs.ts';
import { reloadRuntime } from './reload-runtime.ts';

/** 请求体上限：宠物包只是几条 JSON，超过这个量级必然是误用。 */
const MAX_BODY_BYTES = 64 * 1024;

/** 路由依赖：用户数据根与 webServer 来源。 */
export interface RouteDeps {
  /** 运行时用户数据根（`$DSH_HOME/dsh-pet`）。 */
  readonly userRoot: string;
  /** 本机来源，用于回调运行时的 /reload。 */
  readonly origin: string;
  /** 插件日志。 */
  readonly log: { info(msg: string): void; warn(msg: string): void };
}

/** 写一个 JSON 响应。 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/** 读请求体；超限返回 undefined。 */
async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 把 Result 映射成 HTTP 响应。 */
function sendResult<T>(res: ServerResponse, result: ManagerResult<T>): void {
  if (result.ok) {
    sendJson(res, 200, { ok: true, value: result.value });
    return;
  }
  // not-found / invalid-prefix 都是用户输入问题，用 400；其余按 500 归到系统侧
  const isUserError = ['invalid-prefix', 'not-found', 'pet-not-found', 'already-exists', 'no-config', 'source-missing', 'source-not-dir'].includes(
    result.error.code,
  );
  sendJson(res, isUserError ? 400 : 500, { ok: false, error: result.error });
}

/** 解析 JSON 请求体里必须存在的字段。 */
function pickField(body: unknown, field: string): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * 处理一条管理器请求。
 *
 * @param req - 原始请求。
 * @param res - 响应写入器。
 * @param deps - 依赖。
 * @returns 完成时 resolve；路由未命中时已写好 404。
 */
export async function handleManagerRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDeps,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  // 去掉挂载前缀，拿到动作段
  const rest = decodeURIComponent(url.pathname.slice(ROUTE_SEGMENT.length)).replace(/^\/+|\/+$/g, '');
  const method = req.method ?? 'GET';

  try {
    if (rest === 'packs' && method === 'GET') {
      const packs: PetPack[] = scanPetPacks(deps.userRoot);
      sendJson(res, 200, { ok: true, value: packs });
      return;
    }

    if (rest === 'remove' && method === 'POST') {
      const raw = await readBody(req);
      if (raw === undefined) return sendJson(res, 413, { ok: false, error: { code: 'payload-too-large', message: '请求体过大' } });
      const prefix = pickField(safeParse(raw), 'prefix');
      if (prefix === undefined) return sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: '缺少 prefix' } });

      const removed = removePetPack(deps.userRoot, prefix);
      if (!removed.ok) return sendResult(res, removed);
      const reload = await reloadRuntime(deps.origin);
      deps.log.info(`移除宠物包 ${prefix}；${reload.message}`);
      return sendJson(res, 200, { ok: true, value: { ...removed.value, reload } });
    }

    if (rest === 'import' && method === 'POST') {
      const raw = await readBody(req);
      if (raw === undefined) return sendJson(res, 413, { ok: false, error: { code: 'payload-too-large', message: '请求体过大' } });
      const source = pickField(safeParse(raw), 'sourceDir');
      if (source === undefined) return sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: '缺少 sourceDir' } });

      const imported = importPetPack(deps.userRoot, source);
      if (!imported.ok) return sendResult(res, imported);
      const reload = await reloadRuntime(deps.origin);
      deps.log.info(`导入宠物包 ${imported.value.prefix}；${reload.message}`);
      return sendJson(res, 200, { ok: true, value: { ...imported.value, reload } });
    }

    if (rest === 'toggle' && method === 'POST') {
      const raw = await readBody(req);
      if (raw === undefined) return sendJson(res, 413, { ok: false, error: { code: 'payload-too-large', message: '请求体过大' } });
      const body = safeParse(raw);
      const prefix = pickField(body, 'prefix');
      const petId = pickField(body, 'petId');
      const enabled = (body as { enabled?: unknown })?.enabled;
      if (prefix === undefined || petId === undefined || typeof enabled !== 'boolean') {
        return sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: '需要 prefix / petId / enabled' } });
      }

      const toggled = setPetEnabled(deps.userRoot, prefix, petId, enabled);
      if (!toggled.ok) return sendResult(res, toggled);
      const reload = await reloadRuntime(deps.origin);
      deps.log.info(`宠物 ${prefix}/${petId} display=${toggled.value.display}；${reload.message}`);
      return sendJson(res, 200, { ok: true, value: { ...toggled.value, reload } });
    }

    if (rest === 'reload' && method === 'POST') {
      const reload = await reloadRuntime(deps.origin);
      return sendJson(res, 200, { ok: true, value: reload });
    }

    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `未知动作：${rest || '(空)'}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log.warn(`管理器请求失败：${message}`);
    if (!res.writableEnded) {
      sendJson(res, 500, { ok: false, error: { code: 'internal-error', message: '管理器内部错误' } });
    }
  }
}

/** 宽容解析 JSON；失败返回 undefined（由字段校验给出统一错误）。 */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
