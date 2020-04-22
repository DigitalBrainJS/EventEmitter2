var assert= require('assert');
var file = '../../lib/eventemitter2';
var EventEmitter2;

if (typeof require !== 'undefined') {
    EventEmitter2 = require(file).EventEmitter2;
} else {
    EventEmitter2 = window.EventEmitter2;
}

module.exports = {
    '1. should support wrapping handler to an async listener': function (done) {
        var ee= new EventEmitter2();
        var counter= 0;
        var f= function(x){
            assert.equal(x, 123);
            counter++;
        };
        ee.on('test', f, false);
        assert.equal(ee.listenerCount(), 1);
        ee.emit('test', 123);
        setTimeout(function(){
            assert.equal(counter, 1);
            debugger;
            ee.off('test', f);
            assert.equal(ee.listenerCount(), 0);
            done();
        }, 25);
    }
};
