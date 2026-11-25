/**
 * 宠物包扫描与读写的单元测试 —— 钉住管理器对 pet 目录的读写口径。
 *
 * 每个用例自建临时 DSH 主目录，不碰真实 ~/.dsh。
 * 跑法：node --experimental-strip-types --test src/host/operations.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { stripJsonc, parseJsonc } from './jsonc.ts';
import { importPetPack, removePetPack, setPetEnabled } from './operations.ts';
import { scanPetPacks } from './pet-packs.ts';

/** 建一个临时用户根，返回其路径。 */
function userRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-manager-ops-'));
  return dir;
}

/** 写一个最小可用的宠物包。 */
function writePack(root: string, prefix: string, pets: unknown[], animationCount = 1): void {
  const petDir = join(root, 'pet');
  mkdirSync(petDir, { recursive: true });
  writeFileSync(join(petDir, prefix + '-config.json'), JSON.stringify({ pets }, null, 2), 'utf8');
  const animDir = join(petDir, prefix + '-animation');
  mkdirSync(animDir, { recursive: true });
  for (let i = 0; i < animationCount; i += 1) writeFileSync(join(animDir, `a${i}.webm`), '');
}

describe('stripJsonc —— 剥注释不误伤字符串', () => {
  test('行注释与块注释被去掉，URL 里的 // 保留', () => {
    const text = `{
      // 行注释
      "url": "http://example.com/x", /* 块注释 */
      "n": 1,
    }`;
    const parsed = parseJsonc(text) as { url: string; n: number };
    assert.equal(parsed.n, 1);
    assert.equal(parsed.url, 'http://example.com/x', '字符串里的 // 不能被当成注释');
  });

  test('尾逗号被容忍', () => {
    assert.deepEqual(parseJsonc('{"a":[1,2,],}'), { a: [1, 2] });
  });

  test('转义引号不会提前结束字符串', () => {
    const parsed = parseJsonc('{"s":"a\\"b//c"}') as { s: string };
    assert.equal(parsed.s, 'a"b//c');
  });

  test('注释剥除后与原文结构一致', () => {
    assert.equal(stripJsonc('{ "a": 1 }'), '{ "a": 1 }');
  });
});

describe('scanPetPacks —— 只读扫描', () => {
  test('目录不存在：返回空数组，不建目录', () => {
    const root = userRoot();
    try {
      assert.deepEqual(scanPetPacks(root), []);
      assert.equal(existsSync(join(root, 'pet')), false, '扫描不该产生目录');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('读出一只宠物包的前缀、宠物摘要与动画数', () => {
    const root = userRoot();
    try {
      writePack(root, 'clippy', [{ id: 'clippy', name: 'Clippy', size: 520, display: 'both' }], 3);
      const packs = scanPetPacks(root);
      assert.equal(packs.length, 1);
      const pack = packs[0];
      assert.equal(pack?.prefix, 'clippy');
      assert.equal(pack?.animationCount, 3);
      assert.equal(pack?.healthy, true);
      assert.equal(pack?.pets[0]?.name, 'Clippy');
      assert.equal(pack?.pets[0]?.display, 'both');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('配置损坏仍然列出并标 healthy=false（让用户能删掉坏包）', () => {
    const root = userRoot();
    try {
      const petDir = join(root, 'pet');
      mkdirSync(petDir, { recursive: true });
      writeFileSync(join(petDir, 'broken-config.json'), '{ 这不是 json', 'utf8');
      const packs = scanPetPacks(root);
      assert.equal(packs.length, 1);
      assert.equal(packs[0]?.healthy, false);
      assert.deepEqual(packs[0]?.pets, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('缺 name / size / display 的宠物用安全默认补齐', () => {
    const root = userRoot();
    try {
      writePack(root, 'sloppy', [{ id: 'x' }], 0);
      const pet = scanPetPacks(root)[0]?.pets[0];
      assert.equal(pet?.name, 'x', '缺 name 时回落到 id');
      assert.equal(pet?.size, 0);
      assert.equal(pet?.display, 'both');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('removePetPack —— 删除配置与素材', () => {
  test('删除后配置与动画目录都不在', () => {
    const root = userRoot();
    try {
      writePack(root, 'gone', [{ id: 'gone', name: 'G', size: 100, display: 'both' }], 2);
      const result = removePetPack(root, 'gone');
      assert.equal(result.ok, true);
      assert.equal(existsSync(join(root, 'pet', 'gone-config.json')), false);
      assert.equal(existsSync(join(root, 'pet', 'gone-animation')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('前缀带 .. 被拒绝，且不删除任何东西', () => {
    const root = userRoot();
    try {
      writePack(root, 'keep', [{ id: 'keep', name: 'K', size: 100, display: 'both' }]);
      const result = removePetPack(root, '../etc');
      assert.equal(result.ok, false);
      assert.equal(result.ok === false ? result.error.code : '', 'invalid-prefix');
      assert.equal(existsSync(join(root, 'pet', 'keep-config.json')), true, '越权请求不能误删别的包');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('不存在的包返回 not-found', () => {
    const root = userRoot();
    try {
      const result = removePetPack(root, 'nope');
      assert.equal(result.ok === false ? result.error.code : '', 'not-found');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('importPetPack —— 从目录导入', () => {
  test('导入后配置与素材都到位', () => {
    const root = userRoot();
    const source = userRoot();
    try {
      writePack(source, 'incoming', [{ id: 'incoming', name: 'In', size: 200, display: 'both' }], 2);
      const result = importPetPack(root, join(source, 'pet'));
      assert.equal(result.ok, true);
      assert.equal(existsSync(join(root, 'pet', 'incoming-config.json')), true);
      assert.equal(existsSync(join(root, 'pet', 'incoming-animation', 'a0.webm')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });

  test('同名包已存在时拒绝导入，不覆盖', () => {
    const root = userRoot();
    const source = userRoot();
    try {
      writePack(root, 'dup', [{ id: 'dup', name: '原', size: 100, display: 'both' }]);
      writePack(source, 'dup', [{ id: 'dup', name: '新', size: 999, display: 'both' }]);
      const result = importPetPack(root, join(source, 'pet'));
      assert.equal(result.ok === false ? result.error.code : '', 'already-exists');
      const kept = JSON.parse(readFileSync(join(root, 'pet', 'dup-config.json'), 'utf8')) as { pets: { name: string }[] };
      assert.equal(kept.pets[0]?.name, '原', '原包必须原样保留');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });

  test('源目录没有 *-config.json 时报 no-config', () => {
    const root = userRoot();
    const source = userRoot();
    try {
      const result = importPetPack(root, source);
      assert.equal(result.ok === false ? result.error.code : '', 'no-config');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });
});

describe('setPetEnabled —— 改 display', () => {
  test('停用写 none，启用写回 both', () => {
    const root = userRoot();
    try {
      writePack(root, 'p', [{ id: 'p', name: 'P', size: 100, display: 'both' }]);
      assert.equal(setPetEnabled(root, 'p', 'p', false).ok, true);
      const afterOff = JSON.parse(readFileSync(join(root, 'pet', 'p-config.json'), 'utf8')) as { pets: { display: string }[] };
      assert.equal(afterOff.pets[0]?.display, 'none');

      assert.equal(setPetEnabled(root, 'p', 'p', true).ok, true);
      const afterOn = JSON.parse(readFileSync(join(root, 'pet', 'p-config.json'), 'utf8')) as { pets: { display: string }[] };
      assert.equal(afterOn.pets[0]?.display, 'both');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('宠物 id 不在包里：pet-not-found，且文件不被改写', () => {
    const root = userRoot();
    try {
      writePack(root, 'p', [{ id: 'p', name: 'P', size: 100, display: 'both' }]);
      const before = readFileSync(join(root, 'pet', 'p-config.json'), 'utf8');
      const result = setPetEnabled(root, 'p', 'other', false);
      assert.equal(result.ok === false ? result.error.code : '', 'pet-not-found');
      assert.equal(readFileSync(join(root, 'pet', 'p-config.json'), 'utf8'), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('配置解析失败：config-unreadable，不静默', () => {
    const root = userRoot();
    try {
      const petDir = join(root, 'pet');
      mkdirSync(petDir, { recursive: true });
      writeFileSync(join(petDir, 'bad-config.json'), '{ 坏', 'utf8');
      const result = setPetEnabled(root, 'bad', 'x', false);
      assert.equal(result.ok === false ? result.error.code : '', 'config-unreadable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
