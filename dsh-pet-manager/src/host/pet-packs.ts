/**
 * 宠物包的读取：把运行时 `pet/` 目录扫成一个可展示的清单。
 *
 * 只读：不建目录、不改文件、不校验动画素材是否齐全（那是运行时的事）。
 * 必须始终成立：只能读 PET_DIR_NAME 下的 `<前缀>-config.json`，不得越出该目录——
 * 面板要展示的是「用户装了哪些宠物」，不是任意路径下的 JSON。
 * @module dsh-pet-manager/src/host/pet-packs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PET_CONFIG_SUFFIX, PET_DIR_NAME } from '../shared/constants.ts';
import type { PetPack, PetSummary } from '../shared/types.ts';

/** 读一个 JSON 文件；解析失败返回 undefined（坏文件不能让整页崩）。 */
function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** 从配置里抽出可展示的宠物摘要；字段缺失一律用安全默认。 */
function summarizePets(raw: unknown): PetSummary[] {
  const pets = (raw as { pets?: unknown })?.pets;
  if (!Array.isArray(pets)) return [];
  const out: PetSummary[] = [];
  for (const item of pets) {
    if (item === null || typeof item !== 'object') continue;
    const pet = item as Record<string, unknown>;
    const id = typeof pet.id === 'string' ? pet.id : '';
    if (id === '') continue;
    out.push({
      id,
      name: typeof pet.name === 'string' && pet.name !== '' ? pet.name : id,
      size: typeof pet.size === 'number' ? pet.size : 0,
      display: typeof pet.display === 'string' ? pet.display : 'both',
    });
  }
  return out;
}

/** 数一个目录下的动画文件数；目录不存在算 0。 */
function countAnimations(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => /\.(webm|mov)$/i.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * 扫描宠物包目录。
 *
 * @param userRoot - 运行时的用户数据根（`$DSH_HOME/dsh-pet`）。
 * @returns 按前缀排序的宠物包清单；目录不存在时为空数组。
 */
export function scanPetPacks(userRoot: string): PetPack[] {
  const petDir = join(userRoot, PET_DIR_NAME);
  if (!existsSync(petDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(petDir);
  } catch {
    return [];
  }

  const packs: PetPack[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(PET_CONFIG_SUFFIX)) continue;
    const prefix = entry.slice(0, -PET_CONFIG_SUFFIX.length);
    if (prefix === '') continue;

    const configPath = join(petDir, entry);
    const raw = readJsonFile(configPath);
    const pets = summarizePets(raw);
    // 配置文件存在但解析不了 = 坏包，仍然列出来并标记，让用户在面板里删掉它，
    // 而不是像现在这样只在日志里报一行、界面上完全看不见。
    const healthy = raw !== undefined;

    packs.push({
      prefix,
      configPath,
      animationDir: join(petDir, `${prefix}-animation`),
      animationCount: countAnimations(join(petDir, `${prefix}-animation`)),
      pets,
      healthy,
    });
  }

  return packs.sort((a, b) => a.prefix.localeCompare(b.prefix));
}
