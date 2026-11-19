/* DREAMFOREN Beta428 · contract-menu board display order only. */
(function () {
  'use strict';
  const text = value => String(value ?? '').trim().normalize('NFKC');
  const natural = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  function day(value) {
    const source = text(value);
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(source)) {
      const time = Date.parse(source);
      return Number.isFinite(time) ? new Date(time + 32400000).toISOString().slice(0, 10) : '';
    }
    const match = source.match(/^(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})(?:[.\sT]|$)/);
    if (!match) return '';
    const result = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
    const time = Date.parse(result + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === result ? result : '';
  }
  function dateOf(row, keys, numberKey) {
    for (const key of keys) { const value = day(row?.[key]); if (value) return value; }
    const number = text(row?.[numberKey]).match(/(?:^|\D)((?:19|20)\d{2})(\d{2})(\d{2})(?:\D|$)/);
    const encoded = number && day(number[1] + '-' + number[2] + '-' + number[3]);
    return encoded || day(row?.created_at) || day(row?.updated_at);
  }
  function sequence(value) {
    const match = text(value).match(/[-\u2010-\u2015\u2212](\d+)$/);
    return match ? match[1].replace(/^0+(?=\d)/, '') : '';
  }
  function compare(a, b, { dateKeys = ['issue_date'], numberKey = 'document_no', nameKey = '' } = {}) {
    const byDay = dateOf(b, dateKeys, numberKey).localeCompare(dateOf(a, dateKeys, numberKey));
    if (byDay) return byDay;
    const first = sequence(a?.[numberKey]), second = sequence(b?.[numberKey]);
    if (first !== second) {
      if (!first || !second) return first ? -1 : 1;
      if (first.length !== second.length) return second.length - first.length;
      const byNumber = second.localeCompare(first); if (byNumber) return byNumber;
    }
    return natural.compare(text(a?.[numberKey]), text(b?.[numberKey])) ||
      natural.compare(text(a?.[nameKey]), text(b?.[nameKey])) || natural.compare(text(a?.id), text(b?.id));
  }
  window.DF_CONTRACT_BOARD_ORDER = Object.freeze({ compare });
})();
