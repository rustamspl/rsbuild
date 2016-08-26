var path = require('./path');
var fs = require('fs');
var autoreloadjs = fs.readFileSync(__dirname + '/autoreload.js');
module.exports = function(app, route) {
    var s = {
        files: {},
        notify: function() {
            while (s.cbs.length > 0) {
                try {
                    s.cbs.pop()();
                } catch (e) {}
            }
        },
        cbs: [],
        reg: function(cb) {
            s.cbs.push(cb);
        }
    };
    app.get('/autoreloademitter', function(req, res) {
        s.reg(function() {
            res.end();
        });
    });
    // app.get('/autoreloadscript', function(req, res) {      
    //     res.end(autoreloadjs);        
    // });
    app.get(route, function(req, res) {
        // res.send('/a/');
        var fn = req.originalUrl.replace(/^\//, '');
        if (fn in s.files) {
            res.end(autoreloadjs+s.files[fn]);
         
        }
    });
    return function(files) {
        s.files = files;
        s.notify();
        // for (var fn in files) {
        //     console.log("fn:", fn);
        //     // var fpath = path.join(dst, fn);
        //     // var dirpath = path.dirname(fpath);            
        //     // path.mkdirSyncRecursive(dirpath);
        //     // fs.writeFile(fpath, files[fn]);
        // }
        return files;
    };
}