/* tslint:disable */
/* eslint-disable */

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly start: () => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___f64______true_: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___wasm_bindgen_539bd16479e235d9___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_539bd16479e235d9___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___web_sys_4bc166d8ff3b62e2___features__gen_TouchEvent__TouchEvent______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___web_sys_4bc166d8ff3b62e2___features__gen_TouchEvent__TouchEvent______true__4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___web_sys_4bc166d8ff3b62e2___features__gen_TouchEvent__TouchEvent______true__5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___web_sys_4bc166d8ff3b62e2___features__gen_TouchEvent__TouchEvent______true__6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke___web_sys_4bc166d8ff3b62e2___features__gen_TouchEvent__TouchEvent______true__7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_539bd16479e235d9___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
