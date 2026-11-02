/* One file per disposable worker; no DOM, network API or application writes. */
(function () {
  'use strict';
  var MAX_BYTES = 10 * 1024 * 1024;
  var MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
  var MAX_SHEETS = 30, MAX_ROWS = 2000, MAX_COLS = 100, MAX_CELLS = 200000;
  var received = false;
  function invalid(message, code) {
    var error = new Error(message); error.code = code; throw error;
  }
  function zipGuard(buffer) {
    var v = new DataView(buffer), length = v.byteLength, end = -1;
    for (var i = length - 22, low = Math.max(0, length - 65557); i >= low; i--) {
      if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === length) { end = i; break; }
    }
    if (end < 0) invalid('엑셀 압축 구조가 손상되었습니다. 원본에서 다시 저장해 주세요.', 'IMPORT_ZIP_INVALID');
    var count = v.getUint16(end + 10, true), directorySize = v.getUint32(end + 12, true), cursor = v.getUint32(end + 16, true);
    if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || v.getUint16(end + 8, true) !== count ||
        count === 65535 || directorySize === 0xffffffff || cursor === 0xffffffff || !count || count > 2000 || cursor + directorySize !== end) {
      invalid('지원하지 않는 엑셀 압축 구조입니다. 일반 .xlsx 파일로 다시 저장해 주세요.', 'IMPORT_ZIP_UNSUPPORTED');
    }
    var directoryStart = cursor, directoryEnd = cursor + directorySize, expanded = 0;
    for (var entry = 0; entry < count; entry++) {
      if (cursor + 46 > directoryEnd || v.getUint32(cursor, true) !== 0x02014b50) invalid('엑셀 압축 목록이 손상되었습니다.', 'IMPORT_ZIP_INVALID');
      var flags = v.getUint16(cursor + 8, true), method = v.getUint16(cursor + 10, true);
      var compressed = v.getUint32(cursor + 20, true), size = v.getUint32(cursor + 24, true);
      var nameLength = v.getUint16(cursor + 28, true), extraLength = v.getUint16(cursor + 30, true), commentLength = v.getUint16(cursor + 32, true);
      var local = v.getUint32(cursor + 42, true);
      if (flags & 1) invalid('암호가 설정된 엑셀은 불러올 수 없습니다. 암호를 해제해 주세요.', 'IMPORT_ENCRYPTED');
      if (compressed === 0xffffffff || size === 0xffffffff || local === 0xffffffff || v.getUint16(cursor + 34, true) || (method !== 0 && method !== 8)) {
        invalid('지원하지 않는 엑셀 압축 방식입니다. 일반 .xlsx 파일로 다시 저장해 주세요.', 'IMPORT_ZIP_UNSUPPORTED');
      }
      expanded += size;
      if (expanded > MAX_EXPANDED_BYTES) invalid('압축을 푼 엑셀 크기가 50 MB를 초과합니다. 사용하지 않는 시트와 서식을 줄여 주세요.', 'IMPORT_EXPANDED_SIZE');
      if (cursor + 46 + nameLength + extraLength + commentLength > directoryEnd || local + 30 > directoryStart || v.getUint32(local, true) !== 0x04034b50) {
        invalid('엑셀 압축 내용이 손상되었습니다.', 'IMPORT_ZIP_INVALID');
      }
      var dataStart = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      if (dataStart + compressed > directoryStart || (v.getUint16(local + 6, true) & 1)) invalid('엑셀 압축 내용 또는 암호 설정을 확인해 주세요.', 'IMPORT_ZIP_INVALID');
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== directoryEnd) invalid('엑셀 압축 목록 길이가 올바르지 않습니다.', 'IMPORT_ZIP_INVALID');
  }
  function formatGuard(buffer, fileName) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 4 || buffer.byteLength > MAX_BYTES) invalid('비어 있지 않은 10 MB 이하 엑셀 파일을 선택해 주세요.', 'IMPORT_FILE_SIZE');
    if (!/\.(xlsx|xlsm|xls)$/i.test(fileName)) invalid('지원하는 파일은 .xlsx, .xlsm, .xls입니다.', 'IMPORT_FILE_TYPE');
    var v = new DataView(buffer), zip = v.getUint32(0, true) === 0x04034b50;
    if (zip) { zipGuard(buffer); return; }
    if (/\.(xlsx|xlsm)$/i.test(fileName)) invalid('파일 형식이 다르거나 암호가 설정되어 있습니다. 암호 없는 엑셀로 다시 저장해 주세요.', 'IMPORT_FORMAT_INVALID');
    var ole = buffer.byteLength >= 8 && v.getUint32(0, true) === 0xe011cfd0 && v.getUint32(4, true) === 0xe11ab1a1;
    var biff = [0x0009, 0x0209, 0x0409, 0x0809].indexOf(v.getUint16(0, true)) !== -1;
    if (!ole && !biff) invalid('올바른 .xls 파일이 아닙니다. 엑셀에서 .xlsx로 다시 저장해 주세요.', 'IMPORT_FORMAT_INVALID');
  }
  function rangeSize(ref) {
    var match = /^\$?([A-Z]{1,4})\$?([1-9][0-9]{0,7})(?::\$?([A-Z]{1,4})\$?([1-9][0-9]{0,7}))?$/.exec(ref);
    if (!match) invalid('시트의 셀 범위를 확인할 수 없습니다.', 'IMPORT_RANGE_INVALID');
    function column(s) { var result = 0; for (var i = 0; i < s.length; i++) result = result * 26 + s.charCodeAt(i) - 64; return result; }
    var c1 = column(match[1]), c2 = column(match[3] || match[1]);
    var r1 = Number(match[2]), r2 = Number(match[4] || match[2]);
    if (r2 < r1 || c2 < c1 || r2 > MAX_ROWS || c2 > MAX_COLS) invalid('시트는 2,000행·100열 이하로 정리해 주세요. 사용하지 않는 끝부분 서식도 삭제해 주세요.', 'IMPORT_SHEET_RANGE');
    return (r2 - r1 + 1) * (c2 - c1 + 1);
  }
  function sheetCountGuard(book) {
    if (!book || !Array.isArray(book.SheetNames) || !book.SheetNames.length || book.SheetNames.length > MAX_SHEETS) invalid('엑셀 시트는 1개 이상 30개 이하로 구성해 주세요.', 'IMPORT_SHEET_COUNT');
  }
  function workbookGuard(book) {
    sheetCountGuard(book);
    var cells = 0;
    book.SheetNames.forEach(function (name) {
      var sheet = book.Sheets[name];
      if (!sheet) invalid('엑셀 시트를 읽지 못했습니다.', 'IMPORT_SHEET_INVALID');
      /* !fullref preserves the original range when SheetJS sheetRows limits parsing. */
      if (sheet['!fullref']) rangeSize(sheet['!fullref']);
      if (sheet['!ref']) cells += rangeSize(sheet['!ref']);
      if (cells > MAX_CELLS) invalid('전체 시트의 사용 범위가 200,000셀을 초과합니다. 파일을 나누어 주세요.', 'IMPORT_CELL_LIMIT');
    });
  }
  self.onmessage = function (event) {
    if (received) return;
    received = true;
    try {
      var data = event.data;
      if (!data || data.type !== 'parse') invalid('엑셀 처리 요청이 올바르지 않습니다.', 'IMPORT_REQUEST_INVALID');
      var name = typeof data.fileName === 'string' ? data.fileName : '';
      formatGuard(data.buffer, name);
      self.importScripts('./assets/vendor/xlsx.full.min.js', './qi_calibration_import_model.js?v=cal370');
      if (!self.XLSX || !self.DF_QI_CAL_IMPORT || typeof self.DF_QI_CAL_IMPORT.parseWorkbook !== 'function') invalid('엑셀 처리기를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'IMPORT_DEPENDENCY');
      /* Count sheets without materializing their cells before the bounded parse. */
      sheetCountGuard(self.XLSX.read(data.buffer, {type: 'array', bookSheets: true, bookVBA: false}));
      var book = self.XLSX.read(data.buffer, {type: 'array', dense: false, cellDates: false, cellFormula: true, bookVBA: false, sheetRows: MAX_ROWS + 1});
      workbookGuard(book);
      var result = self.DF_QI_CAL_IMPORT.parseWorkbook(book, {fileName: name, maxRows: MAX_ROWS});
      if (!result || typeof result.ok !== 'boolean' || !Array.isArray(result.rows) || !Array.isArray(result.groups) || result.rows.length > MAX_ROWS) invalid('엑셀 처리 결과를 확인할 수 없습니다.', 'IMPORT_RESULT_INVALID');
      self.postMessage({type: 'result', result: result});
    } catch (error) {
      self.postMessage({type: 'error', code: error && error.code || 'IMPORT_PARSE_ERROR', message: error && error.code ? error.message : '엑셀을 읽지 못했습니다. 암호·손상 여부를 확인하고 엑셀에서 다시 저장해 주세요.'});
    }
    self.close();
  };
})();
