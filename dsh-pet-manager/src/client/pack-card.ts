/**
 * 设置页「桌宠管理」卡片：列出已装宠物包，支持启用/停用、删除、导入。
 *
 * 只管界面与本地状态：数据来自管理器自己的 HTTP 路由，动作结果如实回显。
 * 必须始终成立：任何一只宠物操作失败都不能清空整张列表——用户要能看到失败后仍有什么。
 * 注意 `h` 来自 react/jsx-runtime，第三个参数是 key 而非 children，子节点一律走 props.children。
 * @module dsh-pet-manager/src/client/pack-card
 */
import type * as ReactNS from 'react';

import { importPack, listPacks, removePack, togglePet } from './api.ts';
import type { PetPack } from '../shared/types.ts';

/** 注入的 react 能力（只取用到的子集，测试替身不必实现全部）。 */
export interface CardRuntime {
  h: (type: unknown, props?: Record<string, unknown> | null, key?: string) => ReactNS.ReactElement;
  useState: <T>(init: T) => [T, ReactNS.Dispatch<React.SetStateAction<T>>];
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
}

/** 一条回显：成功或失败。 */
interface Feedback {
  kind: 'ok' | 'err' | '';
  text: string;
}

/**
 * 造卡片组件。
 *
 * @param rt - 注入的 react 能力。
 * @returns 设置页里渲染的组件。
 */
export function makePackCard(rt: CardRuntime) {
  const { h, useState, useEffect } = rt;

  return function PackCard(): ReactNS.ReactElement {
    const [packs, setPacks] = useState<PetPack[] | null>(null);
    const [msg, setMsg] = useState<Feedback>({ kind: '', text: '' });
    const [busy, setBusy] = useState(false);
    const [sourceDir, setSourceDir] = useState('');

    const refresh = async (): Promise<void> => {
      const result = await listPacks();
      if (result.ok && result.value !== undefined) {
        setPacks(result.value);
        return;
      }
      setMsg({ kind: 'err', text: '读取宠物包失败：' + (result.message ?? '未知原因') });
      setPacks([]);
    };

    useEffect(() => {
      void refresh();
    }, []);

    /** 统一跑一个会改盘的动作：置忙、执行、回显、刷新列表。 */
    const run = async (label: string, action: () => Promise<{ ok: boolean; message?: string; value?: unknown }>): Promise<void> => {
      setBusy(true);
      setMsg({ kind: '', text: '' });
      try {
        const result = await action();
        if (result.ok) {
          const reload = (result.value as { reload?: { ok: boolean; message: string } } | undefined)?.reload;
          const note = reload !== undefined && !reload.ok ? `（${reload.message}）` : '';
          setMsg({ kind: 'ok', text: `${label}完成${note}` });
        } else {
          setMsg({ kind: 'err', text: `${label}失败：${result.message ?? '未知原因'}` });
        }
      } finally {
        setBusy(false);
        await refresh();
      }
    };

    const onToggle = (pack: PetPack, petId: string, next: boolean): void => {
      void run(next ? '启用' : '停用', () => togglePet(pack.prefix, petId, next));
    };

    const onRemove = (pack: PetPack): void => {
      void run(`删除「${pack.prefix}」`, () => removePack(pack.prefix));
    };

    const onImport = (): void => {
      const dir = sourceDir.trim();
      if (dir === '') {
        setMsg({ kind: 'err', text: '请先填宠物包所在目录' });
        return;
      }
      void run('导入', () => importPack(dir));
    };

    if (packs === null) {
      return h('div', { className: 'dpm-card', children: h('div', { className: 'dpm-note', children: '正在读取宠物包…' }) });
    }

    const packRows = packs.map((pack) => {
      const petRows = pack.pets.map((pet) => {
        const enabled = pet.display !== 'none';
        return h('div', {
          className: 'dpm-pet',
          key: pet.id,
          children: [
            h('span', { className: 'dpm-pet-name', children: `${pet.name}（${pet.id}）` }),
            h('button', {
              className: enabled ? 'dpm-btn' : 'dpm-btn dpm-btn--off',
              key: 'toggle',
              disabled: busy,
              type: 'button',
              onClick: () => onToggle(pack, pet.id, !enabled),
              children: enabled ? '已启用 · 点击停用' : '已停用 · 点击启用',
            }),
          ],
        });
      });

      return h('div', {
        className: 'dpm-pack',
        key: pack.prefix,
        children: [
          h('div', {
            className: 'dpm-pack-head',
            key: 'head',
            children: [
              h('span', { className: 'dpm-pack-name', key: 'n', children: pack.prefix }),
              h('span', { className: 'dpm-pack-meta', key: 'm', children: `${pack.animationCount} 段动画` }),
              pack.healthy ? null : h('span', { className: 'dpm-bad', key: 'b', children: '配置损坏' }),
              h('button', {
                className: 'dpm-btn dpm-btn--danger',
                key: 'del',
                disabled: busy,
                type: 'button',
                onClick: () => onRemove(pack),
                children: '删除',
              }),
            ],
          }),
          ...petRows,
        ],
      });
    });

    return h('div', {
      className: 'dpm-card',
      children: [
        h('div', {
          className: 'dpm-head',
          key: 'head',
          children: [
            h('span', { className: 'dpm-title', key: 't', children: '桌宠管理' }),
            h('span', { className: 'dpm-count', key: 'c', children: `${packs.length} 个宠物包` }),
          ],
        }),
        msg.text !== ''
          ? h('div', {
              className: msg.kind === 'err' ? 'dpm-msg dpm-msg--err' : 'dpm-msg dpm-msg--ok',
              key: 'msg',
              children: msg.text,
            })
          : null,
        packs.length === 0
          ? h('div', {
              className: 'dpm-note',
              key: 'empty',
              children: '还没有安装任何宠物包。用下面的「导入」填一个含 *-config.json 的目录。',
            })
          : h('div', { className: 'dpm-list', key: 'list', children: packRows }),
        h('div', {
          className: 'dpm-import',
          key: 'import',
          children: [
            h('input', {
              className: 'dpm-input',
              key: 'in',
              placeholder: '宠物包所在目录，例如 D:\\pets\\my-pack',
              value: sourceDir,
              disabled: busy,
              onChange: (event: { target: { value: string } }) => setSourceDir(event.target.value),
            }),
            h('button', {
              className: 'dpm-btn',
              key: 'go',
              disabled: busy,
              type: 'button',
              onClick: onImport,
              children: busy ? '处理中…' : '导入',
            }),
          ],
        }),
      ],
    });
  };
}
