 var UglifyJS = require("uglify-js");

 function uglify(code) {
     return UglifyJS.minify(code, {
         fromString: true,
         mangle: true,
         compress: {
             sequences: true, // join consecutive statemets with the “comma operator”
             properties: true, // optimize property access: a["foo"] → a.foo
             dead_code: true, // discard unreachable code
             drop_debugger: true, // discard “debugger” statements
             unsafe: true, // some unsafe optimizations (see below)
             conditionals: true, // optimize if-s and conditional expressions
             comparisons: true, // optimize comparisons
             evaluate: true, // evaluate constant expressions
             booleans: true, // optimize boolean expressions
             loops: true, // optimize loops
             unused: true, // drop unused variables/functions
             hoist_funs: true, // hoist function declarations
             hoist_vars: true, // hoist variable declarations
             if_return: true, // optimize if-s followed by return/continue
             join_vars: true, // join var declarations
             cascade: true, // try to cascade `right` into `left` in sequences
             side_effects: true, // drop side-effect-free statements
             warnings: false // warn about potentially dangerous optimizations/code
         }
     }).code;
 }
 module.exports = function() {
     return function(files) {
         for (var fn in files) {
             if (fn.match(/\.js$/)) {
                 files[fn] = uglify(files[fn]);
             }
         }
         return files;
     };
 }