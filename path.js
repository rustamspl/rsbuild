'use strict';
var org_path = require('path');
var fs = require('fs');
var f = function() {};
f.prototype = org_path;
var path = new f();
'resolve,normalize,relative,join'.split(',').map(function(k) {
    path[k] = function() {
        return org_path[k].apply(this, arguments).replace(/\\/g, '/').toLowerCase();
    };
    path.dirExists = function(dirpath) {
        try {
            return fs.statSync(dirpath).isDirectory();
        } catch (err) {
            return false;
        }
    };
    path.fileExists = function(filepath) {
        try {
            return fs.statSync(filepath).isFile();
        } catch (err) {
            return false;
        }
    };
    path.mkdirSyncRecursive = function(dirpath) {
        if (!path.dirExists(dirpath)) {
            path.mkdirSyncRecursive(path.dirname(dirpath));
            fs.mkdirSync(dirpath);
        }
    };
});
module.exports = path;