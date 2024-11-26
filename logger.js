const debug = require('debug');

const APP_NAME = 'node.js-sip';

const enableDebug = process.env.DEBUG;

class Logger {
  _info;
  _debug;
  _warn;
  _error;

  constructor(prefix) {
    if (prefix) {
      this._debug = debug.default(`${APP_NAME}:${prefix}`);
      this._info = debug.default(`${APP_NAME}:INFO:${prefix}`);
      this._warn = debug.default(`${APP_NAME}:WARN:${prefix}`);
      this._error = debug.default(`${APP_NAME}:ERROR:${prefix}`);
    }
    else {
      this._debug = debug.default(APP_NAME);
      this._info = debug.default(`${APP_NAME}:INFO`);
      this._warn = debug.default(`${APP_NAME}:WARN`);
      this._error = debug.default(`${APP_NAME}:ERROR`);
    }
    /* eslint-disable no-console */
    this._info.log = console.info.bind(console);
    this._debug.log = console.info.bind(console);
    this._warn.log = console.warn.bind(console);
    this._error.log = console.error.bind(console);
    /* eslint-enable no-console */

    if (enableDebug) {
      debug.enable(`${APP_NAME}:*`);
    } else {
      debug.disable();
    }
  }

  get info() {
    return this._info;
  }

  get debug() {
    return this._debug;
  }

  get warn() {
    return this._warn;
  }

  get error() {
    return this._error;
  }

  get i() {
    return this._info;
  }

  get d() {
    return this._debug;
  }

  get w() {
    return this._warn;
  }

  get e() {
    return this._error;
  }
}

module.exports = Logger;
