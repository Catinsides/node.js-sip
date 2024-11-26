class Logger {
  constructor() {
    this.errors = [];
    this.info = {};
  }

  log(text) {
    this.info[Date.now()] = text;
  }

  error(text) {
    this.error[Date.now()] = text;
  }
}

module.exports = Logger
