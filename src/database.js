// DbStore - Provides error handling and database initializations on top of HTML database API 
/*jslint white: false, onevar: false, plusplus: false, browser: true */
var openDatabase;

var nimbusly;
if (nimbusly === undefined) { nimbusly = {}; }

nimbusly.Migration = function(version, sql) {
    this.version = version;
    this.sql = sql;
};

nimbusly.TransactionLogger = function(database, name) {
    this.database = database;
    this.name = name || 'transaction';
    this.index = database.transactionIndex++;
    database.logger(this.index + ". " + this.name + " started");
};

nimbusly.TransactionLogger.prototype = (function() {
    var proto = {};
    
    /**
     * Log a message related to this loggers transaction
     */
    proto.logger = function(message) {
        this.database.logger(this.index + ".   " + message);
    };
    
    /**
     * Transaction callback to report action complete
     */
    proto.onTransactionComplete = function(message) {
        this.database.logger(this.index + ". " + this.name + " " + message);
    };
    
    /**
     * Wrap a transaction success callback to also log that the transaction has completed.
     */
    proto.callbackWrapper = function(callback) {
        var txLogger = this;
        return function() { 
            txLogger.onTransactionComplete("completed"); 
            if (callback) { callback.call(txLogger.database); }
        };
    };
    
    /**
     * Wrap a transaction error callback to also log that the transaction has failed.
     */
    proto.errorWrapper = function(callback) {
        var txLogger = this;
        return function() { 
            txLogger.onTransactionComplete("aborted");
            if (callback) { 
                callback.call(txLogger.database); 
            } else {
                this.onTransactionFailed();
            }
        };
    };
    
    /**
     * Default transaction failure error handler
     */
    proto.onTransactionFailed = function() {
        throw "Transaction failed: " + tx.index + " - " + tx.name;
    };
    
    /**
     * Handle a statement error.
     */
    proto.sqlErrorHandler = function(sql) {
        var txLogger = this;
        return function(tx, error) { 
            txLogger.logger("SQL Statement error on " + sql);
            txLogger.logger("  " + error.message)
        };
    };
    
    return proto;
}());

nimbusly.Database = function(databaseName, migrations, version) {
    this.migrations = migrations;
    this.databaseName = databaseName ? databaseName : "DroidDice";
    this.databaseDescription = databaseName;
    this.latestVersion = version || this.highestVersion();
    this.transactionIndex = 0;
    this.dbReady = false;
};

nimbusly.Database.prototype = (function() {
    var proto = {};
    
    var errors = [];

    proto.logger = function(message) {};
    
    proto.onTransactionFailed = function() {
        var error = new Error(errors.join('\n'));
        errors = [];
        throw error;
    };
    
    proto.versions = function() {
        return this.migrations.map(function(mig) { return mig.version; });
    };
    
    proto.highestVersion = function() {
        var vers = this.versions();
        var m = vers.reduce(Math.max);
        return m;
    };
    
    /**
     * Open the database, do any upgrade/initialization, then call the callback when it is ready to use
     */
    proto.open = function(callback, dropDataFlag) {
        this.onDatabaseReady = callback;
        this.db = openDatabase(this.databaseName, "", this.databaseDescription, 100000);
        if (!this.db) {
            throw new Error("Failed to open the database on disk: " + this.databaseName);
        }
        this.logger("Initial database version is " + this.db.version);
        if (dropDataFlag) {
            this.dropData(this.migrations);
        } else if (this.migrations) {
            this.upgradeDatabase();
        }
    };
    
    /**
     * Report an error; if only passed what, it will curry the result, returning a function that can be
     * passed in as a sql statement or transaction error callback. This assumes we always want to abort 
     * the transaction if an error occurred.
     */
    proto.saveError = function(what, error, txIndexOrError) {
        if (error === undefined) {
            var database = this;
            var txIndex = this.transactionIndex;
            return function(tx, error) {
                database.logger("error callback called! tx=" + tx + ", error=" + error); 
                if (error === undefined) {
                    error = txIndex;
                    tx = null;
                }
                database.logger('Error! ' + error);
                database.saveError(what, error, txIndex); 
                if (tx) {
                    return true;
                } 
            };
        } else {
            if (txIndexOfError !== undefined) {
                what = txIndexOfError + "." + what;
            }
            errors.push(what + ": " + error.message + " (" + error.code + ")");
            return true;
        }
    };
    
    /**
     * Run all migrations up to a given version
     */
    proto.runMigrationsInRange = function(tx, currentVersion, finalVersion, txLogger) {
        txLogger.logger("Migrating from " + currentVersion + " to " + finalVersion);
        for (var i = 0; i < this.migrations.length; ++i) {
            var migration = this.migrations[i];
            if (currentVersion < migration.version && migration.version <= finalVersion) {
                this.executeSqlInTransaction(tx, migration.sql, null, txLogger);
            }
        }
    };
    
    /**
     * upgrade the database to the latest version
     */
    proto.upgradeDatabase = function() {
        this.currentVersion = this.db.version ? this.db.version.to_i : 0;
        var txLogger = new nimbusly.TransactionLogger(this, "Upgrade Database");
        var database = this;
        this.db.changeVersion(this.db.version, String(this.latestVersion), 
            function(tx) {
                database.runMigrationsInRange(tx, database.currentVersion, database.latestVersion, txLogger);
                database.dbReady = true;
            }, 
            txLogger.errorWrapper(this.onTransactionFailed), 
            txLogger.callbackWrapper(this.onDatabaseReady));
    };

    /**
     * Restore the database to its initial state
     */
    proto.dropData = function(migrations) {
        this.logger("Dropping data and setting database back to initial state");
        var database = this;
        var dropTablesSql = [];
        this.executeSqlQuery(
            "SELECT name FROM sqlite_master WHERE type = 'table'",
            // success callback - save generated sql statements for transaction callback
            function(tx, results) {
                for (var i = 0; i < results.rows.length; ++i) {
                    var name = results.rows.item(i).name;
                    if (!(/(^__)|(^sqlite_)/i.test(name))) {
                        dropTablesSql.push(['DROP TABLE ' + name]);
                    }
                }
            },
            // transaction callback - run sql generated, then update database
            function() {
                var txLogger = new nimbusly.TransactionLogger(database, "Drop data");
                database.db.changeVersion(database.db.version, "", 
                    function(tx) {
                        if (dropTablesSql.length > 0) { 
                            database.executeSqlInTransaction(tx, dropTablesSql, null, txLogger);
                        }
                    }, 
                    txLogger.errorWrapper(database.onTransactionFailed), 
                    txLogger.callbackWrapper(database.upgradeDatabase));
            });
    };

    /**
     * Executes some sql in the context of the given transaction. If successful, the callback is called
     * with the results. If an error occurs, it is reported through reportError.
     *
     * params sql a function function(tx) or string containing sql statement
     * params callback must be function(tx, results)
     */
    proto.executeSqlInTransaction = function(tx, sql, callback, txLogger) {
        var database = this;
        sql = this.normalizeSql(sql);
        sql.each(function(statement_with_params, i) {
            var statement = statement_with_params[0];
            var params = statement_with_params.slice(1);
            if (txLogger) {
                txLogger.logger(statement + " with (" + params + ") - (" + (callback ? callback.name : "") + ")");
            }
            tx.executeSql(statement, params, callback, txLogger.sqlErrorHandler(sql));
        });
    };
    
    /**
     * Convert incomming sql into array: [[sql1, params...], [sql2, params...], ...]
     *
     * param sql can be a string, an array of the form [stement, param, ...], or an array of arrays
     *   [sql, ...] where each sql is either a string or an array
     */
    proto.normalizeSql = function(sql) {
        if (!(sql instanceof Array)) { 
            return [[sql]]; 
        } else if (!(sql[0] instanceof Array)) { 
            return [sql]; 
        } else {
            return sql;
        }
    };
    
    /**
     * Executes a single SQL statement or function containing statememts in their own transaction. If succesful,
     * the callback, if any, is called with the results.
     */
    proto.executeSqlUpdate = function(sql, callback) {
        var txLogger = new nimbusly.TransactionLogger(this);
        var database = this;
        this.db.transaction(
            function(tx) {
                database.executeSqlInTransaction(tx, sql, null, txLogger); 
            }, 
            txLogger.errorWrapper(),
            txLogger.callbackWrapper(callback)
        );
    };
    
    
    /**
     * Executes a single SQL statement in its own transaction. If succesful, the callback, if any, is called with the rowid 
     * of the inserted record.
     */
    proto.executeSqlInsert = function(sql, callback) {
        var txLogger = new nimbusly.TransactionLogger(this);
        var rowids = [];
        var database = this;
        this.db.transaction(
            function(tx) { 
                database.executeSqlInTransaction(tx, sql, 
                    function(tx) {
                        database.executeSqlInTransaction(tx, [["SELECT last_insert_rowid() AS id"]], 
                            function(tx, result) {
                                rowids.push(result.rows.item(0).id);
                            }, txLogger);
                        
                    }, txLogger); 
            }, 
            this.saveError(sql), 
            txLogger.callbackWrapper(
                function() {
                    callback((sql instanceof Array && sql[0] instanceof Array) ? rowids : rowids[0]);
                }));
    };
    
    /**
     * Convert our query callback (function(rows)) into a Database API SQLStatementCallback (function(tx, result)).
     */
    proto.queryCallbackWrapper = function(callback) {
        // If we arelady have a SQLStatementCallback, don't wrap it
        if (callback.length === 2) {
            return callback;
        }
        return function(tx, result) {
             var rows = [];
             for (var i = 0; i < result.rows.length; ++i) {
                 rows.push(result.rows.item(i));
             }
             callback(rows);
        };
    };
    
    /**
     * Executes a single SQL statement or function containing statememts in their own read-only transaction. 
     * If succesful, the callback, if any, is called with the results.
     */
    proto.executeSqlQuery = function(sql, callback, transactionCallback) {
        var txLogger = new nimbusly.TransactionLogger(this);
        var database = this;
        this.db.transaction(
            function(tx) { 
                database.executeSqlInTransaction(tx, sql, database.queryCallbackWrapper(callback), txLogger); 
            }, 
            txLogger.errorWrapper(database.onTransactionFailed), 
            txLogger.callbackWrapper(transactionCallback));
    };
        
    return proto;
}());


