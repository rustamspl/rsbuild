'use strict';
var P = function() {
    this.push = function(v) {
        this.index[this._getField(v)] = this.length;
        return Array.prototype.push.call(this, v);
    };
    this.get = function(k) {
        var i = this.index[k];
        if (i >= 0) {
            return this[i];
        }
    }
};
P.prototype = new Array;
var IndexedArray = function(getField) {
    this._getField = getField;
    this.index = {};
};
IndexedArray.prototype = new P();
module.exports = IndexedArray;
//test
// var m = new IndexedArray(function(a) {
//     return a.fn;
// });
// m.push({
//     fn: 'aaa'
// });
// m.push({
//     fn: 'bbb'
// });
// console.log(m.get('bbb'));
// console.log(m);
// console.log(m.length);
// m.map(function(v,i){
//     console.log(v,i);
// });