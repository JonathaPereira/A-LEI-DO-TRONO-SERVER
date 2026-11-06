'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

function loadWorklet(filename, sampleRate = 48000) {
  let Processor;
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('.ts')) source = stripTypeScriptTypes(source);
  vm.runInNewContext(
    source,
    {
      exports: {},
      Float32Array,
      sampleRate,
      AudioWorkletProcessor: class {
        constructor() {
          this.port = { onmessage: null };
        }
      },
      registerProcessor(_name, constructor) {
        if (Processor) throw Error('A worklet file must register exactly one processor.');
        Processor = constructor;
      },
    },
    { filename },
  );
  if (!Processor) throw Error('No processor registered by ' + filename);
  return new Processor();
}

module.exports = { loadWorklet };
