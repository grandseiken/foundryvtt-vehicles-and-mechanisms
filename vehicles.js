const VEHICLES = {
  SCOPE: "vehicles",
  LOG_PREFIX: "Vehicles | ",
  BYPASS: "vehicles_bypass",
  CAPTURE_NONE: 0,
  CAPTURE_AUTO: 1,
  CAPTURE_MANUAL: 2,
  CONTROL_SCHEME_ABSOLUTE: 0,
  CONTROL_SCHEME_TANK: 1,
  CONTROL_SCHEME_RELATIVE: 2,
};

  // TODO: better way to identify controller tokens?
  // TODO: finish auto-capture vs. capture current.
  // TODO: amplification / coefficient / etc
  // TODO: rename to Vehicles and Mechanisms
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
    Hooks.on("renderDrawingHUD", this._onRenderDrawingHUD.bind(this));
    Hooks.on("ready", this._refreshState.bind(this));
    Hooks.on("createScene", this._refreshState.bind(this));
    Hooks.on("updateScene", this._refreshState.bind(this));
    Hooks.on("deleteScene", this._refreshState.bind(this));
    this._controllerMap = {};
    this._vehicleMap = {};
  }

  _injectVehicleHUD(hud, html, drawing) {
    const flags = drawing.flags[VEHICLES.SCOPE];
    const allCaptures = [flags.captureTokens, flags.captureDrawings, flags.captureTiles,
                         flags.captureWalls, flags.captureLights, flags.captureSounds];
    if (!allCaptures.some(c => c === VEHICLES.CAPTURE_MANUAL)) {
      return;
    }
    const icon = `<div class="control-icon vehicles-capture">
      <img src="icons/svg/target.svg" width="36" height="36" title="Manual Vehicle Capture">
    </div>
    <div class="control-icon vehicles-release">
      <img src="icons/svg/explosion.svg" width="36" height="36" title="Manual Vehicle Release">
    </div>`;
    html.find(".col.right .control-icon").last().after(icon);
  }

  _injectDrawingConfigTab(app, html, data) {
    let flags = {};
    if (data.object.flags && data.object.flags[VEHICLES.SCOPE]) {
      flags = data.object.flags[VEHICLES.SCOPE];
    }

    const tab = `<a class="item" data-tab="vehicles"><i class="fas fa-ship"></i> Vehicles</a>`;
    const captureOptions = `
    <option value="${VEHICLES.CAPTURE_NONE}">None</option>
    <option value="${VEHICLES.CAPTURE_AUTO}">Auto</option>
    <option value="${VEHICLES.CAPTURE_MANUAL}">Manual</option>
    `;
    const contents = `
    <div class="tab" data-tab="vehicles">
      <p class="notes">Use this Drawing to define a vehicle.</p>
      <hr>
      <p class="notes">Choose which elements within the Drawing will be moved together as part of the vehicle.
      <b>Auto</b> means elements will be captured whenever they lie within the drawing.
      <b>Manual</b> means elements are only captured if they lie within the drawing when the <b>Capture</b> Drawing HUD option is used.</p>
      <div class="form-group">
        <label for="vehiclesCaptureTokens">Capture tokens</label>
        <select name="vehiclesCaptureTokens" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureDrawings">Capture drawings</label>
        <select name="vehiclesCaptureDrawings" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureTiles">Capture tiles</label>
        <select name="vehiclesCaptureTiles" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureWalls">Capture walls</label>
        <select name="vehiclesCaptureWalls" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureLights">Capture lights</label>
        <select name="vehiclesCaptureLights" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureSounds">Capture sounds</label>
        <select name="vehiclesCaptureSounds" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <hr>
      <div class="form-group">
        <label for="vehiclesFixTokenOrientation">Fix token orientation</label>
        <input type="checkbox" name="vehiclesFixTokenOrientation" data-dtype="Boolean"/>
        <p class="notes">Preserve captured token orientation when moved due to vehicle rotation.</p>
      </div>
      <hr>
      <div class="form-group">
        <label for="vehiclesControllerToken">Name of controller token</label>
        <input type="text" name="vehiclesControllerToken" data-dtype="String"/>
        <p class="notes">Name of the token that will be used to control this vehicle.</p>
      </div>
      <div class="form-group">
        <label for="vehiclesControlScheme">Token control scheme</label>
        <select name="vehiclesControlScheme" data-dtype="Number">
          <option value="${VEHICLES.CONTROL_SCHEME_ABSOLUTE}">Absolute</option>
          <option value="${VEHICLES.CONTROL_SCHEME_TANK}">Tank</option>
          <option value="${VEHICLES.CONTROL_SCHEME_RELATIVE}">Relative</option>
        </select>
        <p class="notes">Determines how movement of the controller token translates into movement of the vehicle. <b>Assuming that both vehicle and token begin (unrotated) facing upwards</b>,
        <b>Absolute</b> means: controller token moves <b>up</b>, vehicle moves <b>up</b>;
        <b>Tank</b> means: controller token moves <b>up</b>, vehicle moves <b>forwards</b>;
        <b>Relative</b> means: controller token moves <b>forwards</b>, vehicle moves <b>forwards</b>.</p>
      </div>
    </div>`;

    html.find(".tabs .item").last().after(tab);
    html.find(".tab").last().after(contents);
    const vehiclesTab = html.find(".tab").last();
    const input = (name) => vehiclesTab.find(`input[name="${name}"]`);
    const select = (name) => vehiclesTab.find(`select[name="${name}"]`)

    input("vehiclesControllerToken").prop("value", flags.controllerToken);
    select("vehiclesControlScheme").val(flags.controlScheme || 0);
    input("vehiclesFixTokenOrientation").prop("checked", flags.fixTokenOrientation);
    select("vehiclesCaptureTokens").val(flags.captureTokens || 0);
    select("vehiclesCaptureDrawings").val(flags.captureDrawings || 0);
    select("vehiclesCaptureTiles").val(flags.captureTiles || 0);
    select("vehiclesCaptureWalls").val(flags.captureWalls || 0);
    select("vehiclesCaptureLights").val(flags.captureLights || 0);
    select("vehiclesCaptureSounds").val(flags.captureSounds || 0);

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
    convertFlag("vehiclesControlScheme", "controlScheme");
    convertFlag("vehiclesFixTokenOrientation", "fixTokenOrientation");
    convertFlag("vehiclesCaptureTokens", "captureTokens");
    convertFlag("vehiclesCaptureDrawings", "captureDrawings");
    convertFlag("vehiclesCaptureTiles", "captureTiles");
    convertFlag("vehiclesCaptureWalls", "captureWalls");
    convertFlag("vehiclesCaptureLights", "captureLights");
    convertFlag("vehiclesCaptureSounds", "captureSounds");

    if (update.flags && update.flags[VEHICLES.SCOPE] && update.flags[VEHICLES.SCOPE].controllerToken) {
      update.hidden = true;
    }
  }

  _isVehicle(drawing) {
    if (!drawing.flags || !drawing.flags[VEHICLES.SCOPE]) {
      return false;
    }
    const flags = drawing.flags[VEHICLES.SCOPE];
    return flags.controllerToken || flags.captureTokens || flags.captureDrawings || flags.captureTiles ||
           flags.captureWalls ||flags.captureLights || flags.captureSounds;
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

  _mapVehicleMoveDirection(controllerToken, vehicle, deltaVector) {
    const controlScheme = vehicle.flags[VEHICLES.SCOPE].controlScheme;
    if (controlScheme === VEHICLES.CONTROL_SCHEME_TANK) {
      return game.multilevel._rotate({x: 0, y: 0}, deltaVector, vehicle.rotation);
    }
    if (controlScheme === VEHICLES.CONTROL_SCHEME_RELATIVE) {
      return game.multilevel._rotate({x: 0, y: 0}, deltaVector, vehicle.rotation - controllerToken.rotation);
    }
    return deltaVector;
  }

  _getUpdateData(object, diff) {
    return {
      _id: object._id,
      x: object.x + diff.x,
      y: object.y + diff.y,
      rotation: object.rotation + diff.r,
    };
  }

  _runVehicleMoveAlgorithm(requestBatch, handled, queue) {
    const relativeDiff = (centre, point, diff) => {
      const result = duplicate(diff);
      const offset = game.multilevel._rotate(centre, point, diff.r);
      result.x += offset.x - point.x;
      result.y += offset.y - point.y;
      return result;
    };

    const handleSimpleCapture = (vehicleScene, vehicle, vehicleCentre, diff,
                                 type, elements, centreFunction, updateFunction) => {
      for (const e of elements) {
        const centre = centreFunction(e);
        const eId = this._typedUniqueId(type, vehicleScene, e);
        if (handled[eId] || !game.multilevel._isPointInRegion(centre, vehicle)) {
          continue;
        }
        updateFunction(this._getUpdateData(e, relativeDiff(vehicleCentre, centre, diff)));
        handled[eId] = true;
      }
    }

    for (let i = 0; i < queue.length; ++i) {
      const diff = queue[i];
      const [vehicleScene, vehicle] = diff.vehicle;
      const vehicleCentre = game.multilevel._getDrawingCentre(vehicle);

      if (vehicle.flags[VEHICLES.SCOPE].captureTiles === VEHICLES.CAPTURE_AUTO) {
        handleSimpleCapture(vehicleScene, vehicle, vehicleCentre, diff,
                            "T", vehicleScene.data.tiles,
                            e => game.multilevel._getDrawingCentre(e),
                            u => requestBatch.updateTile(vehicleScene, u));
      }
      if (vehicle.flags[VEHICLES.SCOPE].captureLights === VEHICLES.CAPTURE_AUTO) {
        handleSimpleCapture(vehicleScene, vehicle, vehicleCentre, diff,
                            "l", vehicleScene.data.lights, e => e,
                            u => requestBatch.updateLight(vehicleScene, u));
      }
      if (vehicle.flags[VEHICLES.SCOPE].captureSounds === VEHICLES.CAPTURE_AUTO) {
        handleSimpleCapture(vehicleScene, vehicle, vehicleCentre, diff,
                            "s", vehicleScene.data.sounds, e => e,
                            u => requestBatch.updateSound(vehicleScene, u));
      }

      if (vehicle.flags[VEHICLES.SCOPE].captureDrawings === VEHICLES.CAPTURE_AUTO) {
        for (const vd of vehicleScene.data.drawings) {
          const centre = game.multilevel._getDrawingCentre(vd);
          const vdId = this._typedUniqueId("d", vehicleScene, vd);
          if (handled[vdId] || !game.multilevel._isPointInRegion(centre, vehicle)) {
            continue;
          }

          const rDiff = relativeDiff(vehicleCentre, centre, diff);
          const vdUpdate = this._getUpdateData(vd, rDiff);
          requestBatch.updateDrawing(vehicleScene, vdUpdate);
          handled[vdId] = true;

          const subVehicleState = this._vehicleMap[this._uniqueId(vehicleScene, vd)];
          if (subVehicleState) {
            queue.push({
              vehicle: [vehicleScene, vd],
              x: rDiff.x,
              y: rDiff.y,
              r: rDiff.r,
            });
            subVehicleState.x = vdUpdate.x;
            subVehicleState.y = vdUpdate.y;
            subVehicleState.r = vdUpdate.rotation;
          }
        }
      }

      if (vehicle.flags[VEHICLES.SCOPE].captureTokens === VEHICLES.CAPTURE_AUTO) {
        for (const vt of vehicleScene.data.tokens) {
          const centre = game.multilevel._getTokenCentre(vehicleScene, vt);
          const vtId = this._typedUniqueId("t", vehicleScene, vt);
          if (handled[vtId] || !game.multilevel._isPointInRegion(centre, vehicle)) {
            continue;
          }

          const rDiff = relativeDiff(vehicleCentre, centre, diff);
          if (vehicle.flags[VEHICLES.SCOPE].fixTokenOrientation) {
            rDiff.r = 0;
          }
          const vtUpdate = this._getUpdateData(vt, rDiff);
          requestBatch.updateToken(vehicleScene, vtUpdate);
          handled[vtId] = true;

          const controller = this._controllerMap[this._uniqueId(vehicleScene, vt)];
          if (controller) {
            for (const v of controller.vehicles) {
              const vdId = this._typedUniqueId("d", v[0], v[1]);
              const vehicleState = this._vehicleMap[this._uniqueId(v[0], v[1])];
              if (handled[vdId] || !vehicleState) {
                continue;
              }
              const deltaVector = this._mapVehicleMoveDirection(vt, v[1], {x: rDiff.x, y: rDiff.y});
              const vDiff = duplicate(rDiff);
              vDiff.x = deltaVector.x;
              vDiff.y = deltaVector.y;
              const vUpdate = this._getUpdateData(v[1], vDiff);
              requestBatch.updateDrawing(v[0], vUpdate);
              queue.push({
                vehicle: v,
                x: vDiff.x,
                y: vDiff.y,
                r: vDiff.r,
              });
              vehicleState.x = vUpdate.x;
              vehicleState.y = vUpdate.y;
              vehicleState.r = vUpdate.rotation;
              handled[vdId] = true;
            }
            controller.x = vtUpdate.x;
            controller.y = vtUpdate.y;
            controller.r = vtUpdate.rotation;
          }
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
      const vehicleState = this._vehicleMap[this._uniqueId(v[0], v[1])];
      if (!vehicleState) {
        continue;
      }
      const deltaVector = this._mapVehicleMoveDirection(token, v[1], {
        x: token.x - controller.x,
        y: token.y - controller.y,
      });
      const diff = {
        vehicle: v,
        x: deltaVector.x,
        y: deltaVector.y,
        r: token.rotation - controller.r,
      };
      const update = this._getUpdateData(v[1], diff);
      vehicleState.x = update.x;
      vehicleState.y = update.y;
      vehicleState.r = update.rotation;
      queue.push(diff);
      requestBatch.updateDrawing(v[0], update);
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

  _onRenderDrawingHUD(hud, html, drawing) {
    if (game.multilevel._isAuthorisedRegion(drawing) && this._isVehicle(drawing)) {
      this._injectVehicleHUD(hud, html, drawing);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
