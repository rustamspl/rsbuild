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
var postcss = require('postcss');
var autoprefixer = require('autoprefixer');
//-----------------------------------------------
function addJsExt(fn) {
    return fn.match(/\.js$/g) ? fn : (fn.match(/\/$/g) ? fn + 'index' : fn) + '.js';
}
function getCss(styles){
     var css = styles.join('');
    css = postcss([autoprefixer]).process(css, {
        from: 'a.css',
        to: 'b.css'
    }).css;
    return css;
}
function render(styles, deps) {
   
    var css = JSON.stringify(getCss(styles));
    return [ //
        '(function(){\n', //
        'window.addEventListener("DOMContentLoaded",function(){\n', //
        'var node = document.createElement("style");\n', //
        'node.innerHTML = ' + css + ';\n', //
        'document.body.appendChild(node);\n', //
        '});\n', //
        'var __require__=Array(' + deps.length + ');[', //
        deps.map(function(d, i) {
            var m = ['\nfunction(module,exports){\n', //
                '/*(' + i + ') => ' + d.fn + ' */\n'
            ];
            m.push(d.code);
            m.push('\n}\n\n');
            return m.join('');
        }).join(','), '].map(function(d,i){\n', //
        'var exports={},m={exports:exports};\n', //
        'd(m,exports);\n', //
        '__require__[i]=m.exports;});\n', //
        '})()' //
    ].join('');
}
//-------------------------------------
function makeRequireNode(depId) {
    return {
        type: 'MemberExpression',
        object: {
            type: 'Identifier',
            name: '__require__'
        },
        property: {
            type: 'Literal',
            value: depId
        },
        computed: true
    };
}

function compile(getFile, opts) {
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

    function requireCss(basedir, fname) {
        var fn = Path.relative('.', Path.resolve(basedir, fname));
        var data = getFile(fn);
        styles.push(data);
    }

    function addDep(basedir, fname) {
        var fn = Path.relative('.', fname[0] === '.' ? Path.resolve(basedir, fname) : Path.normalize(require.resolve(fname)));
        fn = addJsExt(fn);
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
        var emptyEx = {
            type: 'EmptyStatement'
        };
        estraverse.replace(ast, {
            enter: function(node, parent) {
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
                            if (requirefn.match(/\.css/)) {
                                requireCss(basedir, requirefn);
                                return emptyEx;
                            } else
                            if (requirefn.match(/\.jsx/)) {
                                return makeRequireNode(addJsxDep(basedir, requirefn));
                            } else {
                                return makeRequireNode(addDep(basedir, requirefn));
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
    var entryId = addDep(Path.resolve('.'), opts.entry);
    var code = render(styles, deps);
    var res = babel.transform(code, {
        presets: "es2015",
        plugins: ["transform-object-assign"]
    });
    var ret = {};
    ret[opts.outName] = res.code;
    return ret;
};
//-----------------------------------------------
var Compilator = function(opts) {
    return watch().pipe(function(getFile) {
        return compile(getFile, opts);
    });
};
module.exports = Compilator;