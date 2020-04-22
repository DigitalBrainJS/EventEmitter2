/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
;!function(undefined) {
  "use strict";
  var hasOwnProperty= Object.hasOwnProperty;
  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return obj instanceof Array;
  };
  var defaultMaxListeners = 10;
  var supportSymbols= typeof Symbol==='function';
  var supportReflect= typeof Reflect === 'object';
  var supportSetImmediate= typeof setImmediate === 'function';
  var _setImmediate= supportSetImmediate ? setImmediate : setTimeout;
  var ownKeys= supportSymbols? (supportReflect && typeof Reflect.ownKeys==='function'? Reflect.ownKeys : function(obj){
    var arr= Object.getOwnPropertyNames(obj);
    var arr2= Object.getOwnPropertySymbols(obj);
    arr.push.apply(arr, arr2);
    return arr;
  }) : Object.keys;


  function logPossibleMemoryLeak(count, eventName) {
    var errorMsg = '(node) warning: possible EventEmitter memory ' +
        'leak detected. ' + count + ' listeners added. ' +
        'Use emitter.setMaxListeners() to increase limit.';

    if(this.verboseMemoryLeak){
      errorMsg += ' Event name: ' + eventName + '.';
    }

    if(typeof process !== 'undefined' && process.emitWarning){
      var e = new Error(errorMsg);
      e.name = 'MaxListenersExceededWarning';
      e.emitter = this;
      e.count = count;
      process.emitWarning(e);
    } else {
      console.error(errorMsg);

      if (console.trace){
        console.trace();
      }
    }
  }

  var toArray = function (a, b, c) {
    var n = arguments.length;
    switch (n) {
      case 0:
        return [];
      case 1:
        return [a];
      case 2:
        return [a, b];
      case 3:
        return [a, b, c];
      default:
        var arr = new Array(n);
        while (n--) {
          arr[n] = arguments[n];
        }
        return arr;
    }
  };

  function toObject(keys, values) {
    var obj = {};
    var key;
    var len = keys.length;
    var valuesCount = values ? value.length : 0;
    for (var i = 0; i < len; i++) {
      key = keys[i];
      obj[key] = i < valuesCount ? values[i] : undefined;
    }
    return obj;
  }

  function TargetObserver(emitter, target, options) {
    this._emitter = emitter;
    this._target = target;
    this._listeners = {};
    this._listenersCount = 0;

    var on, off;

    if (options.on || options.off) {
      on = options.on;
      off = options.off;
    }

    if (target.addEventListener) {
      on = target.addEventListener;
      off = target.removeEventListener;
    } else if (target.addListener) {
      on = target.addListener;
      off = target.removeListener;
    } else if (target.on) {
      on = target.on;
      off = target.off;
    }

    if (!on && !off) {
      throw Error('target does not implement any known event API');
    }

    if (typeof on !== 'function') {
      throw TypeError('on method must be a function');
    }

    if (typeof off !== 'function') {
      throw TypeError('off method must be a function');
    }

    this._on = on;
    this._off = off;

    var _observers= emitter._observers;
    if(_observers){
      _observers.push(this);
    }else{
      emitter._observers= [this];
    }
  }

  Object.assign(TargetObserver.prototype, {
    subscribe: function(event, localEvent, reducer){
      var observer= this;
      var target= this._target;
      var emitter= this._emitter;
      var listeners= this._listeners;
      var handler= function(){
        var args= toArray.apply(null, arguments);
        var eventObj= {
          data: args,
          name: localEvent,
          original: event
        };
        if(reducer){
          var result= reducer.call(target, eventObj);
          if(result!==false){
            emitter.emit.apply(emitter, [eventObj.name].concat(args))
          }
          return;
        }
        emitter.emit.apply(emitter, [localEvent].concat(args));
      };


      if(listeners[event]){
        throw Error('Event \'' + event + '\' is already listening');
      }

      this._listenersCount++;

      if(emitter._newListener && emitter._removeListener && !observer._onNewListener){

        this._onNewListener = function (_event) {
          if (_event === localEvent && listeners[event] === null) {
            listeners[event] = handler;
            observer._on.call(target, event, handler);
          }
        };

        emitter.on('newListener', this._onNewListener);

        this._onRemoveListener= function(_event){
          if(_event === localEvent && !emitter.hasListeners(_event) && listeners[event]){
            listeners[event]= null;
            observer._off.call(target, event, handler);
          }
        };

        listeners[event]= null;

        emitter.on('removeListener', this._onRemoveListener);
      }else{
        listeners[event]= handler;
        observer._on.call(target, event, handler);
      }
    },

    unsubscribe: function(event){
      var observer= this;
      var listeners= this._listeners;
      var emitter= this._emitter;
      var handler;
      var events;
      var off= this._off;
      var target= this._target;
      var i;

      if(event && typeof event!=='string'){
        throw TypeError('event must be a string');
      }

      function clearRefs(){
        if(observer._onNewListener){
          emitter.off('newListener', observer._onNewListener);
          emitter.off('removeListener', observer._onRemoveListener);
          observer._onNewListener= null;
          observer._onRemoveListener= null;
        }
        var index= findTargetIndex.call(emitter, observer);
        emitter._observers.splice(index, 1);
      }

      if(event){
        handler= listeners[event];
        if(!handler) return;
        off.call(target, event, handler);
        delete listeners[event];
        if(--this._listenersCount){
          clearRefs();
        }
      }else{
        events= ownKeys(listeners);
        i= events.length;
        while(i-->0){
          event= events[i];
          off.call(target, event, listeners[event]);
        }
        this._listeners= {};
        this._listenersCount= 0;
        clearRefs();
      }
    }
  });

  function resolveOptions(options, schema, reducers, allowUnknown) {
    var computedOptions = Object.assign({}, schema);

    if (!options) return computedOptions;

    if (typeof options !== 'object') {
      throw TypeError('options must be an object')
    }

    var keys = ownKeys(options);
    var length = keys.length;
    var option, value;
    var reducer;

    function reject(reason) {
      throw Error('Invalid "' + option + '" option value' + (reason ? '. Reason: ' + reason : ''))
    }

    for (var i = 0; i < length; i++) {
      option = keys[i];
      if (!allowUnknown && !hasOwnProperty.call(schema, option)) {
        throw Error('Unknown "' + option + '" option');
      }
      value = options[option];
      if (value !== undefined) {
        reducer = reducers[option];
        computedOptions[option] = reducer ? reducer(value, reject) : value;
      }
    }
    return computedOptions;
  }

  function constructorReducer(value, reject) {
    if (typeof value !== 'function' || !value.hasOwnProperty('prototype')) {
      reject('value must be a constructor');
    }
    return value;
  }

  function makeTypeReducer(types) {
    var message= 'value must be type of ' + types.join('|');
    var conditions= types.map(function(type){
      return 'a==="'+ type.toLowerCase()+'"';
    }).join('||');

    return new Function(
        'm',
        'return function(v, reject){var a= typeof v;if(!('+ conditions + '))reject(m);return v;}'
    )(message);
  }

  var functionReducer= makeTypeReducer(['function']);
  var objectFunctionReducer= makeTypeReducer(['object', 'function']);

  function makeCancelablePromise(Promise, executor, options) {
    var isCancelable;
    var callbacks;
    var timer= 0;
    var subscribeClosed;

    var promise = new Promise(function (resolve, reject, onCancel) {
      options= resolveOptions(options, {
        timeout: 0,
        overload: false
      }, {
        timeout: function(value, reject){
          value*= 1;
          if (typeof value !== 'number' || value < 0 || !Number.isFinite(value)) {
            reject('timeout must be a positive number');
          }
          return value;
        }
      });

      isCancelable = !options.overload && typeof Promise.prototype.cancel === 'function' && typeof onCancel === 'function';

      function cleanup() {
        if (callbacks) {
          callbacks = null;
        }
        if (timer) {
          clearTimeout(timer);
          timer = 0;
        }
      }

      var _resolve= function(value){
        cleanup();
        resolve(value);
      };

      var _reject= function(err){
        cleanup();
        reject(err);
      };

      if (isCancelable) {
        executor(_resolve, _reject, onCancel);
      } else {
        callbacks = [function(reason){
          _reject(reason || Error('canceled'));
        }];
        executor(_resolve, _reject, function (cb) {
          if (subscribeClosed) {
            throw Error('Unable to subscribe on cancel event asynchronously')
          }
          if (typeof cb !== 'function') {
            throw TypeError('onCancel callback must be a function');
          }
          callbacks.push(cb);
        });
        subscribeClosed= true;
      }

      if (options.timeout > 0) {
        timer= setTimeout(function(){
          var reason= Error('timeout');
          timer= 0;
          promise.cancel(reason);
          reject(reason);
        }, options.timeout);
      }
    });

    if (!isCancelable) {
      promise.cancel = function (reason) {
        if (!callbacks) {
          return;
        }
        var length = callbacks.length;
        for (var i = 1; i < length; i++) {
          callbacks[i](reason);
        }
        // internal callback to reject the promise
        callbacks[0](reason);
        callbacks = null;
      };
    }

    return promise;
  }

  function findTargetIndex(observer) {
    var observers = this._observers;
    if(!observers) return -1;
    var len = observers.length;
    for (var i = 0; i < len; i++) {
      if (observers[i]._target === observer) return i;
    }
    return -1;
  }

  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }

    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }

        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this._delimiter) : type.slice();

    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for (var i = 0, len = type.length; i + 1 < len; i++) {
      if (type[i] === '**' && type[i + 1] === '**') {
        return;
      }
    }

    var tree = this._listenerTree || (this._listenerTree = new FlatObject());
    var name = type.shift();

    while (name !== undefined) {

      if (!tree[name]) {
        tree[name] = new FlatObject();
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        } else {
          if (typeof tree._listeners === 'function') {
            tree._listeners = [tree._listeners];
          }

          tree._listeners.push(listener);

          if (
              !tree._listeners.warned &&
              this._maxListeners > 0 &&
              tree._listeners.length > this._maxListeners
          ) {
            tree._listeners.warned = true;
            logPossibleMemoryLeak.call(this, tree._listeners.length, name);
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  }

  function recursivelyGarbageCollect(root) {
    if (!root) {
      return;
    }
    var keys = ownKeys(root);
    var i= keys.length;
    var obj, key;
    while(i-->0){
      key = keys[i];
      obj = root[key];
      if (typeof obj === 'object' && obj.constructor === Object) {
        if (ownKeys(obj).length) {
          recursivelyGarbageCollect(obj);
        } else {
          delete root[key];
        }
      }
    }
  }

  function FlatObject(){}

  FlatObject.prototype= null;

  function EventEmitter(conf) {
    var wildcard;
    this._newListener = false;
    this._removeListener = false;
    this.verboseMemoryLeak = false;

    if (conf) {
      conf.delimiter && (this._delimiter = conf.delimiter);
      conf.maxListeners!==undefined && (this._maxListeners= conf.maxListeners);
      conf.newListener!==undefined && (this._newListener= conf.newListener);
      conf.removeListener!==undefined && (this._removeListener= conf.removeListener);
      conf.verboseMemoryLeak!==undefined && (this.verboseMemoryLeak= conf.verboseMemoryLeak);
      conf.ignoreErrors!==undefined && (this._ignoreErrors= conf.ignoreErrors);
      wildcard= conf.wildcard!==undefined && (this._wildcard= conf.wildcard);
    }
    // always init all stores to increase properties lookup performance

    this._all= null;

    if(wildcard){
      this._listenerTree = null;
    }else{
      this._eventsCount= 0;
      this._events = null;
    }
  }

  EventEmitter.EventEmitter2 = EventEmitter; // backwards compatibility for exporting EventEmitter property

  EventEmitter.prototype.listenTo= function(target, events, options){
    if(typeof target!=='object'){
      throw TypeError('target musts be an object');
    }

    var emitter= this;

    options = resolveOptions(options, {
      on: undefined,
      off: undefined,
      reducers: undefined
    }, {
      on: functionReducer,
      off: functionReducer,
      reducers: objectFunctionReducer
    });

    function listen(events){
      if(typeof events!=='object'){
        throw TypeError('events must be an object');
      }

      var reducers= options.reducers;
      var index;
      var observer;

      if((index= findTargetIndex.call(emitter, target))===-1){
        observer= new TargetObserver(emitter, target, options);
      }else{
        observer= emitter._observers[index];
      }

      var keys= ownKeys(events);
      var len= keys.length;
      var event;
      var isSingleReducer= typeof reducers==='function';

      for(var i=0; i<len; i++){
        event= keys[i];
        observer.subscribe(
            event,
            events[event] || event,
            isSingleReducer ? reducers : reducers && reducers[event]
        );
      }
    }

    isArray(events)?
        listen(toObject(events)) :
        (typeof events==='string'? listen(toObject(events.split(/\s+/))): listen(events));

    return this;
  };

  EventEmitter.prototype.stopListening = function (target, event) {
    var observers = this._observers;
    if(!observers){
      return false;
    }

    var i = observers.length;
    var observer;
    var matched= false;

    if(target && typeof target!=='object'){
      throw TypeError('target should be an object');
    }

    while (i-- > 0) {
      observer = observers[i];
      if (!target || observer._target === target) {
        observer.unsubscribe(event);
        matched= true;
      }
    }

    return matched;
  };

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.setMaxListeners = function(n) {
    if (n !== undefined) {
      this._maxListeners = n;
    }
  };

  EventEmitter.prototype.getMaxListeners = function() {
    return this._maxListeners;
  };

  EventEmitter.prototype.once = function(event, fn) {
    return this._once(event, fn, false);
  };

  EventEmitter.prototype.prependOnceListener = function(event, fn) {
    return this._once(event, fn, true);
  };

  EventEmitter.prototype._once = function(event, fn, prepend) {
    this._many(event, 1, fn, prepend);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    return this._many(event, ttl, fn, false);
  };

  EventEmitter.prototype.prependMany = function(event, ttl, fn) {
    return this._many(event, ttl, fn, true);
  };

  EventEmitter.prototype._many = function(event, ttl, fn, prepend) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      return fn.apply(this, arguments);
    }

    listener._origin = fn;

    this._on(event, listener, prepend);

    return self;
  };

  EventEmitter.prototype.emit = function() {
    var wildcard= this._wildcard, listenerTree, _events, _all= this._all;

    if(wildcard) {
      if(!(listenerTree= this._listenerTree) && !_all){
        return false;
      }
    }else{
      _events= this._events;
      if (!_events && !_all) {
        return false;
      }
    }

    var type = arguments[0], ns, kind;
    var args,l,i,j, containsSymbol;

    if (type === 'newListener' && !this._newListener) {
      if (!_events.newListener) {
        return false;
      }
    }

    if (wildcard) {
      kind = typeof type;
      if (kind === 'string') {
        ns = type.split(this._delimiter);
      } else {
        if(kind==='symbol'){
          ns= [type];
        }else{
          ns = type.slice();
          l= type.length;
          if(supportSymbols) {
            for (i = 0; i < l; i++) {
              if (typeof type[i] === 'symbol') {
                containsSymbol = true;
                break;
              }
            }
          }
          if(!containsSymbol){
            type = type.join(this._delimiter);
          }
        }
      }
    }

    var al = arguments.length;
    var handler;

    if (_all) {
      l = _all.length;
      handler = l > 1 ? _all.slice() : _all;

      for (i = 0; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this, type);
          break;
        case 2:
          handler[i].call(this, type, arguments[1]);
          break;
        case 3:
          handler[i].call(this, type, arguments[1], arguments[2]);
          break;
        default:
          args = new Array(al);
          for (j = 0; j < al; j++) args[j] = arguments[j];
          handler[i].apply(this, args);
        }
      }
    }

    if (wildcard) {
      handler = [];
      searchListenerTree.call(this, handler, ns, listenerTree, 0);
    } else if(!_events || !(handler = _events[type])){
      return !!_all;
    }

    if (typeof handler === 'function') {
      this.event = type;
      switch (al) {
        case 1:
          handler.call(this);
          return true;
        case 2:
          handler.call(this, arguments[1]);
          return true;
        case 3:
          handler.call(this, arguments[1], arguments[2]);
          return true;
        default:
          args = new Array(al - 1);
          for (j = 1; j < al; j++) args[j - 1] = arguments[j];
          handler.apply(this, args);
      }
      return true;
    }

    if ((l = handler.length)) {
      if (l > 1) {
        handler = handler.slice(0);
      }
      for (i = 0; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this);
        break;
        case 2:
          handler[i].call(this, arguments[1]);
        break;
        case 3:
          handler[i].call(this, arguments[1], arguments[2]);
        break;
        default:
          args = new Array(al - 1);
          for (j = 1; j < al; j++) args[j - 1] = arguments[j];
          handler[i].apply(this, args);
        }
      }
      return true;
    } else if (type === 'error' && _all && !this._ignoreErrors) {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
    }

    return !!_all;
  };

  EventEmitter.prototype.emitAsync = function() {
    var wildcard= this._wildcard, listenerTree, _events, _all= this._all;

    if(wildcard) {
      if(!(listenerTree= this._listenerTree) && _all){
        return Promise.resolve(false);
      }
    }else{
      _events= this._events;
      if (!_events && !_all) {
        return Promise.resolve(false);
      }
    }

    var type = arguments[0], ns, kind, containsSymbol;
    var args,l,i,j;

    if (type === 'newListener' && !this._newListener) {
        if (!_events.newListener) { return Promise.resolve([]); }
    }

    if (wildcard) {
      kind = typeof type;
      if (kind === 'string') {
        ns = type.split(this._delimiter);
      } else {
        if(kind==='symbol'){
          ns= [type];
        }else{
          ns = type.slice();
          l= type.length;
          if(supportSymbols) {
            for (i = 0; i < l; i++) {
              if (typeof type[i] === 'symbol') {
                containsSymbol = true;
                break;
              }
            }
          }
          if(!containsSymbol){
            type = type.join(this._delimiter);
          }
        }
      }
    }

    var promises= [];

    var al = arguments.length;
    var handler;

    if (_all) {
      l = _all.length;
      handler = l > 1 ? _all.slice(0) : _all;

      for (i = 0; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(handler[i].call(this, type));
          break;
        case 2:
          promises.push(handler[i].call(this, type, arguments[1]));
          break;
        case 3:
          promises.push(handler[i].call(this, type, arguments[1], arguments[2]));
          break;
        default:
          promises.push(handler[i].apply(this, arguments));
        }
      }
    }

    if (wildcard) {
      handler = [];
      searchListenerTree.call(this, handler, ns, listenerTree, 0);
    }else if(!_events || !(handler = _events[type])){
      return _all? Promise.all(promises) : Promise.resolve(false);
    }

    if (typeof handler === 'function') {
      this.event = type;
      switch (al) {
      case 1:
        promises.push(handler.call(this));
        break;
      case 2:
        promises.push(handler.call(this, arguments[1]));
        break;
      case 3:
        promises.push(handler.call(this, arguments[1], arguments[2]));
        break;
      default:
        args = new Array(al);
        for (j = 1; j < al; j++) args[j] = arguments[j];
        promises.push(handler.apply(this, args));
      }
      return Promise.all(promises);
    }

    if ((l = handler.length)) {
      if (l > 1) {
        handler = handler.slice(0);
      }

      for (i = 0; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(handler[i].call(this));
          break;
        case 2:
          promises.push(handler[i].call(this, arguments[1]));
          break;
        case 3:
          promises.push(handler[i].call(this, arguments[1], arguments[2]));
          break;
        default:
          args = new Array(al);
          for (j = 1; j < al; j++) args[j] = arguments[j];
          promises.push(handler[i].apply(this, args));
        }
      }
    } else if (type === 'error' && !_all && !this._ignoreErrors) {
      if (arguments[1] instanceof Error) {
        return Promise.reject(arguments[1]); // Unhandled 'error' event
      } else {
        return Promise.reject("Uncaught, unspecified 'error' event.");
      }
    }

    return promises.length? Promise.all(promises) : Promise.resolve(false);
  };

  EventEmitter.prototype.on = function(type, listener, async) {
    return this._on(type, listener, false, async);
  };

  EventEmitter.prototype.prependListener = function(type, listener, async) {
    return this._on(type, listener, true, async);
  };

  EventEmitter.prototype.onAny = function(fn) {
    return this._onAny(fn, false);
  };

  EventEmitter.prototype.prependAny = function(fn) {
    return this._onAny(fn, true);
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype._onAny = function(fn, prepend){
    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    // Add the function to the event listener collection.
    if(prepend){
      if(this._all){
        this._all.unshift(fn);
      }else{
        this._all= [fn];
      }
    }else{
      if(this._all){
        this._all.push(fn);
      }else{
        this._all= [fn];
      }
    }

    return this;
  };

  EventEmitter.prototype._on = function(type, listener, prepend, options) {
    if (typeof type === 'function') {
      this._onAny(type, listener);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }

    if(options!==undefined){
      var async, wrap;
      if (options === true) {
        wrap = true;
      } else if (options === false) {
        async = true;
      } else {
        if (typeof options !== 'object') {
          throw TypeError('options should be a boolean|object');
        }
        async = options.async;
        wrap = options.promise;
      }

      if(async || wrap) {
        var _listener = listener;
        var _origin = listener._origin || listener;

        listener = function () {
          var args = arguments;
          var context = this;
          var event = this.event;

          return wrap ? new Promise(function (resolve) {
            _setImmediate(resolve);
          }).then(function () {
            context.event = event;
            return _listener.apply(context, args)
          }) : _setImmediate(function () {
            context.event = event;
            return _listener.apply(context, args)
          })
        };

        listener._async = true;
        listener._origin = _origin;
      }
    }

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    if (this._newListener) {
      this.emit('newListener', type, listener);
    }

    if (this._wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    var _events= this._events;

    if (!_events) {
      _events = this._events = new FlatObject();
      _events[type]= listener;
      this._eventsCount = 1;
      return this;
    } else {
      this._eventsCount++;
    }

    var listeners= _events[type];

    if (!listeners) {
      _events[type] = listener;
    } else {
      var _maxListeners = this._maxListeners;

      if (typeof listeners === 'function') {
        // Change to array.
        listeners = _events[type] = prepend? [listener, listeners] : [listeners, listener];
        if (_maxListeners === 1) {
          listeners.warned = true;
          logPossibleMemoryLeak.call(this, listeners.length, type);
        }
        return this;
      } else {
        // If we've already got an array, just add
        if (prepend) {
          listeners.unshift(listener);
        } else {
          listeners.push(listener);
        }
        // Check for listener leak
        if (_maxListeners > 0 && !listeners.warned && listeners.length > _maxListeners) {
          listeners.warned = true;
          logPossibleMemoryLeak.call(this, listeners.length, type);
        }
      }
    }
    return this;
  };

  EventEmitter.prototype.off = function (type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var wildcard= this._wildcard, handlers, handler, leafs = [], _events, len;
    var _removeListener= this._removeListener;

    if (wildcard) {
      var ns = typeof type === 'string' ? type.split(this._delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this._listenerTree, 0);
    } else {
      _events = this._events;
      // does not use listeners(), so no side effect of creating _events[type]
      if (!_events || !(handlers = _events[type])) return this;
      leafs = [{_listeners: handlers}];
    }

    for (var iLeaf = 0; iLeaf < leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (typeof handlers === 'function') {
        if (handlers === listener || handlers.listener === listener || handlers._origin === listener) {
          if (wildcard) {
            delete leaf._listeners;
          } else {
            delete _events[type];
          }
          if (_removeListener) {
            this.emit("removeListener", type, listener);
          }
        }
      } else {
        var position = -1;

        len= handlers.length;

        for (var i = 0; i < len; i++) {
          handler= handlers[i];
          if (handler === listener || handler.listener === listener || handler._origin === listener) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          continue;
        }

        len= handlers.length;

        if (len === 1) {
          if (wildcard) {
            delete leaf._listeners;
          } else {
            delete _events[type];
          }
        } else {
            handlers.splice(position, 1);
        }

        if (_removeListener) {
          this.emit("removeListener", type, listener);
        }

        return this;
      }
    }

    wildcard && recursivelyGarbageCollect(this._listenerTree);

    return this;
  };

  EventEmitter.prototype.offAny = function (fn) {
    var i = 0, l = 0, fns;
    var _all = this._all;
    if (_all) {
      if (fn) {
        fns = _all;
        l = fns.length;
        if (l === 1) {
          this._all = null;
          if (this._removeListener) {
            this.emit("removeListenerAny", fn);
          }
          return this;
        } else {
          for (i = 0; i < l; i++) {
            if (fn === fns[i]) {
              fns.splice(i, 1);
              if (this._removeListener) {
                this.emit("removeListenerAny", fn);
              }
              return this;
            }
          }
        }
      } else {
        fns = _all;
        if (this._removeListener) {
          for (i = 0, l = fns.length; i < l; i++) {
            this.emit("removeListenerAny", fns[i]);
          }
        }
        this._all = null;
      }
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function (type) {
    var wildcard= this._wildcard;
    if (type === undefined) {
      if(wildcard){
        this._listenerTree= null;
      }else{
        this._events= null;
      }
      return this;
    }

    if (wildcard) {
      var ns = typeof type === 'string' ? type.split(this._delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this._listenerTree, 0);

      for (var iLeaf = 0; iLeaf < leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    } else if (this._events) {
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function (type) {
    var _events = this._events;
    var keys, listeners, allListeners;
    var i;
    var listenerTree;

    if (type === undefined) {
      if (this._wildcard) {
        throw Error('event name required for wildcard emitter');
      }

      if (!_events) {
        return [];
      }

      keys = ownKeys(_events);
      i = keys.length;
      allListeners = [];
      while (i-- > 0) {
        listeners = _events[keys[i]];
        if (typeof listeners === 'function') {
          allListeners.push(listeners);
        } else {
          allListeners.push.apply(allListeners, listeners);
        }
      }
      return allListeners;
    } else {
      if (this._wildcard) {
        listenerTree= this._listenerTree;
        if(!listenerTree) return [];
        var handlers = [];
        var ns = typeof type === 'string' ? type.split(this._delimiter) : type.slice();
        searchListenerTree.call(this, handlers, ns, listenerTree, 0);
        return handlers;
      }

      if (!_events) {
        return [];
      }

      listeners = _events[type];

      if (!listeners) {
        return [];
      }
      return typeof listeners === 'function' ? [listeners] : listeners;
    }
  };

  EventEmitter.prototype.eventNames = function(){
    var _events= this._events;
    return _events? ownKeys(_events) : [];
  };

  EventEmitter.prototype.listenerCount = function(type) {
    return this.listeners(type).length;
  };

  EventEmitter.prototype.hasListeners = function (type) {
    if (this._wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this._delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this._listenerTree, 0);
      return handlers.length > 0;
    }

    var _events = this._events;

    return !!(this._all || (type === undefined ? _events : _events[type]));
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  EventEmitter.prototype.waitFor = function (event, options) {
    var self = this;
    var type = typeof options;
    if (type === 'number') {
      options = {timeout: options};
    } else if (type === 'function') {
      options = {filter: options};
    }

    options= resolveOptions(options, {
      timeout: 0,
      filter: undefined,
      handleError: false,
      Promise: Promise,
      overload: false
    }, {
      filter: functionReducer,
      Promise: constructorReducer
    });

    return makeCancelablePromise(options.Promise, function (resolve, reject, onCancel) {
      function listener() {
        var filter= options.filter;
        if (filter && !filter.apply(self, arguments)) {
          return;
        }
        if (options.handleError) {
          var err = arguments[0];
          err ? reject(err) : resolve(toArray.apply(null, arguments).slice(1));
        } else {
          resolve(toArray.apply(null, arguments));
        }
      }

      onCancel(function(){
        self.off(event, listener);
      });

      self._on(event, listener, false);
    }, {
      timeout: options.timeout,
      overload: options.overload
    })
  };

  function once(emitter, name, options) {
    options= resolveOptions(options, {
      Promise: Promise,
      timeout: 0,
      overload: false
    }, {
      Promise: constructorReducer
    });

    var _Promise= options.Promise;

    return makeCancelablePromise(_Promise, function(resolve, reject, onCancel){
      var handler;
      if (typeof emitter.addEventListener === 'function') {
        handler=  function () {
          resolve(toArray.apply(null, arguments));
        };

        onCancel(function(){
          emitter.removeEventListener(name, handler);
        });

        emitter.addEventListener(
            name,
            handler,
            {once: true}
        );
        return;
      }

      var eventListener = function(){
        errorListener && emitter.removeListener('error', errorListener);
        resolve(toArray.apply(null, arguments));
      };

      var errorListener;

      if (name !== 'error') {
        errorListener = function (err){
          emitter.removeListener(name, eventListener);
          reject(err);
        };

        emitter.once('error', errorListener);
      }

      onCancel(function(){
        errorListener && emitter.removeListener('error', errorListener);
        emitter.removeListener(name, eventListener);
      });

      emitter.once(name, eventListener);
    }, {
      timeout: options.timeout,
      overload: options.overload
    });
  }

  var prototype= EventEmitter.prototype;

  Object.defineProperties(EventEmitter, {
    defaultMaxListeners: {
      get: function(){
        return prototype._maxListeners;
      },
      set: function (n) {
        if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
          throw TypeError('n must be a non-negative number')
        }
        prototype._maxListeners = n;
      },
      enumerable: true
    },
    once: {
      value: once,
      writable: true,
      configurable: true
    }
  });

  function prop(value){
    return {
      configurable: true,
      value: value,
      writable: true
    };
  }

  function reflectPrivateProp(prop, getter){
    var privateProp= '_' + prop;
    return {
      get: getter || function(){
        return this[privateProp]
      },

      set: function(){
        throw Error('Unable to change read-only property \''+prop+'\'');
      },

      configurable: true
    }
  }

  Object.defineProperties(prototype, {
    _maxListeners: prop(defaultMaxListeners),
    _newListener: prop(false),
    _removeListener: prop(false),
    _wildcard: prop(false),
    _ignoreErrors: prop(false),
    _delimiter: prop('.'),
    _observers: prop(null),
    _all: prop(null),
    _events: prop(null),
    _listenerTree: prop(null),
    event: prop(''),
    verboseMemoryLeak: prop(false),
    maxListeners: reflectPrivateProp('maxListeners'),
    wildcard: reflectPrivateProp('wildcard'),
    ignoreErrors: reflectPrivateProp('ignoreErrors'),
    delimiter: reflectPrivateProp('delimiter')
  });

  if (typeof define === 'function' && define.amd) {
     // AMD. Register as an anonymous module.
    define(function() {
      return EventEmitter;
    });
  } else if (typeof exports === 'object') {
    // CommonJS
    module.exports = EventEmitter;
  } else {
    // global for any kind of environment.
    var _global= new Function('return this')();
    _global.EventEmitter2 = EventEmitter;
  }
}();
