// Local port: externalize the exact embedded WASM, accept AudioWorkletGlobalScope, and add loadBinary(). See README.md.
/**
 * @shiguredo/rnnoise-wasm
 * WebAssembly build of RNNoise
 * @version: 2025.1.5
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/
var bA = async function(h = {}) {
  var f, P = h, O, x, Z = new Promise((A, B) => {
    O = A, x = B;
  }), _ = import.meta.url, $ = "";
  {
    try {
      $ = new URL(".", _).href;
    } catch {
    }
    if (!(typeof window == "object" || typeof WorkerGlobalScope < "u" || typeof AudioWorkletProcessor === "function")) throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
  }
  var AA = console.log.bind(console), I = console.error.bind(console);
  v(!0, "worker environment detected but not enabled at build time.  Add `worker` to `-sENVIRONMENT` to enable."), v(!0, "node environment detected but not enabled at build time.  Add `node` to `-sENVIRONMENT` to enable."), v(!0, "shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.");
  var BA;
  typeof WebAssembly != "object" && I("no native wasm support detected");
  var j, b = !1;
  function v(A, B) {
    A || L("Assertion failed" + (B ? ": " + B : ""));
  }
  var k, z, N = !1, QA = (A) => A.startsWith("file://");
  function wA() {
    var A = W();
    v((A & 3) == 0), A == 0 && (A += 4), z[A >> 2] = 34821223, z[A + 4 >> 2] = 2310721022, z[0] = 1668509029;
  }
  function X() {
    if (!b) {
      var A = W();
      A == 0 && (A += 4);
      var B = z[A >> 2], w = z[A + 4 >> 2];
      (B != 34821223 || w != 2310721022) && L(`Stack overflow! Stack cookie has been overwritten at ${Y(A)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${Y(w)} ${Y(B)}`), z[0] != 1668509029 && L("Runtime error: The application has corrupted its heap memory area (address zero)!");
    }
  }
  (() => {
    var A = new Int16Array(1), B = new Int8Array(A.buffer);
    if (A[0] = 25459, B[0] !== 115 || B[1] !== 99) throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
  })();
  function Q(A) {
    Object.getOwnPropertyDescriptor(P, A) && L(`\`Module.${A}\` was supplied but \`${A}\` not included in INCOMING_MODULE_JS_API`);
  }
  function K(A) {
    return A === "FS_createPath" || A === "FS_createDataFile" || A === "FS_createPreloadedFile" || A === "FS_unlink" || A === "addRunDependency" || // The old FS has some functionality that WasmFS lacks.
    A === "FS_createLazyFile" || A === "FS_createDevice" || A === "removeRunDependency";
  }
  function S(A, B) {
    typeof globalThis < "u" && !Object.getOwnPropertyDescriptor(globalThis, A) && Object.defineProperty(globalThis, A, {
      configurable: !0,
      get() {
        B();
      }
    });
  }
  function t(A, B) {
    S(A, () => {
      R(`\`${A}\` is not longer defined by emscripten. ${B}`);
    });
  }
  t("buffer", "Please use HEAP8.buffer or wasmMemory.buffer"), t("asm", "Please use wasmExports instead");
  function PA(A) {
    S(A, () => {
      var B = `\`${A}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`, w = A;
      w.startsWith("_") || (w = "$" + A), B += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${w}')`, K(A) && (B += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"), R(B);
    }), i(A);
  }
  function i(A) {
    Object.getOwnPropertyDescriptor(P, A) || Object.defineProperty(P, A, {
      configurable: !0,
      get() {
        var B = `'${A}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        K(A) && (B += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"), L(B);
      }
    });
  }
  function d() {
    var A = j.buffer;
    k = new Uint8Array(A), z = new Uint32Array(A), P.HEAPF32 = new Float32Array(A), new BigInt64Array(A), new BigUint64Array(A);
  }
  v(
    typeof Int32Array < "u" && typeof Float64Array < "u" && Int32Array.prototype.subarray != null && Int32Array.prototype.set != null,
    "JS engine does not provide full typed array support"
  );
  function vA() {
    v(!N), N = !0, X(), H.__wasm_call_ctors();
  }
  function DA() {
    X();
  }
  var U = 0, r = null, e = {}, u = null;
  function gA(A) {
    U++, v(!e[A]), e[A] = 1, u === null && typeof setInterval < "u" && (u = setInterval(() => {
      if (b) {
        clearInterval(u), u = null;
        return;
      }
      var B = !1;
      for (var w in e)
        B || (B = !0, I("still waiting on run dependencies:")), I(`dependency: ${w}`);
      B && I("(end of list)");
    }, 1e4));
  }
  function EA(A) {
    if (U--, v(e[A]), delete e[A], U == 0 && (u !== null && (clearInterval(u), u = null), r)) {
      var B = r;
      r = null, B();
    }
  }
  function L(A) {
    A = "Aborted(" + A + ")", I(A), b = !0;
    var B = new WebAssembly.RuntimeError(A);
    throw x(B), B;
  }
  var M = {
    error() {
      L("Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with -sFORCE_FILESYSTEM");
    },
    init() {
      M.error();
    },
    createDataFile() {
      M.error();
    },
    createPreloadedFile() {
      M.error();
    },
    createLazyFile() {
      M.error();
    },
    open() {
      M.error();
    },
    mkdev() {
      M.error();
    },
    registerDevice() {
      M.error();
    },
    analyzePath() {
      M.error();
    },
    ErrnoError() {
      M.error();
    }
  };
  function T(A, B) {
    return (...w) => {
      v(N, `native function \`${A}\` called before runtime initialization`);
      var g = H[A];
      return v(g, `exported native function \`${A}\` not found`), v(w.length <= B, `native function \`${A}\` called with ${w.length} args but expects ${B}`), g(...w);
    };
  }
  var o;
  function CA() { return new Uint8Array(h.tronoWasmBinary); }
  function fA(A) {
    if (ArrayBuffer.isView(A))
      return A;
    throw "both async and sync fetching of the wasm failed";
  }
  async function IA(A) {
    return fA(A);
  }
  async function HA(A, B) {
    try {
      var w = await IA(A), g = await WebAssembly.instantiate(w, B);
      return g;
    } catch (E) {
      I(`failed to asynchronously prepare wasm: ${E}`), QA(o) && I(`warning: Loading from a file URI (${o}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`), L(E);
    }
  }
  async function MA(A, B, w) {
    return HA(B, w);
  }
  function zA() {
    return {
      env: V,
      wasi_snapshot_preview1: V
    };
  }
  async function LA() {
    function A(D, s) {
      return H = D.exports, j = H.memory, v(j, "memory not found in wasm exports"), d(), EA("wasm-instantiate"), H;
    }
    gA("wasm-instantiate");
    var B = P;
    function w(D) {
      return v(P === B, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?"), B = null, A(D.instance);
    }
    var g = zA();
    o ??= CA();
    try {
      var E = await MA(BA, o, g), C = w(E);
      return C;
    } catch (D) {
      return x(D), Promise.reject(D);
    }
  }
  for (var FA = (A) => {
    v(A.length % 4 == 0);
    for (var B, w, g = 0, E = 0, C = A.length, D = new Uint8Array((C * 3 >> 2) - (A[C - 2] == "=") - (A[C - 1] == "=")); g < C; g += 4, E += 3)
      B = F[A.charCodeAt(g + 1)], w = F[A.charCodeAt(g + 2)], D[E] = F[A.charCodeAt(g)] << 2 | B >> 4, D[E + 1] = B << 4 | w >> 2, D[E + 2] = w << 6 | F[A.charCodeAt(g + 3)];
    return D;
  }, Y = (A) => (v(typeof A == "number"), A >>>= 0, "0x" + A.toString(16).padStart(8, "0")), R = (A) => {
    R.shown ||= {}, R.shown[A] || (R.shown[A] = 1, I(A));
  }, a = typeof TextDecoder < "u" ? new TextDecoder() : void 0, q = (A, B = 0, w = NaN) => {
    for (var g = B + w, E = B; A[E] && !(E >= g); ) ++E;
    if (E - B > 16 && A.buffer && a)
      return a.decode(A.subarray(B, E));
    for (var C = ""; B < E; ) {
      var D = A[B++];
      if (!(D & 128)) {
        C += String.fromCharCode(D);
        continue;
      }
      var s = A[B++] & 63;
      if ((D & 224) == 192) {
        C += String.fromCharCode((D & 31) << 6 | s);
        continue;
      }
      var c = A[B++] & 63;
      if ((D & 240) == 224 ? D = (D & 15) << 12 | s << 6 | c : ((D & 248) != 240 && R("Invalid UTF-8 leading byte " + Y(D) + " encountered when deserializing a UTF-8 string in wasm memory to a JS string!"), D = (D & 7) << 18 | s << 12 | c << 6 | A[B++] & 63), D < 65536)
        C += String.fromCharCode(D);
      else {
        var p = D - 65536;
        C += String.fromCharCode(55296 | p >> 10, 56320 | p & 1023);
      }
    }
    return C;
  }, n = (A, B) => (v(typeof A == "number", `UTF8ToString expects a number (got ${typeof A})`), A ? q(k, A, B) : ""), OA = (A, B, w, g) => L(`Assertion failed: ${n(A)}, at: ` + [B ? n(B) : "unknown filename", w, g ? n(g) : "unknown function"]), xA = () => (
    // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
    // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
    // for any code that deals with heap sizes, which would require special
    // casing all heap size related code to treat 0 specially.
    2147483648
  ), GA = (A, B) => (v(B, "alignment argument is required"), Math.ceil(A / B) * B), uA = (A) => {
    var B = j.buffer, w = (A - B.byteLength + 65535) / 65536 | 0;
    try {
      return j.grow(w), d(), 1;
    } catch (g) {
      I(`growMemory: Attempted to grow heap from ${B.byteLength} bytes to ${A} bytes, but got error: ${g}`);
    }
  }, sA = (A) => {
    var B = k.length;
    A >>>= 0, v(A > B);
    var w = xA();
    if (A > w)
      return I(`Cannot enlarge memory, requested ${A} bytes, but the limit is ${w} bytes!`), !1;
    for (var g = 1; g <= 4; g *= 2) {
      var E = B * (1 + 0.2 / g);
      E = Math.min(E, A + 100663296);
      var C = Math.min(w, GA(Math.max(A, E), 65536)), D = uA(C);
      if (D)
        return !0;
    }
    return I(`Failed to grow the heap from ${B} bytes to ${C} bytes, not enough memory!`), !1;
  }, TA = [null, [], []], RA = (A, B) => {
    var w = TA[A];
    v(w), B === 0 || B === 10 ? ((A === 1 ? AA : I)(q(w)), w.length = 0) : w.push(B);
  }, cA = (A, B, w, g) => {
    for (var E = 0, C = 0; C < w; C++) {
      var D = z[B >> 2], s = z[B + 4 >> 2];
      B += 8;
      for (var c = 0; c < s; c++)
        RA(A, k[D + c]);
      E += s;
    }
    return z[g >> 2] = E, 0;
  }, F = new Uint8Array(
    123
    /*'z'+1*/
  ), G = 25; G >= 0; --G)
    F[48 + G] = 52 + G, F[65 + G] = G, F[97 + G] = 26 + G;
  F[43] = 62, F[47] = 63, P.FS_createDataFile = M.createDataFile, P.FS_createPreloadedFile = M.createPreloadedFile, rA(), v(typeof P.memoryInitializerPrefixURL > "u", "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead"), v(typeof P.pthreadMainPrefixURL > "u", "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead"), v(typeof P.cdInitializerPrefixURL > "u", "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead"), v(typeof P.filePackagePrefixURL > "u", "Module.filePackagePrefixURL option was removed, use Module.locateFile instead"), v(typeof P.read > "u", "Module.read option was removed"), v(typeof P.readAsync > "u", "Module.readAsync option was removed (modify readAsync in JS)"), v(typeof P.readBinary > "u", "Module.readBinary option was removed (modify readBinary in JS)"), v(typeof P.setWindowTitle > "u", "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)"), v(typeof P.TOTAL_MEMORY > "u", "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY"), v(typeof P.ENVIRONMENT > "u", "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)"), v(typeof P.STACK_SIZE > "u", "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time"), v(typeof P.wasmMemory > "u", "Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally"), v(typeof P.INITIAL_MEMORY > "u", "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically");
  var jA = [
    "writeI53ToI64",
    "writeI53ToI64Clamped",
    "writeI53ToI64Signaling",
    "writeI53ToU64Clamped",
    "writeI53ToU64Signaling",
    "readI53FromI64",
    "readI53FromU64",
    "convertI32PairToI53",
    "convertI32PairToI53Checked",
    "convertU32PairToI53",
    "bigintToI53Checked",
    "stackAlloc",
    "getTempRet0",
    "setTempRet0",
    "zeroMemory",
    "exitJS",
    "strError",
    "inetPton4",
    "inetNtop4",
    "inetPton6",
    "inetNtop6",
    "readSockaddr",
    "writeSockaddr",
    "emscriptenLog",
    "readEmAsmArgs",
    "jstoi_q",
    "getExecutableName",
    "listenOnce",
    "autoResumeAudioContext",
    "getDynCaller",
    "dynCall",
    "handleException",
    "keepRuntimeAlive",
    "runtimeKeepalivePush",
    "runtimeKeepalivePop",
    "callUserCallback",
    "maybeExit",
    "asmjsMangle",
    "asyncLoad",
    "mmapAlloc",
    "HandleAllocator",
    "getNativeTypeSize",
    "addOnPreRun",
    "addOnInit",
    "addOnPostCtor",
    "addOnPreMain",
    "addOnExit",
    "addOnPostRun",
    "STACK_SIZE",
    "STACK_ALIGN",
    "POINTER_SIZE",
    "ASSERTIONS",
    "getCFunc",
    "ccall",
    "cwrap",
    "uleb128Encode",
    "sigToWasmTypes",
    "generateFuncType",
    "convertJsFunctionToWasm",
    "getEmptyTableSlot",
    "updateTableMap",
    "getFunctionAddress",
    "addFunction",
    "removeFunction",
    "reallyNegative",
    "unSign",
    "strLen",
    "reSign",
    "formatString",
    "stringToUTF8Array",
    "stringToUTF8",
    "lengthBytesUTF8",
    "intArrayFromString",
    "intArrayToString",
    "AsciiToString",
    "stringToAscii",
    "UTF16ToString",
    "stringToUTF16",
    "lengthBytesUTF16",
    "UTF32ToString",
    "stringToUTF32",
    "lengthBytesUTF32",
    "stringToNewUTF8",
    "stringToUTF8OnStack",
    "writeArrayToMemory",
    "registerKeyEventCallback",
    "maybeCStringToJsString",
    "findEventTarget",
    "getBoundingClientRect",
    "fillMouseEventData",
    "registerMouseEventCallback",
    "registerWheelEventCallback",
    "registerUiEventCallback",
    "registerFocusEventCallback",
    "fillDeviceOrientationEventData",
    "registerDeviceOrientationEventCallback",
    "fillDeviceMotionEventData",
    "registerDeviceMotionEventCallback",
    "screenOrientation",
    "fillOrientationChangeEventData",
    "registerOrientationChangeEventCallback",
    "fillFullscreenChangeEventData",
    "registerFullscreenChangeEventCallback",
    "JSEvents_requestFullscreen",
    "JSEvents_resizeCanvasForFullscreen",
    "registerRestoreOldStyle",
    "hideEverythingExceptGivenElement",
    "restoreHiddenElements",
    "setLetterbox",
    "softFullscreenResizeWebGLRenderTarget",
    "doRequestFullscreen",
    "fillPointerlockChangeEventData",
    "registerPointerlockChangeEventCallback",
    "registerPointerlockErrorEventCallback",
    "requestPointerLock",
    "fillVisibilityChangeEventData",
    "registerVisibilityChangeEventCallback",
    "registerTouchEventCallback",
    "fillGamepadEventData",
    "registerGamepadEventCallback",
    "registerBeforeUnloadEventCallback",
    "fillBatteryEventData",
    "battery",
    "registerBatteryEventCallback",
    "setCanvasElementSize",
    "getCanvasElementSize",
    "jsStackTrace",
    "getCallstack",
    "convertPCtoSourceLocation",
    "getEnvStrings",
    "checkWasiClock",
    "wasiRightsToMuslOFlags",
    "wasiOFlagsToMuslOFlags",
    "initRandomFill",
    "randomFill",
    "safeSetTimeout",
    "setImmediateWrapped",
    "safeRequestAnimationFrame",
    "clearImmediateWrapped",
    "registerPostMainLoop",
    "registerPreMainLoop",
    "getPromise",
    "makePromise",
    "idsToPromises",
    "makePromiseCallback",
    "Browser_asyncPrepareDataCounter",
    "isLeapYear",
    "ydayFromDate",
    "arraySum",
    "addDays",
    "getSocketFromFD",
    "getSocketAddress",
    "FS_createPreloadedFile",
    "FS_modeStringToFlags",
    "FS_getMode",
    "FS_stdin_getChar",
    "FS_mkdirTree",
    "_setNetworkCallback"
  ];
  jA.forEach(PA);
  var UA = [
    "run",
    "addRunDependency",
    "removeRunDependency",
    "out",
    "err",
    "callMain",
    "abort",
    "wasmMemory",
    "wasmExports",
    "HEAPF64",
    "HEAP8",
    "HEAPU8",
    "HEAP16",
    "HEAPU16",
    "HEAP32",
    "HEAPU32",
    "HEAP64",
    "HEAPU64",
    "writeStackCookie",
    "checkStackCookie",
    "INT53_MAX",
    "INT53_MIN",
    "stackSave",
    "stackRestore",
    "ptrToString",
    "getHeapMax",
    "growMemory",
    "ENV",
    "ERRNO_CODES",
    "DNS",
    "Protocols",
    "Sockets",
    "timers",
    "warnOnce",
    "readEmAsmArgsArray",
    "alignMemory",
    "wasmTable",
    "noExitRuntime",
    "freeTableIndexes",
    "functionsInTableMap",
    "setValue",
    "getValue",
    "PATH",
    "PATH_FS",
    "UTF8Decoder",
    "UTF8ArrayToString",
    "UTF8ToString",
    "UTF16Decoder",
    "JSEvents",
    "specialHTMLTargets",
    "findCanvasEventTarget",
    "currentFullscreenStrategy",
    "restoreOldWindowedStyle",
    "UNWIND_CACHE",
    "ExitStatus",
    "flush_NO_FILESYSTEM",
    "emSetImmediate",
    "emClearImmediate_deps",
    "emClearImmediate",
    "promiseMap",
    "Browser",
    "getPreloadedImageData__data",
    "wget",
    "MONTH_DAYS_REGULAR",
    "MONTH_DAYS_LEAP",
    "MONTH_DAYS_REGULAR_CUMULATIVE",
    "MONTH_DAYS_LEAP_CUMULATIVE",
    "base64Decode",
    "SYSCALLS",
    "preloadPlugins",
    "FS_stdin_getChar_buffer",
    "FS_unlink",
    "FS_createPath",
    "FS_createDevice",
    "FS_readFile",
    "FS",
    "FS_root",
    "FS_mounts",
    "FS_devices",
    "FS_streams",
    "FS_nextInode",
    "FS_nameTable",
    "FS_currentPath",
    "FS_initialized",
    "FS_ignorePermissions",
    "FS_filesystems",
    "FS_syncFSRequests",
    "FS_lookupPath",
    "FS_getPath",
    "FS_hashName",
    "FS_hashAddNode",
    "FS_hashRemoveNode",
    "FS_lookupNode",
    "FS_createNode",
    "FS_destroyNode",
    "FS_isRoot",
    "FS_isMountpoint",
    "FS_isFile",
    "FS_isDir",
    "FS_isLink",
    "FS_isChrdev",
    "FS_isBlkdev",
    "FS_isFIFO",
    "FS_isSocket",
    "FS_flagsToPermissionString",
    "FS_nodePermissions",
    "FS_mayLookup",
    "FS_mayCreate",
    "FS_mayDelete",
    "FS_mayOpen",
    "FS_checkOpExists",
    "FS_nextfd",
    "FS_getStreamChecked",
    "FS_getStream",
    "FS_createStream",
    "FS_closeStream",
    "FS_dupStream",
    "FS_doSetAttr",
    "FS_chrdev_stream_ops",
    "FS_major",
    "FS_minor",
    "FS_makedev",
    "FS_registerDevice",
    "FS_getDevice",
    "FS_getMounts",
    "FS_syncfs",
    "FS_mount",
    "FS_unmount",
    "FS_lookup",
    "FS_mknod",
    "FS_statfs",
    "FS_statfsStream",
    "FS_statfsNode",
    "FS_create",
    "FS_mkdir",
    "FS_mkdev",
    "FS_symlink",
    "FS_rename",
    "FS_rmdir",
    "FS_readdir",
    "FS_readlink",
    "FS_stat",
    "FS_fstat",
    "FS_lstat",
    "FS_doChmod",
    "FS_chmod",
    "FS_lchmod",
    "FS_fchmod",
    "FS_doChown",
    "FS_chown",
    "FS_lchown",
    "FS_fchown",
    "FS_doTruncate",
    "FS_truncate",
    "FS_ftruncate",
    "FS_utime",
    "FS_open",
    "FS_close",
    "FS_isClosed",
    "FS_llseek",
    "FS_read",
    "FS_write",
    "FS_mmap",
    "FS_msync",
    "FS_ioctl",
    "FS_writeFile",
    "FS_cwd",
    "FS_chdir",
    "FS_createDefaultDirectories",
    "FS_createDefaultDevices",
    "FS_createSpecialDirectories",
    "FS_createStandardStreams",
    "FS_staticInit",
    "FS_init",
    "FS_quit",
    "FS_findObject",
    "FS_analyzePath",
    "FS_createFile",
    "FS_createDataFile",
    "FS_forceLoadFile",
    "FS_createLazyFile",
    "FS_absolutePath",
    "FS_createFolder",
    "FS_createLink",
    "FS_joinPath",
    "FS_mmapAlloc",
    "FS_standardizePath",
    "MEMFS",
    "TTY",
    "PIPEFS",
    "SOCKFS"
  ];
  UA.forEach(i);
  function rA() {
    Q("ENVIRONMENT"), Q("GL_MAX_TEXTURE_IMAGE_UNITS"), Q("SDL_canPlayWithWebAudio"), Q("SDL_numSimultaneouslyQueuedBuffers"), Q("INITIAL_MEMORY"), Q("wasmMemory"), Q("arguments"), Q("buffer"), Q("canvas"), Q("doNotCaptureKeyboard"), Q("dynamicLibraries"), Q("elementPointerLock"), Q("extraStackTrace"), Q("forcedAspectRatio"), Q("instantiateWasm"), Q("keyboardListeningElement"), Q("freePreloadedMediaOnUse"), Q("loadSplitModule"), Q("locateFile"), Q("logReadFiles"), Q("mainScriptUrlOrBlob"), Q("mem"), Q("monitorRunDependencies"), Q("noExitRuntime"), Q("noInitialRun"), Q("onAbort"), Q("onCustomMessage"), Q("onExit"), Q("onFree"), Q("onFullScreen"), Q("onMalloc"), Q("onRealloc"), Q("onRuntimeInitialized"), Q("postMainLoop"), Q("postRun"), Q("preInit"), Q("preMainLoop"), Q("preRun"), Q("preinitializedWebGLContext"), Q("preloadPlugins"), Q("print"), Q("printErr"), Q("setStatus"), Q("statusMessage"), Q("stderr"), Q("stdin"), Q("stdout"), Q("thisProgram"), Q("wasm"), Q("wasmBinary"), Q("websocket"), Q("fetchSettings");
  }
  var V = {
    /** @export */
    __assert_fail: OA,
    /** @export */
    emscripten_resize_heap: sA,
    /** @export */
    fd_write: cA
  }, H = await LA();
  P._rnnoise_get_frame_size = T("rnnoise_get_frame_size", 0), P._rnnoise_create = T("rnnoise_create", 1), P._rnnoise_destroy = T("rnnoise_destroy", 1), P._rnnoise_process_frame = T("rnnoise_process_frame", 3), P._free = T("free", 1), P._malloc = T("malloc", 1);
  var eA = H.emscripten_stack_init;
  H.emscripten_stack_get_free, H.emscripten_stack_get_base;
  var W = H.emscripten_stack_get_end;
  H._emscripten_stack_restore, H._emscripten_stack_alloc, H.emscripten_stack_get_current;
  var m;
  function hA() {
    eA(), wA();
  }
  function J() {
    if (U > 0) {
      r = J;
      return;
    }
    if (hA(), U > 0) {
      r = J;
      return;
    }
    function A() {
      v(!m), m = !0, P.calledRun = !0, !b && (vA(), O(P), v(!P._main, 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]'), DA());
    }
    A(), X();
  }
  J(), f = Z;
  for (const A of Object.keys(P))
    A in h || Object.defineProperty(h, A, {
      configurable: !0,
      get() {
        L(`Access to module property ('${A}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`);
      }
    });
  return f;
};
class l {
  rnnoiseModule;
  /**
   * 一度の {@link DenoiseState.processFrame} メソッド呼び出しで処理可能なサンプル数
   */
  frameSize;
  constructor(f) {
    this.rnnoiseModule = f, this.frameSize = f._rnnoise_get_frame_size();
  }
  /**
   * wasm ファイルをロードして {@link Rnnoise} のインスタンスを生成する関数
   *
   * @returns 生成された {@link Rnnoise} インスタンス
   */
  static async load() {
    const f = await bA();
    return new l(f);
  }
  static async loadBinary(wasmBinary) {
    const module = await bA({ tronoWasmBinary: wasmBinary });
    return new l(module);
  }
  /**
   * ノイズ抑制を行うための {@link DenoiseState} インスタンスを生成します
   *
   * @param model 使用するノイズ抑制モデル（省略時はデフォルトモデル）
   * @returns 生成されたインスタンス
   */
  createDenoiseState() {
    return new kA(this.rnnoiseModule);
  }
}
const y = 4;
class kA {
  rnnoiseModule;
  state;
  pcmInputBuf;
  pcmOutputBuf;
  frameSize;
  /**
   * @internal
   */
  constructor(f) {
    this.rnnoiseModule = f, this.frameSize = this.rnnoiseModule._rnnoise_get_frame_size();
    const P = this.rnnoiseModule._rnnoise_create(), O = this.rnnoiseModule._malloc(this.frameSize * y), x = this.rnnoiseModule._malloc(this.frameSize * y);
    if (!P || !O || !x)
      throw this.destroy(), Error("Failed to allocate DenoiseState or PCM buffers.");
    this.state = P, this.pcmInputBuf = O, this.pcmOutputBuf = x;
  }
  /**
     * 音声フレームにノイズ抑制処理を適用するメソッド
     *
     * @param frame ノイズ抑制処理の対象となる音声フレーム
  
     * @returns
     * VAD (voice-activity-detection) の結果を返します
     *
     * 結果の範囲は0から1で、値が大きいほど、入力音声フレームに人の声が含まれている可能性が高いことを意味します
     *
     * @throws
     * 入力音声フレームに含まれるサンプルの数 (`frame.length`) が {@link Rnnoise.frameSize} と異なる場合にエラーが送出されます
     *
     * @remarks
     * RNNoise は入力音声フレームが 16ビットPCM であると仮定しているため、
     * それ以外のフォーマットのフレームを処理したい場合には、
     * 呼び出し側で事前に変換を行っておく必要があります
     */
  processFrame(f) {
    if (this.rnnoiseModule === void 0)
      throw Error("This denoise state has already been destroyed.");
    if (f.length !== this.frameSize)
      throw Error(`Expected frame size ${this.frameSize}, but got ${f.length}`);
    const P = this.pcmInputBuf / y, O = this.pcmOutputBuf / y;
    this.rnnoiseModule.HEAPF32.set(f, P);
    const x = this.rnnoiseModule._rnnoise_process_frame(
      this.state,
      this.pcmOutputBuf,
      this.pcmInputBuf
    );
    return f.set(this.rnnoiseModule.HEAPF32.subarray(O, O + this.frameSize)), x;
  }
  /**
   * インスタンスが割り当てた wasm 内の領域を解放します
   *
   * 本メソッド呼び出し後に {@link DenoiseState.processFrame} メソッドを呼ぶとエラーとなります
   */
  destroy() {
    this.rnnoiseModule !== void 0 && (this.rnnoiseModule._rnnoise_destroy(this.state), this.rnnoiseModule._free(this.pcmInputBuf), this.rnnoiseModule._free(this.pcmOutputBuf), this.rnnoiseModule = void 0);
  }
}
export {
  kA as DenoiseState,
  l as Rnnoise
};
