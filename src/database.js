/**
 * @fileoverview Provides error handling and database initializations on top of HTML database API 
 * @author <a href="mailto:semprebon@gmail.com">Andrew Semprebon</a>
 * @version 1.0
 */
/*jslint white: false, onevar: false, plusplus: false, browser: true */
var openDatabase;

/**
 * @namespace NimbuslyDB namespace
 */
var nimbusly;
if (nimbusly === undefined) { nimbusly = {}; }

/**
 * A simple class for storing migrations.
 *
 * A migration object holds the SQL needed to upgrade the database from one version to the next. An
 * array of migrations is passed to the database when it is opened, and defined the order in which
 * the versions come. This way, if you upgrade the software on the server,users with older versions
 * will have their local databases automatically updated to the new database schema, regardless of
 * what version they are on.
 *
 * The version numbers should normally start at one for the first version, and increment with each
 * specific database change released. For example:
 * <code>
 * var migrations = [
 *   nimbusly.Migration(1, "CREATE TABLE users (id REAL UNIQUE, name TEXT, password TEXT)"),
 *   nimbusly.Migration(2, "ALTER TABLE users ADD COLUMN email TEXT"),
 *   nimbusly.Migration(3, [
 *      "CREATE TABLE user_emails (id REAL UNIQUE, user_id REAL, name TEXT, email TEXT"),
 *      "INSERT INTO user_mails (id, user_id, name, email) SELECT id, id, 'main', email FROM users",
 * ]
 * </code>
 *
 * @class
 * @param {Number} version version of the database this migration will upgrade to
 * @param {String|String[]|String[][]} sql one or more sql statements to migrate the database
 *
 * @see nimbusly.Database
 */
nimbusly.Migration = function(version, sql) {
    this.version = version;
    this.sql = sql;
};

/**
 * TransactionLogger is used to format error messages in a standard way. 
 *
 * It is mainly used internally to handle logging
 *
 * @private
 * @constructor
 * @param database the database this TransactionLogger is for
 * @param name name of TransactionLogger displayed in log
 */
nimbusly.TransactionLogger = function(database, name) {
    this.database = database;
    this.name = name || 'transaction';
    this.index = database.transactionIndex++;
    database.logger(this.index + ". " + this.name + " started");
};

nimbusly.TransactionLogger.prototype = (function() {
    /**#@+
     * @memberOf nimbusly.TransactionLogger.prototype
     */
     
    var proto = {};
    
    /**
     * Log a message related to this loggers transaction
     * 
     * @name nimbusly.TransactionLogger.logger
     * @param {String} message message to send to logger
     */
    proto.logger = function(message) {
        this.database.logger(this.index + ".   " + message);
    };
    
    /**
     * Transaction callback to report action complete
     *
     * @name nimbusly.TransactionLogger.logger
     * @memberOf nimbusly.TransactionLogger
     * @param {String} message message to send to logger
     */
    proto.onTransactionComplete = function(message) {
        this.database.logger(this.index + ". " + this.name + " " + message);
    };
    
    /**
     * Wrap a transaction success callback to also log that the transaction has completed.
     *
     * @private
     * @memberOf nimbusly.TransactionLogger
     * @param {Function} [callback] function to call when we have logged the transaction
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
     *
     * @private
     * @memberOf nimbusly.TransactionLogger
     * @param {Function|null} callback function to call when we have logged the failure
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
     *
     * @private
     * @memberOf nimbusly.TransactionLogger
     */
    proto.onTransactionFailed = function() {
        throw "Transaction failed: " + tx.index + " - " + tx.name;
    };
    
    /**
     * Handle a statement error.
     *
     * @private
     * @memberOf nimbusly.TransactionLogger
     * @param {String} sql reports an error on sql statement
     */
    proto.sqlErrorHandler = function(sql) {
        var txLogger = this;
        return function(tx, error) { 
            txLogger.logger("SQL Statement error on " + sql);
            txLogger.logger("  " + error.message)
        };
    };
    /**#@-*/
    return proto;
}());

/**
 * HTML5 Database wrapper class
 * <pre>
 *  var db = nimbus.Database.new('mydb', migrations);
 * </pre>
 *
 * Most of the methods in this class can accept SQL in a number of different formats:
 * <ol>
 *  <li>String - a simple string contaning SQL
 *  <li>Array - a sql statement, followed by a list of paramters
 *  <li>Array of arrays - an array of sql statements with parameters, to be executed as a single transaction
 * </ol>
 *
 * So any of the following are correct:
 * <pre>
 * database.executeSqlUpdate("update user set enabled=true where id=4");
 * database.executeSqlUpdate("update user set enabled=true where id=?", 4);
 * database.executeSqlUpdate([
 *   ["update user set enabled=true where id=?", 4],
 *   ["insert user_permissions (id, code) values (?, 'login)", 4]
 * ]);
 * </pre>
 * @see nimbusly.Migration
 * 
 * @class 
 * @param {string} databaseName name of HTML database
 * @param {nimbusly.Migration[]} migrations migrations for udpdating or initializing the database
 * @param {String} [version] version of database needed (defaults to latest version)
 */
nimbusly.Database = function(databaseName, migrations, version) {
    this.migrations = migrations;
    this.databaseName = databaseName;
    this.databaseDescription = databaseName;
    this.latestVersion = version || this.highestVersion();
    this.transactionIndex = 0;
    this.dbReady = false;
};

nimbusly.Database.prototype = (function() {
    var prototype = {};
    
    var errors = [];

    /**
     * Logging method
     *
     * <p>To actually get database logging, set this to your own database logging method, which should be
     * of the form function(message) where message will be a string.
     * <pre>
     *   db.logger = function(message) { console.log(message); };
     * </pre>
     * </p>
     * @name nimbusly.Database.logger
     * @field
     */
    prototype.logger = function(message) {};
    
    /**
     * This is an event handler that is called when a transaction fails. You can override it to implement
     * your own error handling. By default, it will log the error and then throw an exception.
     *
     * <pre>
     *   db.onTransactionFailed = function() { alert("Something went wrong!") };
     * </pre>
     * @name nimbusly.Database.logger
     * @field
     */
    prototype.onTransactionFailed = function() {
        var error = new Error(errors.join('\n'));
        errors = [];
        throw error;
    };
    
    prototype.versions = function() {
        return this.migrations.map(function(mig) { return mig.version; });
    };
    
    prototype.highestVersion = function() {
        var vers = this.versions();
        var m = vers.reduce(Math.max);
        return m;
    };
    
    /**
     * Open the database, do any upgrade/initialization, then call the callback when it is ready to use
     *
     * @name nimbusly.Database.open
     * @methodOf nimbusly.Database.prototype
     * @param {Function} [callback] function to call when database has been opened and initialized
     * @param {Boolean} [dropDataFlag] if true, reinitializes the database from scratch 
     */
    prototype.open = function(callback, dropDataFlag) {
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
    prototype.saveError = function(what, error, txIndexOrError) {
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
    prototype.runMigrationsInRange = function(tx, currentVersion, finalVersion, txLogger) {
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
    prototype.upgradeDatabase = function() {
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
    prototype.dropData = function(migrations) {
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
     * Convert incomming sql into array: [[sql1, params...], [sql2, params...], ...]
     *
     * param sql can be a string, an array of the form [stement, param, ...], or an array of arrays
     *   [sql, ...] where each sql is either a string or an array
     */
    prototype.normalizeSql = function(sql) {
        if (!(sql instanceof Array)) { 
            return [[sql]]; 
        } else if (!(sql[0] instanceof Array)) { 
            return [sql]; 
        } else {
            return sql;
        }
    };
    
    /**
     * Executes some sql in the context of the given transaction. If successful, the callback is called
     * with the results. If an error occurs, it is reported through reportError.
     *
     * @private
     * @name nimbusly.Database.executeSqlInTransaction
     * @methodOf nimbusly.Database.prototype
     * @param {String|String[]|String[][]|Function} sql a function function(tx) or string containing sql statement
     * @params {Function} [callback] must be function(tx, results)
     */
    prototype.executeSqlInTransaction = function(tx, sql, callback, txLogger) {
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
     * Executes a SQL update statement,
     *
     * If successful, the callback, if any, is called.
     *
     * <pre>
     * db.executeSqlUpdate(["UPDATE user SET password = ?", new_password], function() {
     *   alert("Password changed!");   
     * });
     * </pre>
     *
     * @name nimbusly.Database.executeSqlUpdate
     * @methodOf nimbusly.Database.prototype
     * @memberOf nimbusly.Database
     * @param {String|String[]|String[][]} sql sql statement(s) to execute
     * @param {Function} [callback] must be of the type function(), and is called on a successful update
     */
    prototype.executeSqlUpdate = function(sql, callback) {
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
     * Executes a SQL insert statement and returns the rowid of the row inserted.
     * 
     * If successful, the callback, if any, is called. If executeSqlInsert is called with a single 
     * insert statement, a single row id is returned to the callback. If multiple insert statements 
     * are specified, then the callback will be passed an array or rowids corresponding to
     * the sql statements.
     *
     * <pre>
     * db.executeSqlInsert(["INSERT INTO user (name, password) values (?, ?)", name, password], function(result) {
     *   alert("User added with id " + result);   
     * });
     * </pre>
     *
     * @name nimbusly.Database.executeSqlInsert
     * @methodOf nimbusly.Database.prototype
     * @param {String|String[]|String[][]} sql sql statement
     * @param {Function} [callback] must be of the type function(results) where results will be a single row id, or an array of row ids
     */
    prototype.executeSqlInsert = function(sql, callback) {
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
    prototype.queryCallbackWrapper = function(callback) {
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
     * Executes a SQL query and returns the results as an array of objects.
     *
     * If succesful, the callback, if any, is called with the results.
     *
     * <pre>
     * var userSelect = document.getElementById('userSelect);
     * db.executeSqlQuery("SELECT * FROM users", function(users) {
     *   for (var i = 0; i < users.length; ++i) {
     *     userSelect.add(new Option(user.name, user.rowid));
     *   }
     * });
     * </pre>
     *
     * @name nimbusly.Database.executeSqlQuery
     * @methodOf nimbusly.Database.prototype
     * @param {String|String[]|String[][]} sql sql statement
     * @param {Function} [callback] must be of the form function(results) where results will be an array of objects
     */
    prototype.executeSqlQuery = function(sql, callback, transactionCallback) {
        var txLogger = new nimbusly.TransactionLogger(this);
        var database = this;
        this.db.transaction(
            function(tx) { 
                database.executeSqlInTransaction(tx, sql, database.queryCallbackWrapper(callback), txLogger); 
            }, 
            txLogger.errorWrapper(database.onTransactionFailed), 
            txLogger.callbackWrapper(transactionCallback));
    };
        
    /**#@-*/
    return prototype;
}());


