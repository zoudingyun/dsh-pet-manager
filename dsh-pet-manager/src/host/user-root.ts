/**
 * 插件用户数据根的唯一定义与一次性迁移。
 *
 * dsh-pet-manager 从 dsh-pet fork 而来，长期用户的配置、待办与素材都留在旧目录
 * `$DSH_HOME/dsh-pet/`。首次启动时把旧目录整体重命名成新目录，用户无感知；
 * 重命名失败（跨盘、权限、旧进程占用）不阻断启动，退回旧目录继续读写。
 * 必须始终成立：路径只在这里拼一次——宿主装配、独立模式与桌面 Helper 都调本模块，
 * 任何一处另写 'dsh-pet-manager' 字面量都会让迁移后的读写走进两个目录。
 * @module dsh-pet-manager/src/host/user-root
 */
import { existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 当前目录名（新装用户的唯一取值）。 */
export const USER_ROOT_NAME = 'dsh-pet-manager';

/** 上游旧目录名：只用于迁移来源与只读回退，不得用于新建。 */
export const LEGACY_USER_ROOT_NAME = 'dsh-pet';

/**
 * 只算路径，不读盘、不建目录（独立模式的 `--check` 与配置路径镜像用它）。
 *
 * @param dshHome - DSH 主目录。
 * @returns 当前版本的用户数据根绝对路径。
 */
export function userRootPath(dshHome: string): string {
  return join(dshHome, USER_ROOT_NAME);
}

/** 路径存在且确实是目录（占位成文件时不能当数据根用）。 */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 取用户数据根，必要时把旧目录迁移过来。
 *
 * 迁移只做一次：新目录已是目录就原地不动，旧目录里的数据由用户自行合并（不删除、不覆盖）。
 * 新目录被占位成非目录、或重命名失败时，一律退回旧目录继续用——启动失败比用旧目录严重得多。
 *
 * @param dshHome - DSH 主目录。
 * @param log - 迁移结果的可选日志出口。
 * @returns 实际可用的用户数据根。
 */
export function resolveUserRoot(dshHome: string, log?: (message: string) => void): string {
  const next = userRootPath(dshHome);
  const previous = join(dshHome, LEGACY_USER_ROOT_NAME);
  if (!existsSync(previous)) return next;
  if (existsSync(next)) {
    if (isDirectory(next)) return next;
    log?.(`新目录 ${next} 已存在但不是目录，改用旧目录 ${previous}`);
    return previous;
  }
  try {
    renameSync(previous, next);
  } catch (error) {
    log?.(`用户目录迁移失败，继续使用旧目录 ${previous}：${error instanceof Error ? error.message : String(error)}`);
    return previous;
  }
  log?.(`用户目录已迁移：${previous} → ${next}`);
  return next;
}
