import { analyzeMetafile, build, stop, version } from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import {
  asOptional,
  assert,
  ensure,
  isArrayOf,
  isBoolean,
  isLiteralOf,
  isLiteralOneOf,
  isObjectOf,
  isRecordObjectOf,
  isString,
  isUndefined,
  isUnionOf,
  type PredicateType,
} from "@core/unknownutil";
import {
  BooleanType,
  Command,
  EnumType,
  StringType,
  type Type,
  type TypeOrTypeHandler,
  ValidationError,
} from "@cliffy/command";
import { parse } from "@std/jsonc";
import { resolve } from "@std/path";
import { italic } from "jsr:@std/fmt@~0.225.4/colors";
import myDenoConfig from "./deno.json" with { type: "json" };
import { exists } from "@std/fs";

const recordType = <V>(
  keyHander: Type<string>,
  valueHandler: Type<V>,
): TypeOrTypeHandler<Record<string, V>> =>
({ label, name, value, type }) => {
  let rest = value.trim();
  if (!rest) return {};
  const record: Record<string, V> = {};
  while (rest) {
    const i = rest.indexOf("=");
    if (i < 0) {
      throw new ValidationError(
        `${name} must be in the form of "K=V", but got "${rest}".`,
      );
    }
    const key = keyHander.parse({
      label,
      name: `key of ${name}`,
      type,
      value: rest.slice(0, i).trim(),
    });
    if (!key) {
      throw new ValidationError(
        `No key in ${label} "${name}" can be empty.`,
      );
    }
    if (record[key]) {
      throw new ValidationError(
        `key "${key}" is already defined in ${label} "${name}".`,
      );
    }
    rest = rest.slice(i + 1).trim();
    const j = rest.indexOf(",");
    const val = valueHandler.parse({
      label,
      name: `value of ${key} in ${name}`,
      type,
      value: j < 0 ? rest : rest.slice(0, j),
    });
    if (!val) {
      throw new ValidationError(
        `The value of ${key} in ${label} "${name}" cannot be empty`,
      );
    }
    record[key] = val;
    rest = j < 0 ? "" : rest.slice(j + 1).trim();
  }
  return record;
};
const isTsconfig = isObjectOf({
  compilerOptions: asOptional(isObjectOf({
    alwaysStrict: asOptional(isBoolean),
    baseUrl: asOptional(isString),
    experimentalDecorators: asOptional(isBoolean),
    importsNotUsedAsValues: asOptional(
      isLiteralOneOf(["remove", "preserve", "error"] as const),
    ),
    jsx: asOptional(
      isLiteralOneOf(
        [
          "preserve",
          "react-native",
          "react",
          "react-jsx",
          "react-jsxdev",
        ] as const,
      ),
    ),
    jsxFactory: asOptional(isString),
    jsxFragmentFactory: asOptional(isString),
    paths: asOptional(isRecordObjectOf(isArrayOf(isString))),
    preserveValueImports: asOptional(isBoolean),
    strict: asOptional(isBoolean),
    target: asOptional(isString),
    useDefineForClassFields: asOptional(isBoolean),
    verbatimModuleSyntax: asOptional(isBoolean),
  })),
});
const tsconfigType: TypeOrTypeHandler<PredicateType<typeof isTsconfig>> = (
  value,
) => {
  try {
    const json = parse(value.value);
    assert(json, isTsconfig);
    return json;
  } catch (e: unknown) {
    if (e instanceof Error) {
      throw new ValidationError(e.message);
    }
    throw e;
  }
};

const { packages } = await (await fetch(import.meta.resolve("./deno.lock")))
  .json();
const esbuildDenoLoaderVersion = packages
  .specifiers[myDenoConfig.imports["@luca/esbuild-deno-loader"]].split("@")
  .pop();

// Start CLI definition
// The explanation and examples of the command line options below are almost copied from the [esbuild CLI output](https://github.com/evanw/esbuild/blob/main/cmd/esbuild/main.go).
// Copyright (c) 2020 Evan Wallace, all rights reserved. MIT License. see https://github.com/evanw/esbuild/blob/main/LICENSE.md
// In addition, the options are grouped based on https://esbuild.github.io/api.
// The examples contain commands that do not work with this CLI. To be fixed later.
// Since it has not been tested at all, some commands may not work.
// Watch mode and serve mode are not implemented.

const start = new Command()
  .name("esbuild-deno-cli")
  .description(
    "Build JS/TS/JSX/TSX codes following Deno-style imports by esbuild",
  )
  .version(myDenoConfig.version)
  .meta("esbuild", version)
  .meta("esbuild-deno-loader", esbuildDenoLoaderVersion)
  .example(
    "Produces dist/entry_point.js and dist/entry_point.js.map",
    "esbuild --bundle entry_point.js --outdir=dist --minify --sourcemap",
  )
  .example(
    "Allow JSX syntax in .js files",
    "esbuild --bundle entry_point.js --outfile=out.js --loader=.js=jsx",
  )
  .example(
    "Substitute the identifier RELEASE for the literal true",
    "esbuild example.js --outfile=out.js --define=RELEASE=true",
  )
  .example(
    "Provide input via stdin, get output via stdout",
    "esbuild --minify --loader=ts < input.ts > output.js",
  )
  .example(
    "Automatically rebuild when input files are changed",
    "esbuild app.ts --bundle --watch",
  )
  .example(
    "Start a local HTTP server for everything in 'www'",
    "esbuild app.ts --bundle --servedir=www --outdir=www/js",
  )
  .arguments("[entry-points...:file]");

const generalOptions = start
  .group("General options")
  .option("--bundle", "Bundle all dependencies into the output files")
  .option(
    "--minify",
    `Minify the output (sets all ${italic("--minify-*")} flags)`,
  )
  .type("platform-type", new EnumType(["browser", "node", "neutral"]))
  .option("--platform=<platform:platform-type>", "Platform target", {
    default: "browser",
  })
  .option(
    "--serve",
    "Start a local HTTP server on this host:port for outputs",
  )
  .option(
    "--tsconfig=<file>",
    "Use this tsconfig.json file instead of other ones",
    { conflicts: ["tsconfig-raw"] },
  )
  .type("Tsconfig", tsconfigType)
  .option(
    "--tsconfig-raw=<tsconfigRaw:Tsconfig>",
    "Override all tsconfig.json files with this string",
    { conflicts: ["tsconfig"] },
  )
  .option(
    "--watch",
    "Watch mode: rebuild on file system changes (stops when stdin is closed)",
  );

const denoOptions = generalOptions
  .group("Deno options")
  .option(
    "--config=<config:file>",
    "Path to the Deno configuration file. If it is not specified, the default configuration file in the current directory is used.",
  )
  .option("--no-config", "Do not use any Deno configuration file.")
  .option("--import-map=<importMap:file>", "Path to the import map file.")
  .option(
    "--lock=<lock:file>",
    "Path to the lock file. If it is not specified but the Deno configuration file is used, Find the lock file in the same directory as the Deno configuration file.",
  )
.type("node-module-strategy", new EnumType(["none", "manual", "auto"]))
  .option(
    "--node-modules-dir=<nodeModulesDir:node-module-strategy>",
    `Equivalent to the "${italic("--node-modules-dir")}" flag to Deno`,
{ default: "none" },
  );

const input = denoOptions
  .group("Input")
  .type(
    "LoaderRecord",
    recordType(
      new StringType(),
      new EnumType([
        "base64",
        "binary",
        "copy",
        "css",
        "dataurl",
        "empty",
        "file",
        "js",
        "json",
        "jsx",
        "local-css",
        "text",
        "ts",
        "tsx",
      ]),
    ),
  )
  .option(
    "--loader=<loader:LoaderRecord>",
    "Use loader V to load file extension K, where V is one of: base64 | binary | copy | css | dataurl | empty | file | global-css | js | json | jsx | local-css | text | ts | tsx (These record represents comma-separated list of 'K=V' pairs).",
  )
  .group("Output contents")
  .type("Appender", recordType(new EnumType(["css", "js"]), new StringType()))
  .option(
    "--banner=<banner:Appender>",
    "Text V to be prepended to each output file of type K where K is one of: css | js (These record represents comma-separated list of 'K=V' pairs).",
  )
  .type("Charset", new EnumType(["utf8", "ascii"]))
  .option("--charset=<charset:Charset>", "Do not escape UTF-8 code points", {
    default: "ascii",
  })
  .option(
    "--footer=<string:Appender>",
    "Text V to be appended to each output file of type K where K is one of: css | js (These record represents comma-separated list of 'K=V' pairs).",
  )
  .type("Format", new EnumType(["iife", "cjs", "esm"]))
  .option(
    "--format=<format:Format>",
    "Output format (no default when not bundling, otherwise default is iife when platform is browser and cjs when platform is node)",
  )
  .option(
    "--global-name=<string>",
    "The name of the global for the IIFE format",
  )
  .type(
    "LegalComment",
    new EnumType(["none", "inline", "eof", "linked", "external"]),
  )
  .option(
    "--legal-comments=<lecalComments:LegalComment>",
    "Where to place legal comments (default eof when bundling and inline otherwise)",
  )
  .option(
    "--line-limit=<lineLimit:integer>",
    "Lines longer than this will be wrap onto a new line",
  )
  .option(
    "--splitting",
    `Enable code splitting (currently only for ${italic("--format")}=esm)`,
    { depends: ["format"] },
  );

const outputLocation = input
  .group("Output location")
  .option("--allow-overwrite", "Allow output files to overwrite input files")
  .option(
    "--asset-names=<string>",
    "Path template to use for 'file' loader files",
    { default: "[name]-[hash]" },
  )
  .option(
    "--chunk-names=<string>",
    "Path template to use for code splitting chunks",
    { default: "[name]-[hash]" },
  )
  .option(
    "--entry-names=<string>",
    "Path template to use for entry point output paths (default '[dir]/[name]', can also use '[hash]')",
  )
  .type("ExtensionRecord", recordType(new StringType(), new StringType()))
  .option(
    "--out-extension=<outExtension:ExtensionRecord>",
    "Use a custom output extension V instead of K (These record represents comma-separated list of 'K=V' pairs).",
  )
  .option(
    "--outbase=<file>",
    "The base path used to determine entry point output paths (for multiple entry points)",
  )
  .option(
    "--outdir=<file>",
    "The output directory (for multiple entry points)",
  )
  .option(
    "--outfile=<file>",
    "The output file (for one entry point)",
    (value) => value,
  )
  .option("--public-path=<file>", "Set the base URL for the 'file' loader");

const pathResolution = outputLocation
  .group("Path resolution")
  .type("Record", recordType(new StringType(), new StringType()))
  .option(
    "--alias=<alias:Record>",
    "Substitute the packageK with the package V while parsing (These record represents comma-separated list of 'K=V' pairs).",
  )
  .option(
    "--conditions=<conditions:string[]>",
    "custom conditions, which control how the exports field in package.json is interpreted.",
  )
  .option(
    "--external=<external:string[]>",
    "Modules excluded from the bundle (can use * wildcards)",
  )
  .option(
    "--main-fields=<mainFields:string[]>",
    `Override the main file order in package.json (default "browser,module,main" when "${
      italic("--platform")
    }=browser" and "main,module" when "${italic("--platform")}=node")`,
  )
  .option(
    "--node-paths=<nodePaths:file[]>",
    "equivalent to setting NODE_PATH environment variable",
  )
  .type("package-type", new EnumType(["bundle", "external"]))
  .option(
    "--packages=<packages:package-type>",
    `Set to "external" to avoid bundling any package`,
  )
  .option(
    "--preserve-symlinks",
    "Disable symlink resolution for module lookup",
  )
  .option(
    "--resolve-extensions=<resolveExtensions:string[]>",
    "list of implicit extensions",
    { default: [".tsx", ".ts", ".jsx", ".js", ".css", ".json"] as string[] },
  );

const transformation = pathResolution
  .group("Transformation")
  .type("Jsx", new EnumType(["transform", "preserve", "automatic"]))
  .option(
    "--jsx=<jsx:Jsx>",
    'Set to "automatic" to use React\'s automatic runtime or to "preserve" to disable transforming JSX to JS',
    { default: "transform" },
  )
  .option("--jsx-dev", "Use React's automatic runtime in development mode")
  .option(
    "--jsx-factory=<string>",
    "What to use for JSX",
    { default: "React.createElement" },
  )
  .option(
    "--jsx-fragment=<string>",
    "What to use for JSX Fragment",
    { default: "React.Fragment" },
  )
  .option(
    "--jsx-import-source=<string>",
    "Override the package name for the automatic runtime",
    { default: "react" },
  )
  .option("--jsx-side-effects", "Do not remove unused JSX expressions")
  .type("Flags", recordType(new StringType(), new BooleanType()))
  .option(
    "--supported=<supported:Flags>",
    "Consider syntax K to be supported (V = true or false, These record represents comma-separated list of 'K=V' pairs).",
  )
  .option(
    "--target=<target:string[]>",
    "Environment target (e.g. es2017, chrome58, firefox57, safari11, edge16, node10, ie9, opera45)",
    { default: ["esnext"] as string[] },
  );

const optimization = transformation
  .group("Optimization")
  .option(
    "--define=<define:Record>",
    "Substitute K with V while parsing (These record represents comma-separated list of 'K=V' pairs).",
  )
  .type("Drop", new EnumType(["console", "debugger"]))
  .option("--drop=<drop:Drop[]>", "Remove certain constructs")
  .option(
    "--drop-labels=<dropLabels:string[]>",
    "Remove labeled statements with these label names",
  )
  .option(
    "--ignore-annotations",
    "Enable this to work with packages that have incorrect tree-shaking annotations",
  )
  .option(
    "--inject=<inject:file[]>",
    "Import files into all input files and automatically replace matching globals with imports",
  )
  .option("--keep-names", "Preserve 'name' on functions and classes")
  .option(
    "--mangle-cache=<file>",
    `Save "${italic("--mangle-props")}" decisions to a JSON file`,
  )
  .option(
    "--mangle-props=<string>",
    "Rename all properties matching a regular expression",
    (value) => new RegExp(value),
  )
  .option(
    "--mangle-quoted",
    "Enable renaming of quoted properties",
    { depends: ["mangle-props"] },
  )
  .option("--minify-whitespace", "Remove whitespace in output files")
  .option("--minify-identifiers", "Shorten identifiers in output files")
  .option(
    "--minify-syntax",
    "Use equivalent but shorter syntax in output files",
  )
  .option(
    "--pure=<pure:string[]>",
    "Mark the names as a pure function for tree shaking",
  )
  .option(
    "--reserve-props=<string>",
    "Do not mangle these properties",
    { depends: ["mangle-props"], value: (value) => new RegExp(value) },
  )
  .option(
    "--tree-shaking=<treeShaking:boolean>",
    "Force tree shaking on or off",
  );

const sourceMaps = optimization
  .group("Source maps")
  .option(
    "--source-root=<string>",
    "Sets the 'sourceRoot' field in generated source maps",
    { depends: ["sourcemap"] },
  )
  .option(
    "--sourcefile=<file>",
    "Set the source file for the source map (for stdin)",
    { depends: ["sourcemap"] },
  )
  .type(
    "sourcemap-type",
    new EnumType(["linked", "external", "inline", "both"]),
  )
  .option(
    "--sourcemap=[sourcemap:sourcemap-type]",
    "Emit a source map",
    (value) => value === true ? "linked" : value,
  )
  .option(
    "--sources-content=<sourcesContent:boolean>",
    "Turn 'false' to omit 'sourcesContent' in generated source maps",
    { depends: ["sourcemap"] },
  );

const buildMetadata = sourceMaps
  .group("Build metadata")
  .type("analyze-type", new EnumType(["verbose"]))
  .option(
    "--analyze=[analyze:analyze-type]",
    `Print a report about the contents of the bundle (use "${
      italic("--analyze")
    }=verbose" for a detailed report)`,
  )
  .option(
    "--metafile=<file>",
    "Write metadata about the build to a JSON file (see also: https://esbuild.github.io/analyze/)",
  );

const logLevelType = new EnumType([
  "verbose",
  "debug",
  "info",
  "warning",
  "error",
  "silent",
]);

const logging = buildMetadata
  .group("Logging")
  .option(
    "--color=<color:boolean>",
    "Force use of color terminal escapes",
  )
  .type("LogLevel", logLevelType)
  .option(
    "--log-level=<logLevel:LogLevel>",
    "Disable logging",
    { default: "info" },
  )
  .option(
    "--log-limit=<logLimit:integer>",
    "Maximum message count or 0 to disable",
    { default: 10 },
  )
  .type(
    "LogSetting",
    recordType(
      new EnumType([
        "assert-to-with",
        "assert-type-json",
        "assign-to-constant",
        "assign-to-define",
        "assign-to-import",
        "call-import-namespace",
        "class-name-will-throw",
        "commonjs-variable-in-esm",
        "delete-super-property",
        "direct-eval",
        "duplicate-case",
        "duplicate-class-member",
        "duplicate-object-key",
        "empty-import-meta",
        "equals-nan",
        "equals-negative-zero",
        "equals-new-object",
        "html-comment-in-js",
        "impossible-typeof",
        "indirect-require",
        "private-name-will-throw",
        "semicolon-after-return",
        "suspicious-boolean-not",
        "suspicious-define",
        "suspicious-logical-operator",
        "suspicious-nullish-coalescing",
        "this-is-undefined-in-esm",
        "unsupported-dynamic-import",
        "unsupported-jsx-comment",
        "unsupported-regexp",
        "unsupported-require-call",
        "css-syntax-error",
        "invalid-@charset",
        "invalid-@import",
        "invalid-@layer",
        "invalid-calc",
        "js-comment-in-css",
        "undefined-composes-from",
        "unsupported-@charset",
        "unsupported-@namespace",
        "unsupported-css-property",
        "unsupported-css-nesting",
        "ambiguous-reexport",
        "different-path-case",
        "empty-glob",
        "ignored-bare-import",
        "ignored-dynamic-import",
        "import-is-undefined",
        "require-resolve-not-external",
        "invalid-source-mappings",
        "sections-in-source-map",
        "missing-source-map",
        "unsupported-source-map-comment",
        "package.json",
        "tsconfig.json",
      ]),
      logLevelType,
    ),
  )
  .option(
    "--log-override=<logOverride:LogSetting>",
    "Use log level V for log messages with identifier K (These record represents comma-separated list of 'K=V' pairs).",
  );

const command = logging
  .group("Serving")
  .option(
    "--certfile=<file>",
    "Certificate for serving HTTPS",
    { depends: ["keyfile"] },
  )
  .option(
    "--keyfile=<file>",
    "Key for serving HTTPS",
    { depends: ["certfile"] },
  )
  .option(
    "--serve-fallback=<file>",
    "Serve this HTML page when the request doesn't match",
  )
  .option(
    "--servedir=<file>",
    "What to serve in addition to generated output files",
  );

const {
  options: {
    metafile,
    mangleCache: mangleCachePath,
    // deno-lint-ignore no-unused-vars
    serve,
    // deno-lint-ignore no-unused-vars
    serveFallback,
    // deno-lint-ignore no-unused-vars
    servedir,
    // deno-lint-ignore no-unused-vars
    keyfile,
    // deno-lint-ignore no-unused-vars
    certfile,
    // deno-lint-ignore no-unused-vars
    sourcefile,
    analyze,
    // deno-lint-ignore no-unused-vars
    watch,
    config,
    importMap,
    lock,
    nodeModulesDir,
    ...options
  },
  args,
  cmd,
} = await command.parse(
  Deno.args,
);

let mangleCache: Record<string, string | false> | undefined;
if (mangleCachePath) {
  try {
    const json = await (await fetch(mangleCachePath)).json();
    mangleCache = ensure(
      json,
      isRecordObjectOf(isUnionOf([isString, isLiteralOf(false)])),
    );
  } catch (e: unknown) {
    cmd.throw(
      new ValidationError(
        `Failed to read mangle cache file "${mangleCachePath}": ${e}`,
      ),
    );
  }
}

let configPath: string | undefined;
if (isString(config)) {
  configPath = config;
}
if (isUndefined(config)) {
  if (await exists("deno.json", { isFile: true })) {
    configPath = "deno.json";
  } else if (await exists("deno.jsonc", { isFile: true })) {
    configPath = "deno.jsonc";
  }
}
if (configPath) configPath = `${resolve(Deno.cwd(), configPath)}`;

const result = await build({
  plugins: denoPlugins({
    configPath,
    importMapURL: importMap,
    lockPath: lock,
    nodeModulesDir,
  }),
  entryPoints: args,
  metafile: metafile !== undefined || analyze !== undefined,
  mangleCache,
  ...options,
});

if (analyze) {
  console.log(
    await analyzeMetafile(result.metafile!, { verbose: analyze === "verbose" }),
  );
}
if (metafile) {
  await Deno.writeTextFile(metafile, JSON.stringify(result.metafile!));
}

stop();
