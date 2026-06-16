'use strict';

const yaml = require('js-yaml-upstream');

module.exports = {
  ...yaml,
  safeLoad: yaml.load,
  safeLoadAll: yaml.loadAll,
  safeDump: yaml.dump,
};
