/**
 * 插件身份与路由段：管理器自己的挂载点，与运行时（dsh-pet 的 /dsh-pet-7340）并列。
 *
 * 管理器不是运行时：它不播任何动画、不建任何窗口，只读写运行时留下的 pet 目录并请它重载。
 * 必须始终成立：本包的 ROUTE_SEGMENT 与运行时不同，否则两条前缀路由会在同一个 webServer 上冲突。
 * @module dsh-pet-manager/src/shared/constants
 */

/** 管理器注册的路由段（服务端路径，不带浏览器挂载前缀）。 */
export const ROUTE_SEGMENT = '/dsh-pet-manager-7340';

/** 被管理的运行时插件：宠物引擎本体。 */
export const RUNTIME_PACKAGE = 'dsh-pet';

/** 运行时的路由段：管理器调它做重载。 */
export const RUNTIME_ROUTE_SEGMENT = '/dsh-pet-7340';

/** 用户数据根名（与运行时的目录名一致：它读写这里，管理器只读这里）。 */
export const USER_ROOT_NAME = 'dsh-pet';

/** 宠物包目录名（相对用户数据根）。 */
export const PET_DIR_NAME = 'pet';

/** 主配置文件名。 */
export const MAIN_CONFIG_NAME = 'main-config.jsonc';

/** 管理器自己的状态文件名（启用/停用记录，与运行时配置分开）。 */
export const MANAGER_STATE_NAME = '.manager-state.json';

/** 宠物包配置文件后缀。 */
export const PET_CONFIG_SUFFIX = '-config.json';

/**
 * 从文档基准地址取出挂载前缀（baseURI 的目录部分）。
 *
 * dsh 返回 index 时注入 `<base href="./">`，baseURI 因此正是「宿主提供 UI 的那个目录」，
 * 也是浏览器解析相对请求的基准；反代/应用网关把 UI 挂在子路径下时，缺的就是这一段前缀。
 *
 * @param baseURI - 文档基准地址；宿主进程、桌面本地页与 Node 测试都没有它。
 * @returns 去掉尾部斜杠的目录部分；空串、非 http(s)、非法地址一律 `''`，且不抛异常。
 */
export function mountPrefixOf(baseURI: string | undefined): string {
  if (baseURI === undefined || baseURI === '') return '';
  try {
    const url = new URL(baseURI);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * 一处算出浏览器侧地址：挂载前缀 + 路由段。
 *
 * @param baseURI - 文档基准地址；缺省时按无前缀处理。
 * @returns 请求与素材的公共前缀，形如 `/app/x/dsh-pet-manager-7340`。
 */
export function routePathOf(baseURI: string | undefined): string {
  return mountPrefixOf(baseURI) + ROUTE_SEGMENT;
}
