/**
 * 浏览器半侧装配：注入 react，注册设置页里的「桌宠管理」区块。
 *
 * 只在设置页放一个卡片；不注册 overlay、不建任何浮动窗口——那些属于运行时插件。
 * 必须始终成立：任何可选能力（slots/locale）缺失都只降级，绝不让整个插件加载失败。
 * @module dsh-pet-manager/src/client/app
 */
import { makePackCard } from './pack-card.ts';
import { injectStyles } from './styles.ts';
import type * as ReactNS from 'react';

/** 创建 DSH 插件 factory，返回带 name / inject / apply 的模块。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH __ModuleLoader__ 契约（f(require) => module），外部无静态类型
export function makeFactory(): (require: (mod: string) => any) => any {
  return (require) => {
    const module = { exports: {} };

    const react: typeof ReactNS = require('react');
    const { useEffect, useState } = react;
    const { jsx: h } = require('react/jsx-runtime');

    const PackCard = makePackCard({ h, useState, useEffect });

    const name = 'pet-manager';
    const inject = ['slots'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH 注入的 ctx（slots 等 service 无静态类型）
    function apply(ctx: any) {
      ctx.effect(
        () => {
          injectStyles();
          return () => {};
        },
        'dsh-pet-manager: styles',
      );

      ctx.slots.inject('settings.section', function* () {
        yield ctx.slots.register(
          {
            name: 'settings.section',
            id: 'pet-manager',
            order: 40,
            label: () => '桌宠管理',
          },
          PackCard,
        );
      });
    }

    module.exports = { apply, inject, name };
    return module.exports;
  };
}
