// Existing lightweight node:test convention, made available through npm test.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
const load = Module.createRequire(import.meta.url);
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test";
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...rest) {
  return resolve.call(this, id.startsWith("@/") ? path.resolve(id.slice(2)) : id, ...rest);
};
for (const extension of [".ts", ".tsx"]) {
  load.extensions[extension] = (module, filename) => module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
        esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, filename,
  );
}
for (const directory of ["lib", "lib/portfolio"]) {
  for (const file of fs.readdirSync(directory)) {
    if (file.endsWith(".test.ts")) load(path.resolve(directory, file));
  }
}
