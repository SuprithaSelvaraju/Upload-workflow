/**
 * Minimal typing for occt-import-js, based on its README:
 * `occtimportjs()` resolves to a module exposing ReadStepFile / ReadIgesFile /
 * ReadBrepFile(content: Uint8Array, params | null).
 *
 * The `locateFile` option is the standard Emscripten module override; the README
 * does not mention it (it loads the .wasm next to the .js by default), but a
 * bundler moves the .js, so we must tell it where the .wasm is.
 */
declare module 'occt-import-js' {
  type Params = import('./occtTypes').OcctParams;
  type Result = import('./occtTypes').OcctImportResult;

  export interface OcctModule {
    ReadStepFile(content: Uint8Array, params: Params | null): Result;
    ReadIgesFile(content: Uint8Array, params: Params | null): Result;
    ReadBrepFile(content: Uint8Array, params: Params | null): Result;
  }

  export interface OcctFactoryOptions {
    locateFile?: (path: string, scriptDirectory: string) => string;
  }

  const occtimportjs: (options?: OcctFactoryOptions) => Promise<OcctModule>;
  export default occtimportjs;
}
