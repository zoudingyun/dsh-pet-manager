/**
 * 管理器与浏览器半侧的数据契约：宠物包、宠物摘要、操作结果。
 *
 * 只有类型与判别联合，没有逻辑；宿主与客户端各自 import 同一份，避免两边各写一个形状。
 * @module dsh-pet-manager/src/shared/types
 */

/** 一只宠物的展示摘要（从宠物包配置里抽出的最小集，够面板列表用）。 */
export interface PetSummary {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  /** `web` / `desktop` / `both` / `none`，原样透传运行时语义。 */
  readonly display: string;
}

/** 一个已安装的宠物包（= `pet/` 下一个 `<前缀>-config.json` 及其动画目录）。 */
export interface PetPack {
  /** 前缀 = 素材根 = 文件名去掉 `-config.json`。 */
  readonly prefix: string;
  readonly configPath: string;
  readonly animationDir: string;
  /** 动画文件数（.webm/.mov）；0 说明素材目录缺失或者是空的。 */
  readonly animationCount: number;
  readonly pets: readonly PetSummary[];
  /** 配置能被解析 = true；解析失败仍列出，让用户能删掉坏包。 */
  readonly healthy: boolean;
}

/** 一次操作的结果：成功带数据，失败带稳定 code 与人话 message。 */
export type ManagerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
