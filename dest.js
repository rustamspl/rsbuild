var path = require('./path');
var fs = require('fs');
module.exports = function(dst) {
    return function(files) {
        for (var fn in files) {
            var fpath = path.join(dst, fn);
            var dirpath = path.dirname(fpath);            
            path.mkdirSyncRecursive(dirpath);
            fs.writeFile(fpath, files[fn]);
        }
        return files;
    };
}