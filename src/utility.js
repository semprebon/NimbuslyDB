// Various utility methods, primary for easy of functionals programming
/*jslint white: false, onevar: false, plusplus: false */

var nimbusly;
if (nimbusly === undefined) { nimbusly = {}; }

/**
 * Apply a method to each member of an array
 * 
 * @param f - A function taking a single value and returning a value
 */
Array.prototype.each = function(f) {
    for (var i = 0; i < this.length; ++i) {
        f(this[i], i);
    }
};

Array.prototype.find = function(match) {
    for (var i = 0; i < this.length; ++i) {
        if (match(this[i])) {
            return this[i];
        }
    }
};

Array.prototype.map = function(f) {
    var result = new Array(this.length);
    for (var i = 0; i < this.length; ++i) {
        result[i] = f(this[i]);
    }
    return result;
};

/**
 * Apply a method to initial and the first value of the array, then to the result and the second, and
 * so on. For example, to sum the array, you could use:
 * 
 * [1, 4, 7].reduce(function(a,b) { return a+b }, 0)
 * 
 * @param op function to apply. It should take two parameters
 * @param initial Initial value. If left out, it won't be used
 */
Array.prototype.reduce = function(op, initialValue) {
    var result = initialValue;
    var start = 0;
    if (!result) {
        if (this.length === 0) {
            return undefined;
        }
        result = this[0];
        start = 1;
    }
    for (var i = start; i < this.length; ++i) {
        result = op(result, this[i]);
    }
    return result;
};

Object.prototype.merge_in = function(hash) {
    for (var prop in hash) {
        if (hash.hasOwnProperty(prop)) {
            this[prop] = hash[prop];
        }
    }
    return this;
};

Object.prototype.merge = function(hash) {
    var result = {};
    result.merge_in(this).merge_in(hash);
    return result;
};

Function.prototype.curry = function() {
    var f = this;
    var appendArgs = function(a, b) {
        for (var i = 0; i < b.length; ++i) {
            a.push(b[i]);
        }
        return a;
    };
    var concatArgs = function(a, b) { 
        return appendArgs(appendArgs([], a), b); 
    };
    var curriedArgs = arguments;
    return function() { 
        return f.apply(this, concatArgs(curriedArgs, arguments)); 
    };
};

Function.prototype.andThen = function(g) {
    var f = this;
    return function() { f.apply(this, arguments); g.apply(this, arguments); };
};

Function.prototype.compose = function(g) {
    var f = this;
    return function() { return f(g.apply(this, arguments)); };
};

/**
 * Given a function f(args.., callback), and a function g(args.., callback), f.callsback(g)
 * will return a new function h(arg.., callback), that combines the calls to f and g.
 */
Function.prototype.callsback = function(g) {
    toArray = function(args) {
        var result = [];
        for (var i = 0; i < args.length; ++i) {
            result.push(args[i]);
        }
        return result;
    };

    var f = this;
    return function() {
        var callback = arguments[arguments.length-1]; 
        var gCallback = function() { 
            var newArgs = toArray(arguments);
            newArgs.push(callback);
            g.apply(this, newArgs); 
        };
        var args = toArray(arguments).slice(0, -1);
        args.push(gCallback);        
        return f.apply(this, args); 
    }
}

/**
 * Generate a random integer between 0 and max-1
 */
Math.randomInt = function(limit) {
    return Math.floor(Math.random() * limit);
};

/**
 * Method to convert a list of functions into a has to return as a prototype object
 */
nimbusly.log = function(message) {
//    console.log(message);
};

/**
 * Converts an object and method anme into a callback that will run the method in the context to the object
 */
Function.prototype.makeCallback = function(obj) {
    var method = this;
    return function() { return method.apply(obj, arguments); }
};

