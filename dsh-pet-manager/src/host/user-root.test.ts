/**
 * 用户数据根与一次性迁移的单元测试 —— 钉住 fork 后的目录语义：
 * 新装用户只写新目录；老用户首次启动时旧目录整体搬过来，搬不动就退回旧目录继续用。
 *
 * 这里不碰真实 DSH 主目录：每个用例自建临时目录，结束后删干净。
 * 跑法：node --experimental-strip-types --test src/host/user-root.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { LEGACY_USER_ROOT_NAME, USER_ROOT_NAME, resolveUserRoot, userRootPath } from './user-root.ts';

/** 每个用例自建一个假 DSH 主目录。 */
function home(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-pet-manager-user-root-'));
}

describe('userRootPath —— 只算路径', () => {
  test('拼的是新目录名，且不读盘也不建目录', () => {
    const dir = home();
    try {
      const value = userRootPath(dir);
      assert.equal(value, join(dir, 'dsh-pet-manager'));
      assert.equal(existsSync(value), false, '只算路径不该产生目录');
      assert.equal(USER_ROOT_NAME, 'dsh-pet-manager');
      assert.equal(LEGACY_USER_ROOT_NAME, 'dsh-pet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveUserRoot —— 迁移与回退', () => {
  test('新旧目录都不存在：返回新目录，不创建', () => {
    const dir = home();
    try {
      const value = resolveUserRoot(dir);
      assert.equal(value, join(dir, 'dsh-pet-manager'));
      assert.equal(existsSync(value), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('只有旧目录：整体重命名到新目录，内容原样搬过去', () => {
    const dir = home();
    try {
      const previous = join(dir, 'dsh-pet');
      mkdirSync(previous, { recursive: true });
      writeFileSync(join(previous, 'main-config.jsonc'), '{"pets":[]}');

      const notes: string[] = [];
      const value = resolveUserRoot(dir, (msg) => notes.push(msg));

      assert.equal(value, join(dir, 'dsh-pet-manager'));
      assert.equal(existsSync(previous), false, '旧目录应当已搬走');
      assert.equal(existsSync(join(value, 'main-config.jsonc')), true, '用户配置必须跟着搬过去，否则等于丢数据');
      assert.equal(notes.length, 1, '迁移成功要留一条日志');
      assert.match(notes[0], /已迁移/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('新旧目录同时存在：用新目录，且不删除、不合并旧目录', () => {
    const dir = home();
    try {
      const previous = join(dir, 'dsh-pet');
      const next = join(dir, 'dsh-pet-manager');
      mkdirSync(previous, { recursive: true });
      mkdirSync(next, { recursive: true });
      writeFileSync(join(previous, 'old.txt'), 'old');
      writeFileSync(join(next, 'new.txt'), 'new');

      const value = resolveUserRoot(dir);

      assert.equal(value, next);
      assert.equal(existsSync(join(previous, 'old.txt')), true, '旧目录要留着，交给用户自己决定');
      assert.equal(existsSync(join(next, 'old.txt')), false, '不得把旧数据混进新目录');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('新路径被占位成非目录：退回旧目录继续读写，且记一条日志', () => {
    const dir = home();
    try {
      const previous = join(dir, 'dsh-pet');
      mkdirSync(previous, { recursive: true });
      writeFileSync(join(previous, 'main-config.jsonc'), '{"pets":[]}');
      writeFileSync(join(dir, 'dsh-pet-manager'), 'not a directory');

      const notes: string[] = [];
      const value = resolveUserRoot(dir, (msg) => notes.push(msg));

      assert.equal(value, previous, '新路径不可用时不能让用户启动失败');
      assert.equal(existsSync(join(previous, 'main-config.jsonc')), true, '旧数据必须还在');
      assert.equal(notes.length, 1, '回退要留一条日志');
      assert.match(notes[0], /不是目录/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
