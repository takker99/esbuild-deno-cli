# @takker/esbuild

[![JSR](https://jsr.io/badges/@takker/esbuild-deno-cli)](https://jsr.io/@takker/esbuild-deno-cli)
[![test](https://github.com/takker99/esbuild-deno-cli/workflows/ci/badge.svg)](https://github.com/takker99/esbuild-deno-cli/actions?query=workflow%3Aci)

[Esbuild](https://github.com/evanw/esbuild) CLI wrapper with
[esbuild-deno-loader](https://jsr.io/@luca/esbuild-deno-loader) CLI wrapper of
esbuild and esbuild-deno-loader

# Usage

```
Usage:   esbuild-deno-cli [entry-points...]

Description:

  Build JS/TS/JSX/TSX codes following Deno-style imports by esbuild

Options:

  -h, --help     - Show this help.
  -V, --version  - Show the version number for this program.

General options:

  --bundle                       - Bundle all dependencies into the output files
  --minify                       - Minify the output (sets all --minify-* flags)
  --platform      <platform>     - Platform target                                                          (Default: "browser", Values: "browser", "node", "neutral")
  --serve                        - Start a local HTTP server on this host:port for outputs
  --tsconfig      <file>         - Use this tsconfig.json file instead of other ones                        (Conflicts: --tsconfig-raw)
  --tsconfig-raw  <tsconfigRaw>  - Override all tsconfig.json files with this string                        (Conflicts: --tsconfig)
  --watch                        - Watch mode: rebuild on file system changes (stops when stdin is closed)

Deno options:

  --config            <config>     - Path to the Deno configuration file. If it is not specified, the default
                                     configuration file in the current directory is used.
  --no-config                      - Do not use any Deno configuration file.
  --import-map        <importMap>  - Path to the import map file.
  --lock              <lock>       - Path to the lock file. If it is not specified but the Deno configuration file is
                                     used, Find the lock file in the same directory as the Deno configuration file.
  --node-modules-dir               - Equivalent to the "--node-modules-dir" flag to Deno
```

For full documentation, run

```sh
deno run jsr:@takker/esbuild-deno-cli --help
```
