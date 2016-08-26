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
        files: {},
        index:{},
        ids:{},
        counter:0
    };


    function notifyDebounced() {
        clearTimeout(timeout);
        timeout = setTimeout(processQueue, 50);
    }

    function loadFile(fn) {
        console.log(fn);

        if (!path.fileExists(fn)) {
            var err='File not exists:' + fn;                  
            console.log(err);
            throw new Error(err);
        };
        try{
            files[fn] = fs.readFileSync(fn).toString();
            d=false;
        }catch(e){
            notifyDebounced();
        }  
    }

    function getFileByName(fn) {
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
        if(!used.files[fn]){
            used.index[fn]=used.counter;  
            used.ids[used.counter]=fn;
            used.counter++;         
            used.files[fn] = 1;
        }
        
        return {
            data:files[fn],
            id:'m'+used.index[fn].toString(36)
        }
    }
    // function getFileById(id) {
    //     var fn=used.ids[id];
    //     return {
    //         data:files[fn],
    //         id:used.index[fn].toString(36)
    //     }
    // }
    function isFileLoaded(fn) {
       // console.log("isFileLoaded",fn,fn in used.files);
        return fn in used.files;        
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
        used.index = {};
        used.ids = {};
        used.counter = 0;
    }

    function processQueue() {
        try {
            removeUnusedFiles();
            queue.reduce(function(p, c) {
                return c(p);
            }, {
                getFileByName:getFileByName,
               // getFileById:getFileById,
                isFileLoaded:isFileLoaded
            });
            console.log('--');
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