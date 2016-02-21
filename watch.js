'use strict';
var fs = require('fs');
var path = require('./path');

function dumpError(err) {
    if (typeof err === 'object') {
        if (err.message) {
            console.log('\nMessage: ' + err.message)
        }
        if (err.stack) {
            console.log('\nStacktrace:')
            console.log('====================')
            console.log(err.stack);
        }
    } else {
        console.log('dumpError :: argument is not an object:', err);
    }
}
var Watch = function() {
    var files = {};
    var watchers = {};
    var queue = [];
    var timeout = null;
    var used = {
        files: {}
    };

    function notifyDebounced() {
        clearTimeout(timeout);
        timeout = setTimeout(processQueue, 50);
    }

    function loadFile(fn) {
        if (!path.fileExists(fn)) {
            var err = 'File not exists:' + fn;
            console.log(err);
            throw err;
        };
        files[fn] = fs.readFileSync(fn).toString();
    }

    function getFile(fn) {
        if (!(fn in files)) {
            loadFile(fn);
        }
        if (!(fn in watchers)) {
            watchers[fn] = fs.watch(fn, function(evt, evtfn) {
                if (evt === 'change') {
                    loadFile(fn);
                    notifyDebounced();
                }
            });
        }
        used.files[fn] = 1;
        return files[fn];
    }

    function removeUnusedFiles() {
        for (var fn in watchers) {
            if (!(fn in used.files)) {
                watchers[fn].close();
                delete watchers[fn];
                delete files[fn];
            }
        }
        used.files = {};
    }

    function processQueue() {
        try {
            removeUnusedFiles();
            queue.reduce(function(p, c) {
                return c(p);
            }, getFile);
        } catch (e) {
            dumpError(e)
        }
    }
    process.nextTick(processQueue);
    return {
        pipe: function(cb) {
            queue.push(cb);
            return this;
        }
    };
};
module.exports = Watch;