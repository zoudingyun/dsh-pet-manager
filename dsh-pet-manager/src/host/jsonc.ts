/**
 * 最小 JSONC 解析：只剥注释与尾逗号，其余交给 JSON.parse。
 *
 * 运行时的宠物包配置走它自己的 readJsonc，允许 `//` 与块注释；
 * 管理器要改写同一批文件，必须用同样宽容的读法，否则用户带注释的配置会被判成坏包。
 * 必须始终成立：剥注释不能误伤字符串里的 `//`（例如 URL），所以扫一遍字符逐个判断。
 * @module dsh-pet-manager/src/host/jsonc
 */

/**
 * 去掉 JSONC 里的注释与尾逗号。
 *
 * @param text - 原始文本。
 * @returns 可以被 JSON.parse 接受的文本。
 */
export function stripJsonc(text: string): string {
  let out = '';
  let index = 0;
  const length = text.length;
  let inString = false;
  let quote = '';

  while (index < length) {
    const ch = text[index];
    const next = text[index + 1];

    if (inString) {
      out += ch;
      if (ch === '\\') {
        // 转义序列整体搬运，避免把 \" 当成结束引号
        if (index + 1 < length) {
          out += text[index + 1];
          index += 2;
          continue;
        }
      } else if (ch === quote) {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      index += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (index < length && text[index] !== '\n') index += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      index += 2;
      while (index < length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }

    out += ch;
    index += 1;
  }

  // 尾逗号：`, }` / `, ]`（注释剥掉后才会显形）
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 解析 JSONC 文本。
 *
 * @param text - 原始文本。
 * @returns 解析结果；失败抛错，由调用方决定如何降级。
 */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}
