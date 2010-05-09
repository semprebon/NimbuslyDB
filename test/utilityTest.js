var nimbusly;
if (nimbusly === undefined) { nimbusly = {}; }

nimbusly.utilityTests = function() {
    module("Utility Tests");
    
    var arr = [1, 5, 7];
    test('an array should reduce elements with adding function', 1, function() {
        var result = arr.reduce(function(a, b) { return a+b; });
        equal(result, 13);
    });
    test('an array should reduce elements with adding function and initial value', 1, function() {
        equal(arr.reduce(function(a, b) { return a+b; }, 2), 2 + 1 + 5 + 7);
    });
    test('an array should map elements with squaring function', 1, function() {
        var result = arr.map(function(a) { return a*a; });
        deepEqual(result, [1, 25, 49]);
    });
    test("an array should iterate through all elements", 1, function() {
      var total = 0;
      arr.each(function(val, i) { total += val*i; });
      equal(total, 1*0 + 5*1 + 7*2);
    });
    test("an array should find first element matching predicate", function() {
        equal(arr.find(function(val) { return val > 4; }), 5);
    });

    var array = [];
    test('an empty array should map elements with squaring function', function() {
        deepEqual(array.map(function(a) { return a*a; }), []);
    });
    test('an empty array should reduce elements with adding function', function() {
        strictEqual(array.reduce(function(a, b) { return a+b; }), undefined);
    });
    test('an empty array should reduce elements with adding function and initial value', function() {
        equal(array.reduce(function(a, b) { return a+b; }, 2), 2);
    });
    test("an empty array should iterate through 0 elements", function() {
        var total = 0;
        array.each(function(val) { total += val; });
        equal(total, 0);
    });
    test("an empty array should find no element matching predicate", function() {
        strictEqual(array.find(function(val) { return val > 4; }), undefined);
    });

    var hash_1 = { a: 1, b:2, c: 3};
    var hash_2 = { b: 10, d: 4 };
    var result = hash_1.merge(hash_2);
    test("two hashes when merged should have a's elements except where replaced by b", function() {
        equal(result['a'], 1);
        equal(result['c'], 3);
    });
    test("two hashes when merged should have b's elements", function() {
        equal(result['b'], 10);
        equal(result['d'], 4);
    });
    
    test("curry should curry function of 2 values to one of one value", function() {
        var add = function(a, b) { return a + b; };
        var f = add.curry(5);
        equal(f(3), 8);
    });
    test("curry should curry function of 3 values to one of 0 values", function() {
        var addTimes = function(a, b, c) { return (a + b)*c; };
        var f = addTimes.curry(5, 2, 5);
        equal(f(), 35);
    });
    
    test("andThen should sequence two functions", function() {
        var addParens = function() { s = "(" + s + ")"; };
        var append = function(suffix) { s = s + " " + suffix; };
        var f = addParens.andThen(append);
        var s = "a"; f("joe");
        equal(s, "(a) joe");
        var f = append.andThen(addParens);
        var s = "a"; f("dude");
        equal(s, "(a dude)");
    });
    
    test("compose should create a new function that is a result of passing result of first to second", function() {
        var addParens = function(s) { return s = "(" + s + ")"; };
        var appendPeriod = function(s) { return s = s + "."; };
        var f = addParens.compose(appendPeriod);
        equal(f("b"), "(b.)");
        var f = appendPeriod.compose(addParens);
        equal(f("hi"), "(hi).");
    });

    test("callBack should sequence two callback functions", function() {
        var lengthCallback = function(s, callback) { callback(s.length); };
        var xsCallback = function(n, callback) { 
            var s = ""; 
            for (var i = 0; i<n; ++i) { 
                s += 'x'; 
            }; 
            callback(s);
        };
        var f = lengthCallback.callsback(xsCallback);
        f("abc", function(result) {
            equal(result, "xxx");
        })
    });
    
    test("makeCallback should return a function that calls an object's method in the object context", function() {
        var  obj = { a: 'test' };
        obj.foo = function() { return this.a; }
        var f = obj.foo.makeCallback(obj);
        equal(f(), "test");
    });
    
};
