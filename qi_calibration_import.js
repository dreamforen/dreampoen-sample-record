/* Dreamforen glassware Excel import I/O. Parsing always runs in a disposable worker. */
(function (root) {
  'use strict';
  var MAX_BYTES = 10 * 1024 * 1024;
  var TIMEOUT_MS = 20000;
  var scriptURL = typeof document !== 'undefined' && document.currentScript
    ? document.currentScript.src : (typeof document !== 'undefined' ? document.baseURI : '');

  function fail(message, code, fileName) {
    var error = new Error((fileName ? fileName + ': ' : '') + message);
    error.code = code;
    return error;
  }
  function aborted() {
    var error = new Error('엑셀 불러오기를 취소했습니다.');
    error.name = 'AbortError';
    error.code = 'IMPORT_ABORTED';
    return error;
  }
  function read(file, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var worker = null, timer = null, settled = false;
      var signal = options.signal;
      var name = file && typeof file.name === 'string' ? file.name : '';
      function cleanup() {
        if (timer !== null) root.clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (worker) {
          worker.onmessage = worker.onerror = worker.onmessageerror = null;
          worker.terminate();
          worker = null;
        }
      }
      function finish(error, result) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve(result);
      }
      function onAbort() { finish(aborted()); }
      function progress(phase) {
        if (settled || typeof options.onProgress !== 'function') return;
        try { options.onProgress({phase: phase, fileName: name}); } catch (_) { /* UI callback cannot strand a worker. */ }
      }
      if (signal && signal.aborted) { finish(aborted()); return; }
      if (!file || typeof file.arrayBuffer !== 'function' || !name) {
        finish(fail('엑셀 파일을 선택해 주세요.', 'IMPORT_FILE_REQUIRED')); return;
      }
      if (!/\.(xlsx|xlsm|xls)$/i.test(name)) {
        finish(fail('지원하는 파일은 .xlsx, .xlsm, .xls입니다.', 'IMPORT_FILE_TYPE', name)); return;
      }
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES) {
        finish(fail('비어 있지 않은 10 MB 이하 엑셀 파일을 선택해 주세요.', 'IMPORT_FILE_SIZE', name)); return;
      }
      if (typeof root.Worker !== 'function') {
        finish(fail('이 브라우저에서는 엑셀 불러오기를 지원하지 않습니다. 최신 브라우저를 이용해 주세요.', 'IMPORT_WORKER_UNAVAILABLE', name)); return;
      }
      if (signal) signal.addEventListener('abort', onAbort, {once: true});
      timer = root.setTimeout(function () {
        finish(fail('불러오기 시간이 20초를 초과했습니다. 파일의 사용하지 않는 시트나 서식을 줄여 다시 시도해 주세요.', 'IMPORT_TIMEOUT', name));
      }, TIMEOUT_MS);
      progress('reading');
      Promise.resolve().then(function () { return settled ? null : file.arrayBuffer(); }).then(function (buffer) {
        if (settled) return;
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size || buffer.byteLength > MAX_BYTES) {
          finish(fail('파일 크기를 확인할 수 없습니다. 파일을 다시 선택해 주세요.', 'IMPORT_FILE_SIZE', name)); return;
        }
        try {
          worker = new root.Worker(new URL('qi_calibration_import_worker.js?v=cal370', scriptURL || root.location.href).href);
          worker.onmessage = function (event) {
            if (settled) return;
            var data = event.data;
            if (data && data.type === 'progress') { progress(data.phase); return; }
            if (data && data.type === 'result' && data.result && typeof data.result.ok === 'boolean') {
              progress('complete'); finish(null, data.result); return;
            }
            if (data && data.type === 'error') {
              finish(fail(data.message || '엑셀을 읽지 못했습니다.', data.code || 'IMPORT_PARSE_ERROR', name)); return;
            }
            finish(fail('엑셀 처리 응답을 확인할 수 없습니다.', 'IMPORT_WORKER_RESPONSE', name));
          };
          worker.onerror = function (event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            finish(fail('엑셀 처리기를 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'IMPORT_WORKER_ERROR', name));
          };
          worker.onmessageerror = function () {
            finish(fail('엑셀 처리 결과를 전달받지 못했습니다.', 'IMPORT_WORKER_MESSAGE', name));
          };
          progress('parsing');
          if (!settled) worker.postMessage({type: 'parse', fileName: name, buffer: buffer}, [buffer]);
        } catch (_) {
          finish(fail('엑셀 처리기를 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'IMPORT_WORKER_ERROR', name));
        }
      }).catch(function () {
        finish(fail('파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.', 'IMPORT_READ_ERROR', name));
      });
    });
  }
  root.DF_QI_CAL_IMPORT_IO = Object.freeze({read: read});
})(typeof window !== 'undefined' ? window : globalThis);
