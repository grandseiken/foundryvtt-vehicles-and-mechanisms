const VEHICLES = {
  SCOPE: "vehicles",
  LOG_PREFIX: "Vehicles | ",
  BYPASS: "vehicles_bypass",
};

class Vehicles {
  constructor() {
    console.log(VEHICLES.LOG_PREFIX, "Initialized");
    Hooks.on("createToken", this._onCreateToken.bind(this));
    Hooks.on("deleteToken", this._onDeleteToken.bind(this));
    Hooks.on("preUpdateToken", this._onPreUpdateToken.bind(this));
    Hooks.on("updateToken", this._onUpdateToken.bind(this));
    Hooks.on("createDrawing", this._onCreateDrawing.bind(this));
    Hooks.on("deleteDrawing", this._onDeleteDrawing.bind(this));
    Hooks.on("preUpdateDrawing", this._onPreUpdateDrawing.bind(this));
    Hooks.on("updateDrawing", this._onUpdateDrawing.bind(this));
    Hooks.on("renderDrawingConfig", this._onRenderDrawingConfig.bind(this));
    Hooks.on("ready", this._refreshState.bind(this));
    Hooks.on("createScene", this._refreshState.bind(this));
    Hooks.on("updateScene", this._refreshState.bind(this));
    Hooks.on("deleteScene", this._refreshState.bind(this));
    this._controllerMap = {};
    this._vehicleMap = {};
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

  _isVehicle(drawing) {
    if (!drawing.flags || !drawing.flags[VEHICLES.SCOPE]) {
      return false;
    }
    // TODO
    const flags = drawing.flags[VEHICLES.SCOPE];
    return flags.controllerToken || flags.captureTokens || flags.captureTiles || flags.captureWalls ||
           flags.captureLights || flags.captureSounds || flags.captureDrawings;
  }

  _uniqueId(scene, object) {
    return scene._id + ":" + object._id;
  }

  _typedUniqueId(type, scene, object) {
    return type + ":" + this._uniqueId(scene, object);
  }

  _refreshState() {
    this._refreshControllerMap();
    this._refreshVehicleMap();
  }

  _refreshControllerMap() {
    if (!game.user.isGM) {
      return;
    }
    this._controllerMap = {};
    for (const scene of game.scenes) {
      for (const token of scene.data.tokens) {
        this._refreshControllerMapForToken(scene, token);
      }
    }
  }

  _refreshVehicleMap() {
    if (!game.user.isGM) {
      return;
    }
    this._vehicleMap = {};
    for (const scene of game.scenes) {
      for (const drawing of scene.data.drawings) {
        this._refreshVehicleMapForVehicle(scene, drawing);
      }
    }
  }

  _refreshControllerMapForToken(scene, token) {
    if (!game.user.isGM) {
      return;
    }
    const id = this._uniqueId(scene, token);
    delete this._controllerMap[id];
    for (const vehicleScene of game.scenes) {
      for (const drawing of vehicleScene.data.drawings) {
        if (drawing.flags[VEHICLES.SCOPE] &&
            drawing.flags[VEHICLES.SCOPE].controllerToken === token.name) {
          if (!this._controllerMap[id]) {
            this._controllerMap[id] = {
              x: token.x,
              y: token.y,
              r: token.rotation,
              vehicles: [],
            };
          }
          this._controllerMap[id].vehicles.push([vehicleScene, drawing]);
        }
      }
    }
  }

  _refreshVehicleMapForVehicle(scene, drawing) {
    this._vehicleMap[this._uniqueId(scene, drawing)] = {
      x: drawing.x,
      y: drawing.y,
      r: drawing.rotation,
    };
  }

  _runVehicleMoveAlgorithm(requestBatch, handled, queue) {
    for (let i = 0; i < queue.length; ++i) {
      const diff = queue[i];
      const [vehicleScene, vehicle] = diff.vehicle;
      const vehicleCentre = game.multilevel._getDrawingCentre(vehicle);

      if (vehicle.flags[VEHICLES.SCOPE].captureTokens) {
        for (const vt of vehicleScene.data.tokens) {
          const centre = game.multilevel._getTokenCentre(vehicleScene, vt);
          const vtId = this._typedUniqueId("t", vehicleScene, vt);
          if (handled[vtId] || !game.multilevel._isPointInRegion(centre, vehicle)) {
            continue;
          }

          requestBatch.updateToken(vehicleScene, {
            _id: vt._id,
            x: vt.x + diff.x,
            y: vt.y + diff.y,
            rotation: vt.rotation + diff.r,
          });
          const controller = this._controllerMap[this._uniqueId(vehicleScene, vt)];
          if (controller) {
            for (const v of controller.vehicles) {
              const vdId = this._typedUniqueId("d", v[0], v[1]);
              const vehicleState = this._vehicleMap[this._uniqueId(v[0], v[1])];
              if (handled[vdId] || !vehicleState) {
                continue;
              }
              requestBatch.updateDrawing(v[0], {
                _id: v[1]._id,
                x: v[1].x + diff.x,
                y: v[1].y + diff.y,
                rotation: v[1].rotation + diff.r,
              });
              queue.push({
                vehicle: v,
                x: diff.x,
                y: diff.y,
                r: diff.r,
              });
              vehicleState.x = v[1].x + diff.x;
              vehicleState.y = v[1].y + diff.y;
              vehicleState.r = v[1].rotation + diff.r;
              handled[vdId] = true;
            }
            controller.x = vt.x + diff.x;
            controller.y = vt.y + diff.y;
            controller.r = vt.rotation + diff.r;
          }
          handled[vtId] = true;
        }
      }
    }
  }

  _queueVehicleMoveByDrawing(requestBatch, scene, drawing, vehicleState) {
    const handled = {};
    const queue = [];

    const copy = duplicate(drawing);
    copy.x = vehicleState.x;
    copy.y = vehicleState.y;
    copy.rotation = vehicleState.rotation;
    queue.push({
      vehicle: [scene, copy],
      x: drawing.x - vehicleState.x,
      y: drawing.y - vehicleState.y,
      r: drawing.rotation - vehicleState.r,
    });
    vehicleState.x = drawing.x;
    vehicleState.y = drawing.y;
    vehicleState.r = drawing.rotation;
    handled[this._typedUniqueId("d", scene, drawing)] = true;
    this._runVehicleMoveAlgorithm(requestBatch, handled, queue);
  }

  _queueVehicleMoveByController(requestBatch, scene, token, controller) {
    const handled = {};
    const queue = [];

    for (const v of controller.vehicles) {
      const diff = {
        vehicle: v,
        x: token.x - controller.x,
        y: token.y - controller.y,
        r: token.rotation - controller.r,
      };
      queue.push(diff);
      requestBatch.updateDrawing(v[0], {
        _id: v[1]._id,
        x: v[1].x + diff.x,
        y: v[1].y + diff.y,
        rotation: v[1].rotation + diff.r,
      });
      handled[this._typedUniqueId("d", v[0], v[1])] = true;
    }
    controller.x = token.x;
    controller.y = token.y;
    controller.r = token.rotation;
    handled[this._typedUniqueId("t", scene, token)] = true;
    this._runVehicleMoveAlgorithm(requestBatch, handled, queue);
  }

  _onCreateToken(scene, token, options, userId) {
    this._refreshControllerMapForToken(scene, token);
  }

  _onDeleteToken(scene, token, options, userId) {
    if (game.user.isGM) {
      delete this._controllerMap[this._uniqueId(scene, token)];
    }
  }

  _onPreUpdateToken(scene, token, update, options, userId) {
    if (game.keyboard.isDown("Alt") && game.user.isGM) {
      options[VEHICLES.BYPASS] = true;
    }
    return true;
  }

  _onUpdateToken(scene, token, update, options, userId) {
    if (!game.user.isGM) {
      return;
    }

    if ("name" in update) {
      this._refreshControllerMapForToken(scene, token);
    }
    const controller = this._controllerMap[this._uniqueId(scene, token)];
    if (!controller) {
      return;
    }

    if (!game.multilevel._isProperToken(token) ||
        !game.multilevel._isPrimaryGamemaster() ||
        MLT.REPLICATED_UPDATE in options || VEHICLES.BYPASS in options ||
        !("x" in update || "y" in update || "rotation" in update)) {
      controller.x = token.x;
      controller.y = token.y;
      controller.r = token.rotation;
      return;
    }

    // TODO: better way to identify controller tokens.
    // TODO: auto-capture vs. capture current.
    // TODO: recursive search to find all things that should be moved, including other controlled tokens and their vehicles at once.
    // TODO: rotate drawing to rotate controls; flip X / Y as well? Does that work? Optional?
    const t = duplicate(token);
    game.multilevel._queueAsync(requestBatch => this._queueVehicleMoveByController(requestBatch, scene, t, controller));
  }

  _onCreateDrawing(scene, drawing, options, userId) {
    if (game.user.isGM && this._isVehicle(drawing)) {
      this._refreshVehicleMapForVehicle(scene, drawing);
    }
  }

  _onDeleteDrawing(scene, drawing, options, userId) {
    if (game.user.isGM) {
      delete this._vehicleMap[this._uniqueId(scene, drawing)];
    }
  }

  _onPreUpdateDrawing(scene, drawing, update, options, userId) {
    if (game.keyboard.isDown("Alt") && game.user.isGM) {
      options[VEHICLES.BYPASS] = true;
    }
    this._convertDrawingConfigUpdateData(drawing, update);
    return true;
  }

  _onUpdateDrawing(scene, drawing, update, options, userId) {
    if (!game.user.isGM) {
      return;
    }
    const id = this._uniqueId(scene, drawing);
    if (!this._isVehicle(drawing)) {
      delete this._vehicleMap[id];
      return;
    }
    if (update.flags && update.flags[VEHICLES.SCOPE] && "controllerToken" in update.flags[VEHICLES.SCOPE]) {
      this._refreshControllerMap();
    }
    if (!this._vehicleMap[id] || !game.multilevel._isPrimaryGamemaster() ||
        MLT.REPLICATED_UPDATE in options || VEHICLES.BYPASS in options ||
        !("x" in update || "y" in update || "rotation" in update)) {
      this._refreshVehicleMapForVehicle(scene, drawing);
      return;
    }
    const d = duplicate(drawing);
    game.multilevel._queueAsync(requestBatch =>
        this._queueVehicleMoveByDrawing(requestBatch, scene, d, this._vehicleMap[id]));
  }

  _onRenderDrawingConfig(app, html, data) {
    if (game.multilevel._isAuthorisedRegion(data.object)) {
      this._injectDrawingConfigTab(app, html, data);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
