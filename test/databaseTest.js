var nimbusly;
if (nimbusly === undefined) { nimbusly = {}; }

nimbusly.databaseTests = function() {
    var migrations = [
        new nimbusly.Migration(1, "CREATE TABLE TestData (id REAL UNIQUE, value TEXT)"),
    ];
    module("Database Unit Tests", {
        setup: function() {
            var database = new nimbusly.Database("DbTest", migrations);
            database.logger = function(msg) { console.log(msg); };
            database.logger("Testing@!");
            nimbusly.databaseTests.database = database;
        }
    });
    
    asyncTest("A stored value can be retrieved", 1, function() {
        var database = nimbusly.databaseTests.database;
        
        var onDatabaseReady = function() {
        	database.executeSqlInsert(["INSERT INTO TestData (id, value) VALUES (1, ?)", "Testing"],
        	    function (id) {
                	database.executeSqlQuery(["SELECT value FROM TestData WHERE id = ?", id], 
                	    function (rows) {
                	        equals(rows[0].value, "Testing", "Value selected be 'Testing'");
                            start();
                	    }
                	);
                }
            );
            
        }
        
        database.open(onDatabaseReady, true);
        stop();
    });
    
    asyncTest("A Stored Value Can Be Updated", 1, function() {
        var database = nimbusly.databaseTests.database;
        
        var onDatabaseReady = function() {
        	database.executeSqlInsert("INSERT INTO TestData (id, value) VALUES (1, 'Testing')",
        	    function (id) {
                	database.executeSqlUpdate(["UPDATE TestData SET value = 'XYZZY' WHERE id = ?", id], 
                	    function () {
                	        database.executeSqlQuery(["SELECT value FROM TestData WHERE id = ?", id], 
                        	    function (rows) {
                        	        equals(rows[0].value, "XYZZY", "Value selected should be new value");
                                    start();
                        	    }
                        	);
                	    }
                	);
                }
            );
        }
        
        database.open(onDatabaseReady, true);
        stop();
    });
};