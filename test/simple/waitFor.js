var simpleEvents = require('nodeunit').testCase;
var file = '../../lib/eventemitter2';
var EventEmitter2;

if (typeof require !== 'undefined') {
    EventEmitter2 = require(file).EventEmitter2;
} else {
    EventEmitter2 = window.EventEmitter2;
}

module.exports = simpleEvents({
    '1. should return thenable object that resolves when an event occurs': function (test) {
        var emitter = new EventEmitter2({verbose: true});

        var thenable = emitter.waitFor('foo');

        test.ok(typeof thenable.then === 'function', 'then method missing');
        test.ok(typeof thenable.cancel === 'function', 'cancel method missing');

        var timestamp;

        thenable.then(function (data) {
            if (Date.now() - timestamp < 0) {
                throw Error('premature resolving');
            }
            test.equal(data.length, 2);
            test.equal(data[0], 1);
            test.equal(data[1], 2);
            test.done();
        }, function (err) {
            throw err;
        });

        setTimeout(function () {
            timestamp = Date.now();
            emitter.emit('foo', 1, 2);
        }, 50);
    },

    '2. should reject thenable if timeout': function (test) {
        var emitter = new EventEmitter2({verbose: true});
        var timestamp = Date.now();
        emitter.waitFor('foo', {
            timeout: 50
        }).then(function () {
            throw Error('Unexpected promise resolving');
        }, function (err) {
            if (Date.now() - timestamp < 0) {
                throw Error('premature rejecting');
            }
            test.ok(err instanceof Error);
            test.equal(err.message, 'timeout');
            test.done();
        });
    },

    '3. should reject thenable if cancel method was called': function (test) {
        var emitter = new EventEmitter2({verbose: true});
        var timestamp;
        var thenable = emitter.waitFor('foo');

        thenable.then(function () {
            throw Error('Unexpected promise resolving');
        }, function (err) {
            if (Date.now() - timestamp < 0) {
                throw Error('premature rejecting');
            }
            test.ok(err instanceof Error);
            test.equal(err.message, 'canceled');
            test.done();
        });

        setTimeout(function () {
            timestamp = Date.now();
            thenable.cancel();
        }, 50);
    },

    '4. should handle an error when handleError option is used': function (test) {
        var emitter = new EventEmitter2({verbose: true});

        emitter.waitFor('foo', {
            handleError: true
        }).then(function (data) {
            test.equal(data.length, 2);
            test.equal(data[0], 1);
            test.equal(data[1], 2);
            test.done();
        }, function (err) {
            throw err;
        });

        emitter.emit('foo', null, 1, 2)
    },

    '5. should able to filter event by data using the filter callback option': function (test) {
        var emitter = new EventEmitter2({verbose: true});

        emitter.waitFor('foo', {
            filter: function (arg0) {
                return arg0 === 2;
            },
            timeout: 50
        }).then(function (data) {
            test.equal(data[0], 2);
            test.done();
        }, function (err) {
            throw err;
        });

        emitter.emit('foo', 1);
        emitter.emit('foo', 2);
    }
});
