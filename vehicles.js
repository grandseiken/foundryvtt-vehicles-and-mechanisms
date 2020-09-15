const VEHICLES = {
  SCOPE: "vehicles",
  REPLICATED_UPDATE: "vehicles_bypass",
  LOG_PREFIX: "Vehicles | ",
};

class VehiclesRequestBatch {
  constructor() {
    this._scenes = {};
    this._extraActions = [];
  }

  updateToken(scene, data, animate=true) {
    (animate ? this._scene(scene).updateAnimated : this._scene(scene).updateInstant).push(data);
  }

  updateDrawing(scene, data) {
    this._scene(scene).updateDrawing.push(data);
  }

  extraAction(f) {
    this._extraActions.push(f);
  }

  _scene(scene) {
    if (!(scene._id in this._scenes)) {
      this._scenes[scene._id] = {
        updateAnimated: [],
        updateInstant: [],
        updateDrawing: [],
    }
    return this._scenes[scene._id];
  }
}

class Vehicles {
  constructor() {
    this._asyncQueue = null;
    this._asyncCount = 0;
    console.log(VEHICLES.LOG_PREFIX, "Initialized");
  }

  _isUserGamemaster(userId) {
    const user = game.users.get(userId);
    return user ? user.role === CONST.USER_ROLES.GAMEMASTER : false;
  }

  _getActiveGamemasters() {
    return game.users
        .filter(user => user.active && user.role === CONST.USER_ROLES.GAMEMASTER)
        .map(user => user._id)
        .sort();
  }

  _isOnlyGamemaster() {
    if (!game.user.isGM) {
      return false;
    }
    const activeGamemasters = this._getActiveGamemasters();
    return activeGamemasters.length === 1 && activeGamemasters[0] === game.user._id;
  }

  _isPrimaryGamemaster() {
    // To ensure commands are only issued once, return true only if we are the
    // _first_ active GM.
    if (!game.user.isGM) {
      return false;
    }
    const activeGamemasters = this._getActiveGamemasters();
    return activeGamemasters.length > 0 && activeGamemasters[0] === game.user._id;
  }

  _execute(requestBatch) {
    // isUndo: true prevents these commands from being undoable themselves.
    const options = {isUndo: true};
    options[VEHICLES.REPLICATED_UPDATE] = true;

    let promise = Promise.resolve(null);
    for (const [sceneId, data] of Object.entries(requestBatch._scenes)) {
      const scene = game.scenes.get(sceneId);
      if (scene && data.updateAnimated.length) {
        promise = promise.then(() => scene.updateEmbeddedEntity(Token.embeddedName, data.updateAnimated,
                                                                Object.assign({diff: true}, options)));
      }
      if (scene && data.updateInstant.length) {
        promise = promise.then(() => scene.updateEmbeddedEntity(Token.embeddedName, data.updateInstant,
                                                                Object.assign({diff: true, animate: false}, options)));
      }
      if (scene && data.updateDrawing.length) {
        promise = promise.then(() => scene.updateEmbeddedEntity(Drawing.embeddedName, data.updateDrawing,
                                                                Object.assign({diff: true}, options)));
      }
    }
    for (const f of requestBatch._extraActions) {
      promise = promise.then(f);
    }

    return promise;
  }

  // Executing multiple server requests concurrently seems to often result in requests being dropped or ignored.
  // To work around this, we use a batching system to minimize the number of requests we need to make, and queue
  // up requests if there's already some in progress.
  _queueAsync(f) {
    if (!this._isPrimaryGamemaster()) {
      return;
    }
    const batched = () => {
      const requestBatch = new VehiclesRequestBatch();
      f(requestBatch);
      return this._execute(requestBatch);
    };
    const done = () => {
      if (--this._asyncCount === 0) {
        this._asyncQueue = null;
      }
    };
    if (this._asyncCount === 0) {
      const result = batched();
      ++this._asyncCount;
      this._asyncQueue = result.finally(done);
    } else {
      ++this._asyncCount;
      this._asyncQueue = this._asyncQueue.finally(batched).finally(done);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
