'use strict';
var acorn = require('acorn');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var Path = require('./path');
var IndexedArray = require('./indexed-array');
var watch = require('./watch');
var vm = require('vm');
var moTransform = function(code) {
    return require("babel-core").transform(code, {
        plugins: ["mithril-objectify"]
    }).code;
};
var abs = require('absurd')();
//-----------------------------------------------
function Lst() {
    var m = {};
    return {
        exist: function(n) {
            return n in m;
        },
        get: function(n) {
            return m[n];
        },
        put: function(n, v) {
            m[n] = v;
        }
    };
};
//-----------------------------------------------
function addJsExt(fn) {
    return fn.match(/\.js$/) ? fn : (fn.match(/\/$/) ? fn + 'index' : fn) + '.js';
}
//-----------------------------------------------
function getRealPath(fn, basedir) {
    //  console.log(basedir,fn);
    return Path.relative('.', fn[0] === '.' ? Path.resolve(basedir, fn) : Path.normalize(require.resolve(fn)));
}
//-----------------------------------------------
function getCss(styles) {
    var css = styles.join('') //
    .replace(/[\r\n\t ]{2,}/g, ' ') //
    .replace(/([\{:,])[\r\n\t ]/g, '$1') //
    .replace(/[\r\n\t ]([\{:,])/g, '$1') //
    ;
    // css = postcss([autoprefixer]).process(css, {
    //     from: 'a.css',
    //     to: 'b.css'
    // }).css;
    return css;
}
//-----------------------------------------------
// function getModuleId(dep) {
//     return 'm' + dep.id;
// }
//-----------------------------------------------
function renderCss(styles) {
    var cd = getCss(styles);
    var css = JSON.stringify(cd);
    var d = ['var node = document.createElement("style");\n', //
        'node.innerHTML = ' + css + ';\n', //
        'document.head.appendChild(node);\n', //
    ].join('');
    return d;
}
//-----------------------------------------------
function renderJs(deps) {
    var r = deps.reduce(function(p, d, i) {
        if (d.typ == 'js') {
            p.push([ //
                d.id, //
                ':function(module,exports){\n', //
                '/*(',
                d.id, ') => ',
                d.fn, ' */\n', //
                d.code, //
                '\n}\n/*--------------------------------------*/\n'
            ].join(''));
        }
        return p;
    }, []);
    return [ //
        'var __modules_init__={},__require__ = (function() {\n', //
        '    var __modules__ = {};\n', //
        '    var __loading__ = {};\n', //
        '    return function(n) {\n', //
        '        if (!(n in __modules__)) {\n', //
        '            var x = {}, m = {\n', //
        '                    id: n,\n', //
        '                    exports: x\n', //
        '                };\n', //
        '            if(__loading__[n])throw new Error("Circular dep:"+n);\n', //
        '            __loading__[n] = 1;\n', //
        '            __modules_init__.m[n](m, x);\n', //
        '            __modules__[n] = m.exports;\n', //
        '            delete __loading__[n];\n', //
        '            delete m;\n', //
        '            delete __modules_init__.m[n];\n', //
        '        }\n', //
        '        return __modules__[n];\n', //
        '    }\n', //
        '})();\n', //
        '__modules_init__.m={\n', //
        r.join(','), //
        '};\n' //
    ].join('');
}
//-----------------------------------------------
function render(ctx, entryId) {
    return ['window.addEventListener("DOMContentLoaded",function(){\n', //
        renderJs(ctx.deps), //
        renderCss(ctx.styles), //
        //'(42,eval)("this").__require__=__require__;',//
        '__require__("', entryId, '");', //
        '});\n'].join('');
    // return [ //
    //     '(function(){\n', //
    //     renderCss(ctx.styles), //
    //     renderJs(ctx.deps), //
    //     '})()' //
    // ].join('');
}
//-------------------------------------
var allowedRequire = 'absurd'.split().reduce(function(p, c) {
    p[c]=1;
    return p;
}, {});

function myRequire(a) {
    if(!(a in allowedRequire)) throw Error('bad arg:'+a);
    return require(a);
}
//-------------------------------------
var emptyEx = //estraverse.VisitorOption.Remove;
{
    type: 'EmptyStatement'
};
//-------------------------------------
//--------------------------------------
var jTypes = Lst();

function commonTypeFn(args) {
    var fn = args.fn;
    var ctx = args.ctx;
    var opts = args.opts || {};
    var fn = opts.addJsExtFlag ? addJsExt(fn) : fn;
    var fn = getRealPath(fn, args.basedir);
    // if(opts.load_once){
    //     if(args.ctx.fileds.isFileLoaded(fn)){
    //         console.log('isFileLoaded');
    //         //return null;
    //     }
    //     console.log('not isFileLoaded', fn);
    // }
    var id = ctx.deps.index[fn];
    if (id >= 0) {
        return ctx.deps[id];
    }
    var file = ctx.fileds.getFileByName(fn);
    var data = file.data;
    if (opts.transformDataFn) {
        //   console.log('commonTypeFn.transformDataFn');
        data = opts.transformDataFn(data)
    }
    var newbasedir = Path.dirname(fn);
    var dep = {
        orgfn: args.fn,
        fn: fn,
        id: file.id,
        typ: 'js',
        basedir: newbasedir,
        data: data,
        ctx: ctx
    };
    ctx.deps.push(dep);
    // dep.name = getModuleId(dep);
    (opts.transformAstFn || transformJsAst)(dep);
    return dep;
}

function transformJsAst(dep) {
    dep.code = getTransformedJsCode(dep);
    dep.typ = 'js';
}
jTypes.put('js', function(args) {
    args.opts = {
        addJsExtFlag: true
    };
    return commonTypeFn(args);
});
jTypes.put('jsm', function(args) {
    args.opts = {
        transformDataFn: moTransform
    };
    return commonTypeFn(args);
});
jTypes.put('jss', function(args) {
    //console.log('jss',args.fn,args.ctx.inJss);
    if (args.ctx.inJss) {
        args.opts = {
            transformAstFn: function(dep) {
                dep.code = '';
                dep.typ = 'css';
            }
        };
    } else {
        args.opts = {
            transformAstFn: function(dep) {
                dep.typ = 'css';
                var ctx = {
                    inJss: true,
                    deps: new IndexedArray(function(v) {
                        return v.fn;
                    }),
                    styles: [],
                    fileds: dep.ctx.fileds
                };
                var cssdep = commonTypeFn({
                    ctx: ctx,
                    fn: args.fn,
                    basedir: args.basedir
                });
                //var code = getTransformedJsCode(dep);
                var code = renderJs(ctx.deps);
                var js = code + 'y=__require__(x)();';
                var sandbox = {
                    x: cssdep.id,
                    y: '',
                    require: myRequire
                };
                try {
                    vm.runInNewContext(js, sandbox, {
                        displayErrors: true,
                        timeout: 5000
                    });
                    var css = abs.add(sandbox.y).compile({
                        minify: true
                    });
                    args.ctx.styles.push(css);
                } catch (e) {
                    console.log(args.fn, e);
                    //  fs.writeFileSync('static/tmp.js', '/*' + args.fn + '*/\n' + js);
                    //throw e;
                    args.ctx.styles.push('/*' + e + '*/');
                }
                // console.log(sandbox.y);
            }
        };
    }
    return commonTypeFn(args);
});
//--------------------------------------
jTypes.put('css', function(args) {
    args.opts = {
        transformAstFn: function(dep) {
            dep.code = '';
            dep.typ = 'css';
            args.ctx.styles.push(dep.data);
        }
    };
    return commonTypeFn(args);
});
//--------------------------------------
function getDep(args) {
    //console.log('getDep',args.fn);
    var m = args.fn.match(/\.(\w+)$/);
    var ext = 'js';
    if (m) {
        var testext = m[1];
        if (jTypes.exist(testext)) {
            ext = testext;
        }
    }
    var r = jTypes.get(ext)(args);
    // if(r&&!r.typ){
    //     console.log(ext,args.fn);
    // }
    return r;
}
//--------------------------------------
var jsFns = Lst();
jsFns.put('require', function(args) {
    var dep = getDep(args);
    //console.log(d);
    if (dep) {
        if (dep.typ == 'js') {
            return {
                type: 'CallExpression',
                callee: {
                    type: 'Identifier',
                    name: '__require__'
                },
                arguments: [{
                    type: 'Literal',
                    value: dep.id
                }]
            };
        } else if (dep.typ == 'css') {} else {
            console.log('Empty  dep.typ:' + dep.typ, args.fn);
        }
    } else {
        console.log('Empty dep:' + args.fn);
    }
    return emptyEx;
});
jsFns.put('requireId', function(args) {
    var dep = getDep(args);
    if (dep) {
        return {
            type: 'Literal',
            value: dep.id
        };
    }
    throw new Error('Empty dep:' + dep);
    return emptyEx;
});
//-------------------------------------
function getTransformedJsCode(args) { //basedir, data, fn
    var basedir = args.basedir;
    var data = args.data;
    var fn = args.fn;
    var ast = acorn.parse(data, {
        ecmaVersion: 6
    });
    //   var hasExports = false;
    estraverse.replace(ast, {
        enter: function(node, parent) {
            if (node.type == 'CallExpression' //
                && node.callee.type == 'Identifier' //
            ) {
                //console.log(node.callee.name);
                if (jsFns.exist(node.callee.name) && node.arguments.length >= 1) {
                    // console.log(node.callee.name);
                    var a0 = node.arguments[0];
                    if (a0.type == 'Literal') {
                        if (!(a0.value in allowedRequire)) return jsFns.get(node.callee.name)({
                            ctx: args.ctx,
                            fn: a0.value,
                            basedir: basedir
                        });
                    }
                }
            }
        }
    });
    return escodegen.generate(ast);
}
//-------------------------------------
function compile(fileds, opts) {
    //--------------------------------------
    var ctx = {
        deps: new IndexedArray(function(v) {
            return v.fn;
        }),
        depsOrder: [],
        styles: [],
        fileds: fileds
    };
    var d = getDep({
        ctx: ctx,
        fn: opts.entry,
        basedir: Path.resolve('.')
    });
    var code = render(ctx, d.id);
    var ret = {};
    ret[opts.outFile] = code;
    return ret;
};
//-----------------------------------------------
var Compilator = function(opts) {
    return watch().pipe(function(fileds) {
        return compile(fileds, opts);
    });
};
module.exports = Compilator;