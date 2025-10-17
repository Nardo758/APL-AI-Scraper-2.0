// Minimal stub replacement for source-map-support used during tests.
// Provides the same public API used by the library but avoids heavy deps.
exports.install = function() { return {installed: true}; };
exports.uninstall = function() { return {uninstalled: true}; };
exports.wrapCallSite = function(cs) { return cs; };
