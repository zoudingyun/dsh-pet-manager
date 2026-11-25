/**
 * 插件入口：把管理器的路由挂到宿主，并对外暴露服务名。
 *
 * 管理器不认识宠物引擎内部——它只读写 `$DSH_HOME/dsh-pet/pet/` 并请运行时的 /reload 重建窗口。
 * 必须始终成立：用户数据根只从 dsh-home-paths 推导，不在这里另拼目录名。
 * @module dsh-pet-manager/src/host/index
 */
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';

import { ROUTE_SEGMENT, USER_ROOT_NAME } from '../shared/constants.ts';
import { join } from 'node:path';

import { handleManagerRequest } from './routes.ts';

/** 插件行 id（与 cordis.patch.yml 一致）。 */
export const name = 'pet-manager';
/** 需要注入的服务：webServer（注册管理路由）；connection 提供已鉴权站点来源。 */
export const inject = ['webServer'];

/** 宿主上下文里用到的能力（peer 类型包本地不可解析，这里只声明实际调用的部分）。 */
interface HostContext {
  readonly webServer: {
    register(route: {
      kind: 'prefix';
      path: string;
      handler: (req: never, res: never) => void | Promise<void>;
    }): () => void;
    getOrigin(): string;
  };
  readonly logger?: { info?(msg: string): void; warn?(msg: string): void };
  effect(setup: () => () => void, label: string): void;
}

/**
 * 挂载管理器路由。
 *
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: HostContext): void {
  const userRoot = join(resolveDshHome(), USER_ROOT_NAME);
  const origin = ctx.webServer.getOrigin();

  const log = {
    info: (msg: string): void => ctx.logger?.info?.(`[dsh-pet-manager] ${msg}`),
    warn: (msg: string): void => ctx.logger?.warn?.(`[dsh-pet-manager] ${msg}`),
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_SEGMENT,
        handler: (req, res) =>
          handleManagerRequest(req as never, res as never, { userRoot, origin, log }),
      }),
    'dsh-pet-manager: routes',
  );

  log.info(`管理器已挂到 ${ROUTE_SEGMENT}，宠物目录 ${join(userRoot, 'pet')}`);
}
