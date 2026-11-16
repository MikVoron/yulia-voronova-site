// Use the same copy as the browser, including the deployed sibling directory.
const fs = require('node:fs');
const path = require('node:path');
const deployed = path.resolve(__dirname, '../../smartplate-platform/collection-copy.js');
module.exports = require(fs.existsSync(deployed) ? deployed : '../../platform/collection-copy.js');
