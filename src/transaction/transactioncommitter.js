var q = require("q"),
    request = require("request");

var Utils = require("../utils"),
    isObject = Utils.isObject,
    addTypes = require("../addtypes");


module.exports = TransactionCommitter = (function() {
    /*
     * Constructor
     *
     * @param {Transaction} a transaction due for commit
     */
    function TransactionCommitter(transaction) {
        this.transaction = transaction;
        this.inError = null;
    }

    /*
     * Main commit method.
     *
     * @see Transaction#commit
     *
     * @return {Promise}
     * @api public
     */
    TransactionCommitter.prototype.doCommit = function() {
        if(!!this.transaction.pendingVertices.length){
            // We have new vertices to create first!
            commit = this.commitVertices();
        } else {
            commit = this.commitEdges();
        }

        return commit;
    };

    /*
     * Post vertices in batch to the database, eventually rolling them back
     * in case of a failure.
     *
     * Internally calls updatePendingVertices() and, in the absence of a
     * failure, calls updateEdges().
     *
     * @return {Promise}
     * @api private
     */
    TransactionCommitter.prototype.commitVertices = function() {
        var self = this;

        return this.getPostVerticesPromises().then(function(result){
            self.updatePendingVertices(result);

            if(this.inError){
                return self.rollbackVertices()
                    .then(function(result){
                        throw result;
                    },function(error){
                        throw error;
                    });
            }

            //Update any edges that may have referenced the newly created Vertices
            self.updateEdges();

            return self.postBatch({ tx: self.transaction.pendingElements });

        }, function(err){
            console.error(err);
        });
    };

    /*
     * Post edges in batch to the database, replacing _inV and _outV
     * references to Vertices as references to vertices _id.
     *
     * @return {Promise} of posting edges in batch.
     * @api private
     */
    TransactionCommitter.prototype.commitEdges = function() {
        var transactionElement;

        // We don't have new vertices to create, only edges...
        for (var k = 0; k < this.transaction.pendingElements.length; k++) {
            transactionElement = this.transaction.pendingElements[k];

            if(transactionElement._type == 'edge' && transactionElement._action == 'create'){
                if (isObject(transactionElement._inV)) {
                    transactionElement._inV = transactionElement._inV._id;
                }

                if (isObject(transactionElement._outV)) {
                    transactionElement._outV = transactionElement._outV._id;
                }
            }
        }

        return this.postBatch({ tx: this.transaction.pendingElements });
    };

    /*
     * Post JSON data representing graph elements to the appropriate
     * Rexster endpoint via http.
     *
     * @param {String} urlPath
     * @param {Object} keys/values representing a graph element
     * @param {Object} optional 'Content-Type' headers
     * @return {Promise}
     * @api private
     */
    TransactionCommitter.prototype.postData = function(urlPath, data, headers) {
        var self = this;
        var deferred = q.defer();

        var url = 'http://' + this.transaction.OPTS.host + ':' + this.transaction.OPTS.port + '/graphs/' + this.transaction.OPTS.graph + urlPath;

        var options = {
            url: url,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json' // May be overridden
            }
        };

        // Specify custom headers, if any
        if(headers){
            for(var prop in headers){
                if(headers.hasOwnProperty(prop)){
                    options.headers[prop] = headers[prop];
                }
            }
        }

        request.post(options, function(err, res, body) {
            if (err) {
                // Handle any HTTP request error, not Rexster errors
                console.error('Problem with request: ' + err);
                deferred.reject(err);
            }

            body = JSON.parse(body);

            if('success' in body && body.success === false){
                //send error info with reject
                if(self.transaction.pendingVertices && !!self.transaction.pendingVertices.length){
                    //This indicates that all new Vertices were created but failed to
                    //complete the rest of the tranasction so the new Vertices need deleted
                    self.rollbackVertices()
                    .then(function(result){
                        deferred.reject(result);
                    },function(error){
                        deferred.reject(error);
                    });

                } else {
                    deferred.reject(body);
                }
            } else {
                //This occurs after pendingVertices have been created
                //and passed in to postData
                if(!('results' in body) && self.transaction.pendingVertices && !!self.transaction.pendingVertices.length){
                    body.pendingVertices = [];
                    // push.apply(body.pendingVertices, self.transaction.pendingVertices);
                    body.pendingVertices.push(self.transaction.pendingVertices);

                    self.transaction.pendingVertices.length = 0;
                }

                if('tx' in data){
                    data.tx.length = 0;
                }

                deferred.resolve(body);
            }
        });

        return deferred.promise;
    };

    /*
     * A convenient method for posting in batch.
     *
     * @api private
     */
    TransactionCommitter.prototype.postBatch = function(data, headers) {
        return this.postData('/tp/batch/tx', data, headers);
    };


    /*
     * A convenient method for posting vertices.
     *
     * @api private
     */
    TransactionCommitter.prototype.postVertices = function(data, headers) {
        return this.postData('/vertices', data, headers);
    };

    /*
     * For all pending "edges", replace _inV and _outV references to Vertex
     * object by references to Vertex _id.
     *
     * @api private
     */
    TransactionCommitter.prototype.updateEdges = function() {
        var transactionElement;

        for (var k = 0; k < this.transaction.pendingElements.length; k++) {
            transactionElement = this.transaction.pendingElements[k];

            if(transactionElement._type == 'edge' && transactionElement._action == 'create'){
                // Replace references to Vertex object by references to Vertex _id.
                // TODO: Try replacing the following two checks with getters for _inV and _outV in Edge prototype.
                if (isObject(transactionElement._inV)) {
                    transactionElement._inV = transactionElement._inV._id;
                }

                if (isObject(transactionElement._outV)) {
                    transactionElement._outV = transactionElement._outV._id;
                }
            }
        }
    };

    /*
     * Update the _id of vertices pending for creations with ids generated by
     * the database.
     *
     * @param {Array} of element result fetched from the database
     * @api private
     */
    TransactionCommitter.prototype.updatePendingVertices = function(result) {
        var inError = false;

        //Update the _id for the created Vertices
        for (var j = 0; j < result.length; j++) {
            if('results' in result[j] && '_id' in result[j].results){
                this.transaction.pendingVertices[j]._id = result[j].results._id;
            } else {
                this.inError = true;
            }
        }
    };

    /*
     * For each pending vertices, build and return a "promise for all promise
     * of creation of each vertex in the database".
     *
     * @return {Promise}
     * @api private
     */
    TransactionCommitter.prototype.getPostVerticesPromises = function() {
        var promises = [],
            types,
            header = {'Content-Type':'application/vnd.rexster-typed-v1+json'};

        for (var i = 0; i < this.transaction.pendingVertices.length; i++) {
            types = addTypes(this.transaction.pendingVertices[i], this.transaction.typeMap);
            promises.push(this.postVertices(types, header));
        }

        return q.all(promises);
    };

    /*
     * Called when rolling back vertices: for each pending vertices, add a
     * "removeVertex()" instruction to the transaction.
     *
     * @api private
     */
    TransactionCommitter.prototype.removeVertices = function() {
        for (var i = this.transaction.pendingVertices.length - 1; i >= 0; i--) {
            //check if any vertices were created and create a Transaction
            //to delete them from the database
            if('_id' in this.transaction.pendingVertices[i]){
                this.transaction.removeVertex(this.transaction.pendingVertices[i]._id);
            }
        }

        this.transaction.pendingVertices.length = 0;
    };

    /*
     * Remove all pending vertices in batch from the graph database. Internally
     * calls "postBatch()".
     *
     * @return {Object} An error object
     * @api private
     */
    TransactionCommitter.prototype.rollbackVertices = function() {
        var self = this;
        var errObj = {
            success: false,
            message : ""
        };
        //In Error because couldn't create new Vertices. Therefore,
        //roll back all other transactions
        console.error('problem with Transaction');

        this.transaction.pendingElements.length = 0; // "clears" array
        this.removeVertices();

        //This indicates that nothing was able to be created as there
        //is no need to create a tranasction to delete the any vertices as there
        //were no new vertices successfully created as part of this Transaction

        if (!this.transaction.pendingElements.length){
            return q.fcall(function () {
                errObj.message = "Could not complete transaction. Transaction has been rolled back.";

                return errObj;
            });
        }

        //There were some vertices created which now need to be deleted from
        //the database. On success throw error to indicate transaction was
        //unsuccessful. On fail throw error to indicate that transaction was
        //unsuccessful and that the new vertices created were unable to be removed
        //from the database and need to be handled manually.
        return this.postBatch({ tx: this.transaction.pendingElements })
            .then(function(success){
                errObj.message = "Could not complete transaction. Transaction has been rolled back.";

                return errObj;
            }, function(fail){
                errObj.message = "Could not complete transaction. Unable to roll back newly created vertices.";
                errObj.ids = self.transaction.pendingElements.map(function(item){
                    return item._id;
                });

                self.transaction.pendingElements.length = 0;

                return errObj;
            });
    };

    return TransactionCommitter;

})();