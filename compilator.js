'use strict';
var acorn = require('acorn');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var Path = require('./path');
var IndexedArray = require('./indexed-array');
var sass = require('node-sass');
var watch = require('./watch');
//-----------------------------------------------
function addJsExt(fn) {
    return fn.match(/\.js$/g) ? fn : fn + '.js';
}

function compile(getFile, entry) {
    var styles = [];
    var deps = new IndexedArray(function(v) {
        return v.fn;
    });

    function requireScss(base, fname) {
        var fn = Path.relative('.', Path.resolve(base, fname));
        var data = getFile(fn);
        var result = sass.renderSync({
            data: data,
            importer: function(url, prev) {
                console.log(url);
            },
            outputStyle: 'compressed'
        });
        styles.push(result.css.toString());
    }

    function addDep(base, fname) {
        var fn = Path.relative('.', Path.resolve(base, fname));
        var id = deps.index[fn];
        if (id >= 0) {
            return id;
        }
        return deps.push(getCode(fn)) - 1;
    }
    //-------------------------------------
    function getCode(fn) {
        var data = getFile(fn);
        var ast = acorn.parse(data);
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
                                requireScss(Path.dirname(fn), requirefn);
                                return emptyEx;
                            }
                            var jsfn = addJsExt(requirefn);
                            a0.value = addDep(Path.dirname(fn), jsfn);
                            node.callee.name = '__require__';
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
        console.log(styles);
        return [ //
            ';document.addEventListener("DOMContentLoaded",function(){\n', //
            'var node = document.createElement("style");\n', //
            'node.innerHTML = ' + JSON.stringify(styles.join('')) + ';\n', //
            'document.getElementsByTagName("head")[0].appendChild(node);\n', //
            '})\n', //
            ';(function(){\n', //
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
    return {
        'js/out.js': code
    };
};
//-----------------------------------------------
var Compilator = function(entry) {
    return watch().pipe(function(getFile) {
        return compile(getFile, entry);
    });
};
module.exports = Compilator;