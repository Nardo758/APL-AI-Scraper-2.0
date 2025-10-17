// Local wrapper to re-export the official jest-circus runner.
// This indirection can help bypass validation/path issues on some platforms.
module.exports = require('jest-circus/runner');
