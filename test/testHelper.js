 
var DISTRIBUTION_NUM_ROLLS = 1000
function Distribution(die) {
    // roll dice a lot
    var hitsByValue = {};
    for (var i = 0; i < DISTRIBUTION_NUM_ROLLS; ++i) {
        var value = die.roll();
        hitsByValue[value] = (hitsByValue[value] || 0) + 1;
    }
    // copy values that actually got rolled
    var values = [];
    for (value in hitsByValue) {
        if (hitsByValue.hasOwnProperty(value)) {
            values[values.length] = value;
        }
    }
    // return the results
    return {
        min: values.reduce(Math.min), 
        max: values.reduce(Math.max),
        hitsFor: hitsByValue 
    };
}

