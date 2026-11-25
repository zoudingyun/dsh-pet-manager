/**
 * 卡片样式：一次注入一段 <style>，用 data-plugin-css 标记去重。
 *
 * 只负责外观，不含逻辑；类名统一 `dpm-` 前缀，避免与运行时（`dsh-pet-`）冲突。
 * 必须始终成立：重复注入不能产生第二个 style 标签（DSH 会按 rev 重复执行 bundle）。
 * @module dsh-pet-manager/src/client/styles
 */

/** 去重标记：查询与写入用同一个值。 */
const STYLE_TAG = 'dsh-pet-manager/pack-card';

/** 卡片样式表。 */
const CSS = `
.dpm-card{display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.6}
.dpm-head{display:flex;align-items:baseline;gap:8px}
.dpm-title{font-weight:600;font-size:14px}
.dpm-count{opacity:.6;font-size:12px}
.dpm-note{opacity:.7;font-size:12px}
.dpm-list{display:flex;flex-direction:column;gap:10px}
.dpm-pack{border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.dpm-pack-head{display:flex;align-items:center;gap:8px}
.dpm-pack-name{font-weight:600}
.dpm-pack-meta{opacity:.6;font-size:12px}
.dpm-bad{color:#c0392b;font-size:12px}
.dpm-pet{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-left:4px}
.dpm-pet-name{opacity:.85}
.dpm-btn{border:1px solid rgba(128,128,128,.35);border-radius:6px;background:transparent;color:inherit;padding:3px 10px;font-size:12px;cursor:pointer}
.dpm-btn:hover:not(:disabled){background:rgba(128,128,128,.12)}
.dpm-btn:disabled{opacity:.5;cursor:default}
.dpm-btn--off{opacity:.75}
.dpm-btn--danger{color:#c0392b;border-color:rgba(192,57,43,.4)}
.dpm-import{display:flex;gap:8px;align-items:center}
.dpm-input{flex:1;border:1px solid rgba(128,128,128,.35);border-radius:6px;background:transparent;color:inherit;padding:5px 8px;font-size:12px}
.dpm-msg{font-size:12px;padding:6px 8px;border-radius:6px}
.dpm-msg--ok{background:rgba(46,160,67,.12);color:#2ea043}
.dpm-msg--err{background:rgba(192,57,43,.12);color:#c0392b}
`;

/**
 * 注入样式表（幂等）。
 *
 * @returns 无。
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="' + STYLE_TAG + '"]') !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-pet-manager';
  tag.dataset.pluginCss = STYLE_TAG;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
