
/**
 * A basic class system which puts a nicer syntax onto the native JavaScript prototype class creation. By
 * passing an object in the constructor of Class() you may defined the methods and constructor of your new class. Two
 * special properties may be defined, constructor, extend, and implement. Set constructor to the function that will be
 * called as the constructor of your class (note, this IS your class as well). Set extend to the parent class your new
 * class is extending. Set implement to either a one class or an array of classes which will have their functionality
 * copied over onto this new classes' definition. Note that objects of your new class type will be instances of the
 * parent in extend, but not in implement.
 * 
 * Example:
 * var MyClass = new Class({
 *     extend: ParentClass,
 *     implement: ImplClass,
 *     constructor: function() {
 *         this.foo = 'bar';
 *     }
 * });
 * 
 * var obj = new MyClass();
 * alert(obj instanceof ParentClass); // true
 * alert(obj instanceof ImplClass); // false, though will have all the functions defined on ImplClass
 * alert(obj.constructor == MyClass); // true
 * 
 * @param def An object with the implementation of the class.
 */
function Class(def, statics) {
	if (arguments.length == 0) {
        def = {};
    }
	var implement = def.hasOwnProperty('implement') ? def.implement : null,
		extend = def.hasOwnProperty('extend') ? def.extend : Object,
		constructor = def.hasOwnProperty('constructor')
				? def.constructor
				: def.constructor = function() {extend.apply(this, arguments)};
	
    delete def.extend;
    delete def.implement;
	
	// add implement first so definition can override it
	if (implement) {
		var proto;
		if ( !(implement instanceof Array) ) implement = [implement];
		for (var i = 0, l = implement.length; i < l; i++) {
			proto = typeof implement[i] === 'function' ? implement[i].prototype : implement[i];
			copy(def, proto, true);
		}
	}
	
	// Copy the properties over onto the new prototype
	constructor.prototype = Object.create(extend.prototype);
	copy(constructor.prototype, def);
	
	if (statics) {
		copy(constructor, statics);
	}
	
	return constructor;
}

/**
 * Copy properties from source onto target, optionally choosing to not overwrite existing properties on the target.
 * @param target
 * @param source
 * @param [noOverwrite]
 */
function copy(target, source, noOverwrite) {
	for (var i in source) {
		if (source[i] !== target[i] && (!noOverwrite || !target.hasOwnProperty(i))) {
			target[i] = source[i];
		}
	}
}

if (typeof exports !== 'undefined') {
	exports.Class = Class;
}