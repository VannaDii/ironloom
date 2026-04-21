'use strict';

if (typeof globalThis.DOMException !== 'function') {
  throw new Error(
    'This runtime does not provide a native DOMException implementation.',
  );
}

module.exports = globalThis.DOMException;
