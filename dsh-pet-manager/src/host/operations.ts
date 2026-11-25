/**
 * 宠物包的写操作：删除、导入、启用/停用。
 *
 * 只动 `pet/` 目录内的东西，绝不碰运行时自己的主配置与素材链。
 * 必须始终成立：任何来自面板的前缀都先过 `assertSafePrefix`，删除前把目标解析成绝对路径
 * 并校验仍在宠物目录内——删除是递归的，一个 `..` 就能毁掉用户主目录。
 * @module dsh-pet-manager/src/host/operations
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { PET_CONFIG_SUFFIX, PET_DIR_NAME } from '../shared/constants.ts';
import type { ManagerResult } from '../shared/types.ts';
import { parseJsonc } from './jsonc.ts';

/** 前缀只允许字母、数字、下划线与短横：它同时是目录名与 URL 段。 */
const SAFE_PREFIX = /^[A-Za-z0-9_-]+$/;

/** 失败结果。 */
function fail<T>(code: string, message: string): ManagerResult<T> {
  return { ok: false, error: { code, message } };
}

/**
 * 校验前缀合法性。
 *
 * @param prefix - 面板传来的宠物包前缀。
 * @returns 合法返回 true。
 */
export function assertSafePrefix(prefix: string): boolean {
  return SAFE_PREFIX.test(prefix) && prefix !== '.' && prefix !== '..';
}

/** 宠物包目录（`$DSH_HOME/dsh-pet/pet`）。 */
function petDirOf(userRoot: string): string {
  return join(userRoot, PET_DIR_NAME);
}

/**
 * 删除一个宠物包：配置 + 动画目录一起删。
 *
 * 先删配置再删素材：中途失败时留下「有素材没配置」的孤儿目录，
 * 运行时扫不到它，比留「有配置没素材」的坏包安全。
 *
 * @param userRoot - 运行时用户数据根。
 * @param prefix - 宠物包前缀。
 * @returns 删除结果。
 */
export function removePetPack(userRoot: string, prefix: string): ManagerResult<{ prefix: string }> {
  if (!assertSafePrefix(prefix)) return fail('invalid-prefix', `宠物包名不合法：${prefix}`);

  const petDir = petDirOf(userRoot);
  const configPath = join(petDir, prefix + PET_CONFIG_SUFFIX);
  const animationDir = join(petDir, prefix + '-animation');

  if (!existsSync(configPath) && !existsSync(animationDir)) {
    return fail('not-found', `没有这个宠物包：${prefix}`);
  }

  // 解析后再校验，避免符号链接或拼接把目标带出宠物目录
  const boundary = resolve(petDir) + sep;
  for (const target of [configPath, animationDir]) {
    if (!resolve(target).startsWith(boundary)) {
      return fail('invalid-prefix', `目标越出宠物目录：${target}`);
    }
  }

  try {
    if (existsSync(configPath)) rmSync(configPath, { force: true });
    if (existsSync(animationDir)) rmSync(animationDir, { recursive: true, force: true });
  } catch (error) {
    return fail('remove-failed', `删除失败：${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: true, value: { prefix } };
}

/**
 * 从一个本地目录导入宠物包。
 *
 * 源目录必须直接包含 `<前缀>-config.json`（可带同名 `<前缀>-animation/`）。
 * 目标已存在时拒绝，不做覆盖——静默覆盖会毁掉用户已有的宠物。
 *
 * @param userRoot - 运行时用户数据根。
 * @param sourceDir - 用户选定的源目录。
 * @returns 导入结果，含新前缀。
 */
export function importPetPack(userRoot: string, sourceDir: string): ManagerResult<{ prefix: string }> {
  if (!existsSync(sourceDir)) return fail('source-missing', `源目录不存在：${sourceDir}`);

  let isDir = false;
  try {
    isDir = statSync(sourceDir).isDirectory();
  } catch (error) {
    return fail('source-unreadable', `读不到源目录：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isDir) return fail('source-not-dir', `不是目录：${sourceDir}`);

  let entries: string[];
  try {
    entries = readdirSync(sourceDir);
  } catch (error) {
    return fail('source-unreadable', `读不到源目录：${error instanceof Error ? error.message : String(error)}`);
  }

  const configs = entries.filter((name) => name.endsWith(PET_CONFIG_SUFFIX));
  if (configs.length === 0) {
    return fail('no-config', `源目录里没有 ${PET_CONFIG_SUFFIX} 文件：${sourceDir}`);
  }

  const petDir = petDirOf(userRoot);
  const imported: string[] = [];

  for (const configName of configs) {
    const prefix = configName.slice(0, -PET_CONFIG_SUFFIX.length);
    if (!assertSafePrefix(prefix)) return fail('invalid-prefix', `宠物包名不合法：${prefix}`);

    const destConfig = join(petDir, prefix + PET_CONFIG_SUFFIX);
    const destAnimation = join(petDir, prefix + '-animation');
    if (existsSync(destConfig) || existsSync(destAnimation)) {
      return fail('already-exists', `已存在同名宠物包：${prefix}（请先删除或改名）`);
    }

    const sourceAnimation = join(sourceDir, prefix + '-animation');
    try {
      mkdirSync(petDir, { recursive: true });
      cpSync(join(sourceDir, configName), destConfig);
      if (existsSync(sourceAnimation)) cpSync(sourceAnimation, destAnimation, { recursive: true });
    } catch (error) {
      // 半个包没有意义：回滚已写入的部分，不留残骸
      rmSync(destConfig, { force: true });
      rmSync(destAnimation, { recursive: true, force: true });
      return fail('copy-failed', `复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
    imported.push(prefix);
  }

  return { ok: true, value: { prefix: imported.join(',') } };
}

/**
 * 启用/停用某只宠物：改它所在宠物包配置里那一条的 `display`。
 *
 * 停用写 `none`，启用写回 `both`。只替换该字段的文本片段、其余原样保留，
 * 因为配置里可能有用户手写的注释与顺序，整体重新序列化会把它们抹掉。
 *
 * @param userRoot - 运行时用户数据根。
 * @param prefix - 宠物包前缀。
 * @param petId - 该包内的宠物实例 id。
 * @param enabled - true = both，false = none。
 * @returns 操作结果。
 */
export function setPetEnabled(
  userRoot: string,
  prefix: string,
  petId: string,
  enabled: boolean,
): ManagerResult<{ prefix: string; petId: string; display: string }> {
  if (!assertSafePrefix(prefix)) return fail('invalid-prefix', `宠物包名不合法：${prefix}`);

  const configPath = join(petDirOf(userRoot), prefix + PET_CONFIG_SUFFIX);
  if (!existsSync(configPath)) return fail('not-found', `没有这个宠物包：${prefix}`);

  let parsed: unknown;
  try {
    parsed = parseJsonc(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return fail('config-unreadable', `配置解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const pets = (parsed as { pets?: unknown })?.pets;
  if (!Array.isArray(pets)) return fail('config-invalid', '配置里没有 pets 数组');

  const target = pets.find(
    (item) => item !== null && typeof item === 'object' && (item as Record<string, unknown>).id === petId,
  );
  if (target === undefined) return fail('pet-not-found', `宠物包里没有这只宠物：${petId}`);

  const nextDisplay = enabled ? 'both' : 'none';
  (target as Record<string, unknown>).display = nextDisplay;

  try {
    const tmp = configPath + '.tmp-manager';
    writeFileSync(tmp, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    renameSync(tmp, configPath);
  } catch (error) {
    return fail('write-failed', `写配置失败：${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: true, value: { prefix, petId, display: nextDisplay } };
}
