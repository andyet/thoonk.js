/**
 * The promise of a an action to be fulfilled with methods to respond to that action after it is finished. The action
 * may happen synchronously or asynchrously.
 */
function Promise() {
	
}

Promise.prototype = {
	/**
	 * Allows responding to an action once it is fulfilled or has failed. Allows responding to progress updates as well.
	 * A promise may or may not choose to provide progress updates.
	 * 
	 * @param {Function} fulfilledHandler A function which will be called with the results of the promise when fulfiled.
	 * @param {Function} failedHandler A function which will be called with the error of the promise when failed.
	 * @param {Function} progressHandler A function which will be called with progress information.
	 * @return {Promise} A new promise that provides the results of the fulfilledHandler or failedHandler. If these
	 * handlers return a promise then the new promise will wait until their promise is finished.
	 */
	then: function(fulfilledHandler, failedHandler, progressHandler) {
		throw new TypeError('The Promise base class is abstract, this function must be implemented by the Promise implementation');
	},
	
	/**
	 * Specific method for only passing a fulfilled handler.
	 * 
	 * @param handler
	 */
	fulfilled: function(handler) {
		return this.then(handler);
	},
	
	/**
	 * Specific method for only passing a failed handler.
	 * 
	 * @param handler
	 */
	failed: function(handler) {
		return this.then(null, handler);
	},
	
	/**
	 * Specific method for only passing a progress handler.
	 * 
	 * @param handler
	 */
	progress: function(handler) {
		return this.then(null, null, handler);
	},
	
	/**
	 * Apply the promise's result array to the handler optionally providing a context. 
	 * 
	 * @param handler Fulfilled handler
	 * @param [context] Optional context object
	 */
	apply: function(handler, context) {
		return this.then(function(result) {
			if (result instanceof Array) return handler.apply(context, result);
			else return handler.call(context, result);
		});
	},
	
	/**
	 * Allows the cancellation of a promise. Some promises are cancelable and so this method may be created on
	 * subclasses of Promise to allow a consumer of the promise to cancel it.
	 * 
	 * @return {String|Error} Error string or object to provide to failedHandlers
	 */
	cancel: function() {
		return 'Promise canceled';
	},

	/**
	 * A shortcut to return the value of a property from the returned promise results. The same as providing your own
	 * <code>.then(function(obj) { return obj.propertyName; });</code> method.
	 * 
	 * @param {String} propertyName The name of the property to return
	 * @return {Promise} The new promise for the property value
	 */
	get: function(propertyName) {
		return this.then(function(object) {
			return object[propertyName];
		});
	},
	
	/**
	 * A shortcut to set the property from the returned promise results to a certain value. The same as providing your
	 * own <code>.then(function(obj) { obj.propertyName = value; return obj; });</code> method. This returns the
	 * original promise results after setting the property as opposed to <code>put</code> which returns the value which
	 * was set.
	 * 
	 * @param {String} propertyName The name of the property to set
	 * @param {mixed} value The value for the property to be set to
	 * @return {Promise} A new promise with the original results
	 */
	set: function(propertyName, value) {
		return this.then(function(object) {
			object[propertyName] = value;
			return object;
		});
	},
	
	/**
	 * A shortcut to set the property from the returned promise results to a certain value. The same as providing your
	 * own <code>.then(function(obj) { return obj.propertyName = value; });</code> method. This returns the new value
	 * after setting the property as opposed to <code>set</code> which returns the original promise results.
	 * 
	 * @param {String} propertyName The name of the property to set
	 * @param {mixed} value The value for the property to be set to
	 * @return {Promise} A new promise with the value
	 */
	put: function(propertyName, value) {
		return this.then(function(object) {
			return object[propertyName] = value;
		});
	},
	
	/**
	 * A shortcut to call a method on the returned promise results. The same as providing your own
	 * <code>.then(function(obj) { obj.functionName(); return obj; });</code> method. This returns the original results
	 * after calling the function as opposed to <code>call</code> which returns the function's results.
	 * 
	 * @param {String} functionName The name of the function to call
	 * @param {mixed} [...arguments] Zero or more arguments to pass to the function
	 * @return {Promise} A new promise with the original results
	 */
	run: function(functionName /*, args */) {
		return this.then(function(object) {
			object[functionName].apply(object, Array.prototype.slice.call(arguments, 1));
			return object;
		});
	},
	
	/**
	 * A shortcut to call a method on the returned promise results. The same as providing your own
	 * <code>.then(function(obj) { return obj.functionName(); });</code> method. This returns the function's results
	 * after calling the function as opposed to <code>run</code> which returns the original results.
	 * 
	 * @param {String} functionName The name of the function to call
	 * @param {mixed} [...arguments] Zero or more arguments to pass to the function
	 * @return {Promise} A new promise with the original results
	 */
	call: function(functionName /*, args */) {
		return this.then(function(object) {
			return object[functionName].apply(object, Array.prototype.slice.call(arguments, 1));
		});
	}
};


/**
 * Combines one or more methods behind a promise. If the methods return a promise <code>when</code> will wait until they
 * are finished to complete its promise.
 * 
 * Example:
 * <code>when(method1(), method2()).then(function(result1, result2) {</code>
 * <code>    // both methods have finished and the results from their promises are available</code>
 * <code>});</code>
 * 
 * @param obj
 */
function when(obj) {
	var deferred = new Deferred();
	if (arguments.length <= 1) return deferred.fulfill(obj).promise;
	
	var args = Array.prototype.slice.call(arguments),
		count = args.length,
		createCallback = function(index) {
			return function(value) {
				args[index] = value;
				if (--count == 0) {
					deferred.fulfill.apply(null, args);
				}
			};
		};
	
	for (var i = 0, l = args.length; i < l; i++) {
		obj = args[i];
		if (obj && typeof obj.then === 'function') {
			obj.then(createCallback(i), deferred.fail);
		} else {
			--count;
		}
	}
	if (count == 0) {
		deferred.fulfill.apply(null, args);
	}
	return deferred.promise;
}


/**
 * Represents a deferred action with an associated promise.
 * 
 * @param promise Allow for custom promises to be used with deferred.
 */
function Deferred(promise) {
	this.status = 'unfulfilled';
	this.progressHandlers = [];
	this.handlers = [];
	promise = this.promise = promise || new Deferred.Promise();
	var cancel = promise.cancel, self = this;
	if (cancel) {
		promise.cancel = function() {
			var error = cancel.apply(promise, arguments);
			self.fail(error);
		};
	}
	promise.then = this.then = this.then.bind(this);
	this.fulfill = this.fulfill.bind(this);
	this.fail = this.fail.bind(this);
	this.progress = this.progress.bind(this);
}

//closure to keep privates out of the public scope
(function() {

Deferred.prototype = {
	constructor: Deferred,
	
	then: function(fulfilledHandler, failedHandler, progressHandler) {
		if (progressHandler) this.progressHandlers.push(progressHandler);
		var nextDeferred = new Deferred();
		var handler = { fulfilled: fulfilledHandler, failed: failedHandler, nextDeferred: nextDeferred };
		
		if (this.finished()) {
			notify.call(this, handler);
		} else {
			this.handlers.push(handler);
		}
		return nextDeferred.promise;
	},
	
	finished: function() {
		return this.status != 'unfulfilled';
	},
			
	fulfill: function(result) {
		finish.call(this, 'fulfilled', Array.prototype.slice.call(arguments));
		return this;
	},
	
	fail: function(error) {
		finish.call(this, 'failed', Array.prototype.slice.call(arguments));
		return this;
	},
	
	progress: function(info) {
		var progress = this.progressHandlers;
		for (var i = 0, l = progress.length; i < l; i++) {
			progress[i].apply(null, arguments);
		}
		return this;
	},
	
	timeout: function(milliseconds, error) {
		clearTimeout(this._timeout);
		var self = this;
		this._timeout = setTimeout(function() {
			self.fail(error || new Error('Operation timed out'));
		}, milliseconds);
	}
};

// private method to finish the promise
function finish(status, results) {
	if (this.status != 'unfulfilled') return;//throw new Error('Deferred has already been ' + this.status);
	clearTimeout(this._timeout);
	this.status = status;
	this.results = results;
	var handlers = this.handlers;
	for (var i = 0, l = handlers.length; i < l; i++) {
		notify.call(this, handlers[i]);
	}
}

// private method to notify the hanlder
function notify(handler) {
	var results = this.results,
		method = handler[this.status],
		deferred = handler.nextDeferred;
	
	// pass along the error/result
	if (!method) {
		deferred[this.status.slice(0, -2)].apply(null, results);
		return;
	}
	
	// run the then
	var nextResult = method.apply(null, results);
	
	if (nextResult && typeof nextResult.then === 'function') {
		nextResult.then(deferred.fulfill, deferred.fail);
	} else if (nextResult instanceof Error) {
		deferred.fail(nextResult);
	} else {
		deferred.fulfill(nextResult);
	}
}

Deferred.Promise = Promise; // default promise implementation

})();


if (!Function.prototype.bind) {
	Function.prototype.bind = function(obj) {
		var slice = Array.prototype.slice,
			args = slice.call(arguments, 1), 
			self = this, 
			nop = function () {}, 
			bound = function () {
				return self.apply(this instanceof nop ? this : (obj || {}), args.concat(slice.call(arguments)));    
			};
		nop.prototype = self.prototype;
		bound.prototype = new nop();
		return bound;
	};
}

if (typeof exports !== 'undefined') {
	exports.Deferred = Deferred;
	exports.Promise = Promise;
	exports.when = when;
}
