'use strict';
var acorn = require('acorn');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var Path = require('./path');
var IndexedArray = require('./indexed-array');
var sass = require('node-sass');
var watch = require('./watch');
var msx = require('msx');
var babel = require('babel-core');
//-----------------------------------------------
function addJsExt(fn) {
    return fn.match(/\.js$/g) ? fn : (fn.match(/\/$/g) ? fn + 'index' : fn) + '.js';
}

function compile(getFile, entry, outName) {
    var styles = [];
    var deps = new IndexedArray(function(v) {
        return v.fn;
    });

    function importScss(entryScss) {
        return function(url, prev) {
            var base = Path.dirname(prev == 'stdin' ? entryScss : prev);
            var fn = url.match(/\.scss$/g) ? url : url + '.scss';
            fn = Path.relative('.', Path.resolve(base, fn));
            var data = getFile(fn);
            return {
                contents: data
            };
        };
    }

    function requireScss(basedir, fname) {
        var fn = Path.relative('.', Path.resolve(basedir, fname));
        var data = getFile(fn);
        var result = sass.renderSync({
            data: data,
            importer: importScss(fn),
            outputStyle: 'compressed'
        });
        styles.push(result.css.toString());
    }

    function addDep(basedir, fname) {
        var fn = Path.relative('.', Path.resolve(basedir, fname));
        var id = deps.index[fn];
        if (id >= 0) {
            return id;
        }
        var data = getFile(fn);
        var newbasedir = Path.dirname(fn);
        return deps.push(getCode(newbasedir, data, fn)) - 1;
    }

    function addJsxDep(basedir, fname) {
        var fn = Path.relative('.', Path.resolve(basedir, fname));
        var id = deps.index[fn];
        if (id >= 0) {
            return id;
        }
        var jsxdata = getFile(fn);
        var data = msx.transform(jsxdata, {
            harmony: true
        });
        //console.log(data);
        var newbasedir = Path.dirname(fn);
        return deps.push(getCode(newbasedir, data, fn)) - 1;
    }
    //-------------------------------------
    function getCode(basedir, data, fn) {
        var ast = acorn.parse(data, {
            ecmaVersion: 6
        });
        var hasExports = false;
        //-------------
        var ret = {
            type: 'Identifier',
            name: '__return__'
        };
        var emptyEx = {
            type: 'EmptyStatement'
        };
        estraverse.replace(ast, {
            enter: function(node, parent) {
                if (node.type == 'MemberExpression' //
                    && node.object.type == 'Identifier' //
                    && node.object.name == 'module' //
                    && node.property.type == 'Identifier' //
                    && node.property.name == 'exports' //
                ) {
                    hasExports = true;
                    return ret;
                } else
                if (node.type == 'CallExpression' //
                    && node.callee.type == 'Identifier' //
                    && node.callee.name == 'require' //
                ) {
                    if (node.arguments.length >= 1) {
                        var a0 = node.arguments[0];
                        if (a0.type == 'Literal') {
                            var requirefn = a0.value;
                            if (requirefn.match(/\.scss/)) {
                                requireScss(basedir, requirefn);
                                return emptyEx;
                            } else
                            if (requirefn.match(/\.jsx/)) {
                                a0.value = addJsxDep(basedir, requirefn);
                                node.callee.name = '__require__';
                            } else {
                                var jsfn = addJsExt(requirefn);
                                a0.value = addDep(basedir, jsfn);
                                node.callee.name = '__require__';
                            }
                        }
                    }
                }
            }
        });
        var code = escodegen.generate(ast);
        return {
            hasExports: hasExports,
            code: code,
            fn: fn
        }
    }
    var entryFn = addJsExt(entry);
    var entryId = addDep(Path.resolve('.'), entryFn);

    function render() {
        return [ //           
            '(function(){\n', //
            'document.addEventListener("DOMContentLoaded",function(){\n', //
            'var node = document.createElement("style");\n', //
            'node.innerHTML = ' + JSON.stringify(styles.join('')) + ';\n', //
            'document.getElementsByTagName("head")[0].appendChild(node);\n', //
            '});\n', //
            'var __require__=function(id){return __require__deps[id];};\n', //
            'var __require__deps=[', //
            deps.map(function(d, i) {
                var m = ['\nfunction(){\n', //
                    '/*(' + i + ') => ' + d.fn + ' */\n'
                ];
                d.hasExports && m.push('var __return__;\n');
                m.push(d.code);
                d.hasExports && m.push(';return __return__;\n');
                m.push('\n}\n\n');
                return m.join('');
            }).join(','), '];\n', //
            '__require__(' + entryId + ')();})()' //
        ].join('');
    }
    var code = render();
    var res = babel.transform(code, {
        presets: "es2015",
        plugins: ["transform-object-assign"]
    });
    var ret = {};
    ret[outName] = res.code;
    return ret;
};
//-----------------------------------------------
var Compilator = function(entry, outName) {
    return watch().pipe(function(getFile) {
        return compile(getFile, entry, outName);
    });
};
module.exports = Compilator;