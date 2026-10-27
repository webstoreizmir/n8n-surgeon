#!/usr/bin/env node
import { main } from '../src/cli.mjs';
main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => { console.error(`error: ${err.message}`); process.exit(2); },
);
