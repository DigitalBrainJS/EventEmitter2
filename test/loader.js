const fs = require('fs');
const path = require('path');
const assert = require('assert');

function importTests(root, filter) {
    const tests = {};

    function scanDir(currentDir, testEntry) {
        fs.readdirSync(currentDir).forEach(function (entry) {
            entry = path.resolve(currentDir, entry);
            const stats = fs.statSync(entry);
            const {name, ext} = path.parse(entry);
            const relativePath = path.relative(root, entry);
            if (filter && !filter(relativePath)) return;
            if (stats.isDirectory()) {
                return scanDir(entry, testEntry[name] || (testEntry[name] = {}));
            }
            ext === '.js' && (testEntry[name] = require(entry));
        });
    }

    scanDir(root, tests);

    function _import(tests) {
        Object.keys(tests).forEach(function (testName) {
            const test = tests[testName];
            const type = typeof test;
            if (type === 'object') {
                if (!type) {
                    return;
                }
                describe(testName, function () {
                    _import(test);
                })
            } else if (type === 'function') {
                const executor = function (done) {
                    if (!done) {
                        return test.call(this);
                    }
                    let count= 0, expectedCount;
                    const tests= [];

                    function wrap(fn) {
                        return function () {
                            count++;
                            tests.push([`       -${fn.name}(${Array.from(arguments).join(', ')})`]);
                            return fn.apply(null, arguments);
                        }
                    }

                    const testObj = Object.assign(function () {
                        return done.apply(this, arguments);
                    }, {
                        done: function (err) {
                            if (expectedCount !== undefined) {
                                if(count < expectedCount) {
                                    throw Error(`${count}/${expectedCount} assertions were done ${
                                        count ? ':\n' + tests.join('\n') : ''
                                    }`);
                                } else if (count > expectedCount) {
                                    throw Error(`Expected ${expectedCount} assertions, but ${count} were done`)
                                }
                            }
                            err ? done(err) : done();
                        },
                        expect: function (count) {
                            expectedCount = count;
                        }
                    });
                    Object.keys(assert).forEach(function(prop){
                       const value= assert[prop];
                       typeof value==='function' && (testObj[prop]= wrap(value));
                    });
                    return test.call(this, testObj);
                };
                it(testName, test.length ? executor : function () {
                    return executor.call(this, null);
                })
            } else {
                throw TypeError('expected an object or function');
            }
        })
    }
    _import(tests);
}

importTests('./test', function (path) {
    return !~['common.js', 'perf', 'test-loader.js'].indexOf(path);
});
