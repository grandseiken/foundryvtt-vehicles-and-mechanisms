
const VEHICLES = {
  SCOPE: "vehicles",
  LOG_PREFIX: "Vehicles | ",
};

class Vehicles {
  constructor() {
    console.log(VEHICLES.LOG_PREFIX, "Initialized");
    Hooks.on("createToken", this._onCreateToken.bind(this));
    Hooks.on("deleteToken", this._onDeleteToken.bind(this));
    Hooks.on("updateToken", this._onUpdateToken.bind(this));
    Hooks.on("preUpdateDrawing", this._onPreUpdateDrawing.bind(this));
    Hooks.on("renderDrawingConfig", this._onRenderDrawingConfig.bind(this));
    Hooks.on("ready", this._refreshPositions.bind(this));
    Hooks.on("createScene", this._refreshPositions.bind(this));
    Hooks.on("updateScene", this._refreshPositions.bind(this));
    Hooks.on("deleteScene", this._refreshPositions.bind(this));
    this._lastState = {};
  }

  _refreshPositions() {
    this._lastState = {};
    for (const scene of game.scenes) {
      const sceneData = {};
      for (const token of scene.data.tokens) {
        sceneData[token._id] = {x: token.x, y: token.y, rotation: token.rotation};
      }
      this._lastState[scene._id] = sceneData;
    }
  }

  _injectDrawingConfigTab(app, html, data) {
    let flags = {};
    if (data.object.flags && data.object.flags[VEHICLES.SCOPE]) {
      flags = data.object.flags[VEHICLES.SCOPE];
    }

    const tab = `<a class="item" data-tab="vehicles"><i class="fas fa-ship"></i> Vehicles</a>`;
    const contents = `
    <div class="tab" data-tab="vehicles">
      <p class="notes">Use this Drawing to define a vehicle.</p>
      <hr>
      <div class="form-group">
        <label for="vehiclesControllerToken">Name of controller token</label>
        <input type="text" name="vehiclesControllerToken" data-dtype="String"/>
        <p class="notes">Name of the token that will be used to control this vehicle.</p>
      </div>
      <hr>
      <p class="notes">Choose which elements within the Drawing will be moved together as part of the vehicle.</p>
      <div class="form-group">
        <label for="vehiclesCaptureTokens">Capture tokens</label>
        <input type="checkbox" name="vehiclesCaptureTokens" data-dtype="Boolean"/>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureTiles">Capture tiles</label>
        <input type="checkbox" name="vehiclesCaptureTiles" data-dtype="Boolean"/>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureWalls">Capture walls</label>
        <input type="checkbox" name="vehiclesCaptureWalls" data-dtype="Boolean"/>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureLights">Capture lights</label>
        <input type="checkbox" name="vehiclesCaptureLights" data-dtype="Boolean"/>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureSounds">Capture sounds</label>
        <input type="checkbox" name="vehiclesCaptureSounds" data-dtype="Boolean"/>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureDrawings">Capture drawings</label>
        <input type="checkbox" name="vehiclesCaptureDrawings" data-dtype="Boolean"/>
      </div>
    </div>`;

    html.find(".tabs .item").last().after(tab);
    html.find(".tab").last().after(contents);
    const vehiclesTab = html.find(".tab").last();
    const input = (name) => vehiclesTab.find(`input[name="${name}"]`);

    input("vehiclesControllerToken").prop("value", flags.controllerToken);
    input("vehiclesCaptureTokens").prop("checked", flags.captureTokens);
    input("vehiclesCaptureTiles").prop("checked", flags.captureTiles);
    input("vehiclesCaptureWalls").prop("checked", flags.captureWalls);
    input("vehiclesCaptureLights").prop("checked", flags.captureLights);
    input("vehiclesCaptureSounds").prop("checked", flags.captureSounds);
    input("vehiclesCaptureDrawings").prop("checked", flags.captureDrawings);

    if (!game.multilevel._isUserGamemaster(game.user._id)) {
      vehiclesTab.find("input").prop("disabled", true);
    }
  }

  _convertDrawingConfigUpdateData(data, update) {
    if (!("vehiclesCaptureTokens" in update) && (!update.flags || !update.flags[VEHICLES.SCOPE])) {
      return;
    }

    const convertFlag = (inputName, flagName) => {
      if (!(inputName in update)) {
        return;
      }
      if (!data.flags || !data.flags[VEHICLES.SCOPE] || data.flags[VEHICLES.SCOPE][flagName] !== update[inputName]) {
        if (!update.flags) {
          update.flags = {};
        }
        if (!update.flags[VEHICLES.SCOPE]) {
          update.flags[VEHICLES.SCOPE] = {};
        }
        update.flags[VEHICLES.SCOPE][flagName] = update[inputName];
      }
      delete update[inputName];
    };

    convertFlag("vehiclesControllerToken", "controllerToken");
    convertFlag("vehiclesCaptureTokens", "captureTokens");
    convertFlag("vehiclesCaptureTiles", "captureTiles");
    convertFlag("vehiclesCaptureWalls", "captureWalls");
    convertFlag("vehiclesCaptureLights", "captureLights");
    convertFlag("vehiclesCaptureSounds", "captureSounds");
    convertFlag("vehiclesCaptureDrawings", "captureDrawings");

    if (update.flags && update.flags[VEHICLES.SCOPE] && update.flags[VEHICLES.SCOPE].controllerToken) {
      update.hidden = true;
    }
  }

  _onCreateToken(scene, token, options, userId) {
    this._lastState[scene._id][token._id] = {x: token.x, y: token.y, rotation: token.rotation};
  }

  _onDeleteToken(scene, token, options, userId) {
    delete this._lastState[scene._id][token._id];
  }

  _onUpdateToken(scene, token, update, options, userId) {
    if (!game.multilevel._isProperToken(token) || !('x' in update || 'y' in update || 'rotation' in update)) {
      return;
    }
    // TODO: better way to identify controller tokens so we don't have to do this for every update.
    // TODO: auto-capture vs. capture current.
    // TODO: recursive search to find all things that should be moved, including other controlled tokens and their vehicles at once.
    const controller = token.name;
    const state = {x: token.x, y: token.y, rotation: token.rotation};
    const lastState = duplicate(this._lastState[scene._id][token._id]);
    game.multilevel._queueAsync(requestBatch => {
      for (const vehicleScene of game.scenes) {
        const controlledVehicles = vehicleScene.data.drawings.filter(d =>
            d.flags[VEHICLES.SCOPE] && d.flags[VEHICLES.SCOPE].controllerToken === controller);
        if (!controlledVehicles.length) {
          continue;
        }

        const capturedTokens = vehicleScene.data.tokens.filter(t =>
          (scene._id !== vehicleScene._id || t._id !== token._id) && controlledVehicles.some(v =>
              v.flags[VEHICLES.SCOPE].captureTokens && game.multilevel._isPointInRegion(game.multilevel._getTokenCentre(scene, t), v)));

        controlledVehicles.forEach(t =>
            requestBatch.updateDrawing(scene, {_id: t._id, x: t.x + state.x - lastState.x, y: t.y + state.y - lastState.y}));
        capturedTokens.forEach(t =>
            requestBatch.updateToken(scene, {_id: t._id, x: t.x + state.x - lastState.x, y: t.y + state.y - lastState.y}));
      }
    });
    this._lastState[scene._id][token._id] = duplicate(state);
  }

  _onPreUpdateDrawing(scene, drawing, update, options, userId) {
    this._convertDrawingConfigUpdateData(drawing, update);
    return true;
  }

  _onRenderDrawingConfig(app, html, data) {
    if (game.multilevel._isAuthorisedRegion(data.object)) {
      this._injectDrawingConfigTab(app, html, data);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
