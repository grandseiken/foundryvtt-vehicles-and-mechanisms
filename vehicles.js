
const VEHICLES = {
  SCOPE: "vehicles",
  LOG_PREFIX: "Vehicles and Mechanisms | ",
  BYPASS: "vehicles_bypass",
  CAPTURE_NONE: 0,
  CAPTURE_AUTO: 1,
  CAPTURE_MANUAL: 2,
  CONTROL_SCHEME_ABSOLUTE: 0,
  CONTROL_SCHEME_TANK: 1,
  CONTROL_SCHEME_RELATIVE: 2,
};

// TODO: implement walls.
// TOOD: option for tokens to collide with walls. Maybe also to halt movement of vehicle?
// TODO: better system for linking up controller and pivot tokens?
// TODO: do angles need clamping?
// TODO: interaction with teleports. Option for vehicle to move when controller token teleports?
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

    const object = hud.object;
    const vehicleState = this._vehicleMap[this._uniqueId(object.scene, drawing)];
    if (!vehicleState || !allCaptures.some(c => c === VEHICLES.CAPTURE_MANUAL)) {
      return;
    }
    const icon = `<div class="control-icon vehicles-capture">
      <img src="icons/svg/target.svg" width="36" height="36" title="${game.i18n.localize("VEHICLES.IconCaptureNow")}">
    </div>
    <div class="control-icon vehicles-release">
      <img src="icons/svg/explosion.svg" width="36" height="36" title="${game.i18n.localize("VEHICLES.IconReleaseAll")}">
    </div>`;
    html.find(".col.right .control-icon").last().after(icon);
    html.find(".vehicles-capture").click(async () => {
      const capture = this._getVehicleCaptureSet(object.scene, drawing, VEHICLES.CAPTURE_MANUAL);
      const count = capture.tokens.length + capture.drawings.length + capture.tiles.length +
                    capture.walls.length + capture.lights.length + capture.sounds.length;
      const getId = e => e._id;
      const update = {flags: {}};
      update.flags[VEHICLES.SCOPE] = {
        capture: {
          tokens: capture.tokens.map(getId),
          drawings: capture.drawings.map(getId),
          tiles: capture.tiles.map(getId),
          walls: capture.walls.map(getId),
          lights: capture.lights.map(getId),
          sounds: capture.sounds.map(getId),
        },
      };
      await object.update(update);
      ui.notifications.info(game.i18n.format("VEHICLES.NotificationObjectsCaptured", {count: count}));
    });
    html.find(".vehicles-release").click(async () => {
      const currentDrawing = object.scene.data.drawings.find(d => d._id === drawing._id);
      let count = 0;
      if (currentDrawing.flags[VEHICLES.SCOPE] && currentDrawing.flags[VEHICLES.SCOPE].capture) {
        const capture = currentDrawing.flags[VEHICLES.SCOPE].capture;
        count += capture.tokens ? capture.tokens.length : 0;
        count += capture.drawings ? capture.drawings.length : 0;
        count += capture.tiles ? capture.tiles.length : 0;
        count += capture.walls ? capture.walls.length : 0;
        count += capture.lights ? capture.lights.length : 0;
        count += capture.sounds ? capture.sounds.length : 0;
      }
      const update = {flags: {}};
      update.flags[VEHICLES.SCOPE] = {
        capture: {tokens: [], drawings: [], tiles: [], walls: [], lights: [], sounds: []},
      };
      await object.update(update);
      ui.notifications.info(game.i18n.format("VEHICLES.NotificationObjectsReleased", {count: count}));
    });
  }

  _injectDrawingConfigTab(app, html, data) {
    let flags = {};
    if (data.object.flags && data.object.flags[VEHICLES.SCOPE]) {
      flags = data.object.flags[VEHICLES.SCOPE];
    }

    const tab = `<a class="item" data-tab="vehicles"><i class="fas fa-ship"></i> ${game.i18n.localize("VEHICLES.TabTitle")}</a>`;
    const captureOptions = `
    <option value="${VEHICLES.CAPTURE_NONE}">${game.i18n.localize("VEHICLES.CaptureOptionNone")}</option>
    <option value="${VEHICLES.CAPTURE_AUTO}">${game.i18n.localize("VEHICLES.CaptureOptionAuto")}</option>
    <option value="${VEHICLES.CAPTURE_MANUAL}">${game.i18n.localize("VEHICLES.CaptureOptionManual")}</option>
    `;
    const contents = `
    <div class="tab" data-tab="vehicles">
      <p class="notes">${game.i18n.localize("VEHICLES.TabNotes")}</p>
      <hr>
      <p class="notes">${game.i18n.localize("VEHICLES.SectionCaptureNotes")}</p>
      <div class="form-group">
        <label for="vehiclesCaptureTokens">${game.i18n.localize("VEHICLES.FieldCaptureTokens")}</label>
        <select name="vehiclesCaptureTokens" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureDrawings">${game.i18n.localize("VEHICLES.FieldCaptureDrawings")}</label>
        <select name="vehiclesCaptureDrawings" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureTiles">${game.i18n.localize("VEHICLES.FieldCaptureTiles")}</label>
        <select name="vehiclesCaptureTiles" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureWalls">${game.i18n.localize("VEHICLES.FieldCaptureWalls")}</label>
        <select name="vehiclesCaptureWalls" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureLights">${game.i18n.localize("VEHICLES.FieldCaptureLights")}</label>
        <select name="vehiclesCaptureLights" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <div class="form-group">
        <label for="vehiclesCaptureSounds">${game.i18n.localize("VEHICLES.FieldCaptureSounds")}</label>
        <select name="vehiclesCaptureSounds" data-dtype="Number"/>${captureOptions}</select>
      </div>
      <hr>
      <div class="form-group">
        <label for="vehiclesFixTokenOrientation">${game.i18n.localize("VEHICLES.FieldFixTokenOrientation")}</label>
        <input type="checkbox" name="vehiclesFixTokenOrientation" data-dtype="Boolean"/>
        <p class="notes">${game.i18n.localize("VEHICLES.FieldFixTokenOrientationNotes")}</p>
      </div>
      <hr>
      <div class="form-group">
        <label for="vehiclesControllerToken">${game.i18n.localize("VEHICLES.FieldControllerToken")}</label>
        <input type="text" name="vehiclesControllerToken" data-dtype="String"/>
        <p class="notes">${game.i18n.localize("VEHICLES.FieldControllerTokenNotes")}</p>
      </div>
      <div class="form-group">
        <label for="vehiclesPivotToken">${game.i18n.localize("VEHICLES.FieldPivotToken")}</label>
        <input type="text" name="vehiclesPivotToken" data-dtype="String"/>
        <p class="notes">${game.i18n.localize("VEHICLES.FieldPivotTokenNotes")}</p>
      </div>
      <div class="form-group">
        <label for="vehiclesControlScheme">${game.i18n.localize("VEHICLES.FieldTokenControlScheme")}</label>
        <select name="vehiclesControlScheme" data-dtype="Number">
          <option value="${VEHICLES.CONTROL_SCHEME_ABSOLUTE}">${game.i18n.localize("VEHICLES.TokenControlSchemeOptionAbsolute")}</option>
          <option value="${VEHICLES.CONTROL_SCHEME_TANK}">${game.i18n.localize("VEHICLES.TokenControlSchemeOptionTank")}</option>
          <option value="${VEHICLES.CONTROL_SCHEME_RELATIVE}">${game.i18n.localize("VEHICLES.TokenControlSchemeOptionRelative")}</option>
        </select>
        <p class="notes">${game.i18n.localize("VEHICLES.FieldTokenControlSchemeNotes")}</p>
      </div>
      <div class="form-group">
        <label for="vehiclesXCoefficient">${game.i18n.localize("VEHICLES.FieldXCoefficient")}</label>
        <input type="text" name="vehiclesXCoefficient" value="1" data-dtype="Number"/>
      </div>
      <div class="form-group">
        <label for="vehiclesYCoefficient">${game.i18n.localize("VEHICLES.FieldYCoefficient")}</label>
        <input type="text" name="vehiclesYCoefficient" value="1" data-dtype="Number"/>
      </div>
      <div class="form-group">
        <label for="vehiclesAngularCoefficient">${game.i18n.localize("VEHICLES.FieldAngularCoefficient")}</label>
        <input type="text" name="vehiclesAngularCoefficient" value="1" data-dtype="Number"/>
      </div>
      <p class="notes">${game.i18n.localize("VEHICLES.SectionCoefficientsNotes")}</p>
    </div>`;

    html.find(".tabs .item").last().after(tab);
    html.find(".tab").last().after(contents);
    const vehiclesTab = html.find(".tab").last();
    const input = (name) => vehiclesTab.find(`input[name="${name}"]`);
    const select = (name) => vehiclesTab.find(`select[name="${name}"]`)

    input("vehiclesFixTokenOrientation").prop("checked", flags.fixTokenOrientation);
    input("vehiclesControllerToken").prop("value", flags.controllerToken);
    input("vehiclesPivotToken").prop("value", flags.pivotToken);
    select("vehiclesControlScheme").val(flags.controlScheme || 0);
    input("vehiclesXCoefficient").prop("value", "xCoefficient" in flags ? flags.xCoefficient : 1);
    input("vehiclesYCoefficient").prop("value", "yCoefficient" in flags ? flags.yCoefficient : 1);
    input("vehiclesAngularCoefficient").prop("value", "angularCoefficient" in flags ? flags.angularCoefficient : 1);

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

    convertFlag("vehiclesFixTokenOrientation", "fixTokenOrientation");
    convertFlag("vehiclesControllerToken", "controllerToken");
    convertFlag("vehiclesPivotToken", "pivotToken");
    convertFlag("vehiclesControlScheme", "controlScheme");
    convertFlag("vehiclesXCoefficient", "xCoefficient");
    convertFlag("vehiclesYCoefficient", "yCoefficient");
    convertFlag("vehiclesAngularCoefficient", "angularCoefficient");

    convertFlag("vehiclesCaptureTokens", "captureTokens");
    convertFlag("vehiclesCaptureDrawings", "captureDrawings");
    convertFlag("vehiclesCaptureTiles", "captureTiles");
    convertFlag("vehiclesCaptureWalls", "captureWalls");
    convertFlag("vehiclesCaptureLights", "captureLights");
    convertFlag("vehiclesCaptureSounds", "captureSounds");

    if (!update.flags || !update.flags[VEHICLES.SCOPE]) {
      return;
    }
    const flags = update.flags[VEHICLES.SCOPE];
    if ("xCoefficient" in flags && isNaN(flags.xCoefficient)) {
      flags.xCoefficient = 1;
    }
    if ("yCoefficient" in flags && isNaN(flags.yCoefficient)) {
      flags.yCoefficient = 1;
    }
    if ("angularCoefficient" in flags && isNaN(flags.angularCoefficient)) {
      flags.angularCoefficient = 1;
    }
    if (flags.controllerToken || flags.captureTokens || flags.captureDrawings || flags.captureTiles ||
        flags.captureWalls || flags.captureLights || flags.captureSounds) {
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

  _getVehicleCaptureSet(scene, vehicle, captureType) {
    const flags = vehicle.flags[VEHICLES.SCOPE];
    return {
      tokens: flags.captureTokens === captureType
          ? scene.data.tokens.filter(e => !game.multilevel._isReplicatedToken(e) &&
                                          game.multilevel._isPointInRegion(game.multilevel._getTokenCentre(scene, e), vehicle))
          : [],
      drawings: flags.captureDrawings === captureType
          ? scene.data.drawings.filter(e => game.multilevel._isPointInRegion(game.multilevel._getDrawingCentre(e), vehicle))
          : [],
      tiles: flags.captureTiles === captureType
          ? scene.data.tiles.filter(e => game.multilevel._isPointInRegion(game.multilevel._getDrawingCentre(e), vehicle))
          : [],
      walls: [],
      lights: flags.captureLights === captureType
          ? scene.data.lights.filter(e => game.multilevel._isPointInRegion(e, vehicle))
          : [],
      sounds: flags.captureSounds === captureType
          ? scene.data.sounds.filter(e => game.multilevel._isPointInRegion(e, vehicle))
          : [],
    };
  }

  _getMergedVehicleCaptureSet(scene, vehicle) {
    const capture = this._getVehicleCaptureSet(scene, vehicle, VEHICLES.CAPTURE_AUTO);
    const flags = vehicle.flags[VEHICLES.SCOPE];
    if (!flags.capture) {
      return capture;
    }
    if (flags.captureTokens === VEHICLES.CAPTURE_MANUAL && flags.capture.tokens) {
      capture.tokens = scene.data.tokens.filter(e => flags.capture.tokens.includes(e._id));
    }
    if (flags.captureDrawings === VEHICLES.CAPTURE_MANUAL && flags.capture.drawings) {
      capture.drawings = scene.data.drawings.filter(e => flags.capture.drawings.includes(e._id));
    }
    if (flags.captureTiles === VEHICLES.CAPTURE_MANUAL && flags.capture.tiles) {
      capture.tiles = scene.data.tiles.filter(e => flags.capture.tiles.includes(e._id));
    }
    if (flags.captureWalls === VEHICLES.CAPTURE_MANUAL && flags.capture.walls) {
      capture.walls = scene.data.walls.filter(e => flags.capture.walls.includes(e._id));
    }
    if (flags.captureLights === VEHICLES.CAPTURE_MANUAL && flags.capture.lights) {
      capture.lights = scene.data.lights.filter(e => flags.capture.lights.includes(e._id));
    }
    if (flags.captureSounds === VEHICLES.CAPTURE_MANUAL && flags.capture.sounds) {
      capture.sounds = scene.data.sounds.filter(e => flags.capture.sounds.includes(e._id));
    }
    return capture;
  }

  _getPivotCompensationForVehicleRotation(scene, vehicle, rotation) {
    if (!rotation || !vehicle.flags || !vehicle.flags[VEHICLES.SCOPE]) {
      return {x: 0, y: 0};
    }
    const flags = vehicle.flags[VEHICLES.SCOPE];
    const pivotToken = flags.pivotToken;
    if (!pivotToken) {
      return {x: 0, y: 0};
    }
    const points = scene.data.tokens
        .filter(t => t.name === pivotToken)
        .map(t => game.multilevel._getTokenCentre(scene, t));
    if (!points) {
      return {x: 0, y: 0};
    }
    const vehicleCentre = game.multilevel._getDrawingCentre(vehicle);
    const distanceSq = (a, b) => (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
    const pivotPoint = points.reduce((a, b) =>
        distanceSq(a, vehicleCentre) <= distanceSq(b, vehicleCentre) ? a : b);
    const rotatedPoint = game.multilevel._rotate(vehicleCentre, pivotPoint, rotation);
    return {
      x: pivotPoint.x - rotatedPoint.x,
      y: pivotPoint.y - rotatedPoint.y,
    };
  }

  _mapVehicleMoveDirection(controllerToken, vehicle, diff) {
    const flags = vehicle.flags[VEHICLES.SCOPE];
    const controlScheme = flags.controlScheme;
    let result = {
      x: diff.x * flags.xCoefficient,
      y: diff.y * flags.yCoefficient,
    };
    if (controlScheme === VEHICLES.CONTROL_SCHEME_TANK) {
      result = game.multilevel._rotate({x: 0, y: 0}, result, vehicle.rotation);
    } else if (controlScheme === VEHICLES.CONTROL_SCHEME_RELATIVE) {
      result = game.multilevel._rotate({x: 0, y: 0}, result, vehicle.rotation - controllerToken.rotation);
    }
    result.r = diff.r * flags.angularCoefficient;
    return result;
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

    const handleSimpleCapture = (vehicleScene, vehicleCentre, diff,
                                 type, elements, centreFunction, updateFunction) => {
      for (const e of elements) {
        const eId = this._typedUniqueId(type, vehicleScene, e);
        if (!handled[eId]) {
          updateFunction(this._getUpdateData(e, relativeDiff(vehicleCentre, centreFunction(e), diff)));
          handled[eId] = true;
        }
      }
    }

    for (let i = 0; i < queue.length; ++i) {
      const diff = queue[i];
      if (!diff.x && !diff.y && !diff.r) {
        continue;
      }
      const [vehicleScene, vehicle] = diff.vehicle;
      const vehicleCentre = game.multilevel._getDrawingCentre(vehicle);
      const capture = this._getMergedVehicleCaptureSet(vehicleScene, vehicle);

      handleSimpleCapture(vehicleScene, vehicleCentre, diff,
                          "T", capture.tiles,
                          e => game.multilevel._getDrawingCentre(e),
                          u => requestBatch.updateTile(vehicleScene, u));
      handleSimpleCapture(vehicleScene, vehicleCentre, diff,
                          "l", capture.lights, e => e,
                          u => requestBatch.updateLight(vehicleScene, u));
      handleSimpleCapture(vehicleScene, vehicleCentre, diff,
                          "s", capture.sounds, e => e,
                          u => requestBatch.updateSound(vehicleScene, u));

      for (const vd of capture.drawings) {
        const vdId = this._typedUniqueId("d", vehicleScene, vd);
        if (handled[vdId]) {
          continue;
        }

        const rDiff = relativeDiff(vehicleCentre, game.multilevel._getDrawingCentre(vd), diff);
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
        }
      }

      for (const vt of capture.tokens) {
        const vtId = this._typedUniqueId("t", vehicleScene, vt);
        if (handled[vtId]) {
          continue;
        }

        const rDiff = relativeDiff(vehicleCentre, game.multilevel._getTokenCentre(vehicleScene, vt), diff);
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
            const vDiff = this._mapVehicleMoveDirection(vt, v[1], rDiff);
            const pivot = this._getPivotCompensationForVehicleRotation(v[0], v[1], vDiff.r);
            vDiff.x += pivot.x;
            vDiff.y += pivot.y;
            const vUpdate = this._getUpdateData(v[1], vDiff);
            requestBatch.updateDrawing(v[0], vUpdate);
            queue.push({
              vehicle: v,
              x: vDiff.x,
              y: vDiff.y,
              r: vDiff.r,
            });
            handled[vdId] = true;
          }
        }
      }
    }
  }

  _queueVehicleMoveByDrawing(requestBatch, scene, drawing, diff) {
    const handled = {};
    const queue = [];

    drawing.x -= diff.x;
    drawing.y -= diff.y;
    drawing.rotation -= diff.r;
    diff.vehicle = [scene, drawing];
    queue.push(diff);
    handled[this._typedUniqueId("d", scene, drawing)] = true;
    this._runVehicleMoveAlgorithm(requestBatch, handled, queue);
  }

  _queueVehicleMoveByController(requestBatch, scene, token, vehicles, diff) {
    const handled = {};
    const queue = [];

    for (const v of vehicles) {
      const vehicleState = this._vehicleMap[this._uniqueId(v[0], v[1])];
      if (!vehicleState) {
        continue;
      }
      const vDiff = this._mapVehicleMoveDirection(token, v[1], diff);
      const pivot = this._getPivotCompensationForVehicleRotation(v[0], v[1], vDiff.r);
      vDiff.vehicle = v;
      vDiff.x += pivot.x;
      vDiff.y += pivot.y;
      const update = this._getUpdateData(v[1], vDiff);
      queue.push(vDiff);
      requestBatch.updateDrawing(v[0], update);
      handled[this._typedUniqueId("d", v[0], v[1])] = true;
    }
    // Somewhat special case: if the controller token was only rotated, it may still be moved by the vehicle.
    // If it moved, it should not be moved by the vehicle, or it could end up moving twice, which is probably
    // not what anyone wants.
    // Might need revisiting in future.
    if (diff.x || diff.y) {
      handled[this._typedUniqueId("t", scene, token)] = true;
    }
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
    const diff = {
      x: token.x - controller.x,
      y: token.y - controller.y,
      r: token.rotation - controller.r,
    };
    game.multilevel._queueAsync(requestBatch =>
        this._queueVehicleMoveByController(requestBatch, scene, t, controller.vehicles, diff));
    controller.x = token.x;
    controller.y = token.y;
    controller.r = token.rotation;
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
    const vehicleState = this._vehicleMap[id];
    if (!vehicleState || !game.multilevel._isPrimaryGamemaster() ||
        MLT.REPLICATED_UPDATE in options || VEHICLES.BYPASS in options ||
        !("x" in update || "y" in update || "rotation" in update)) {
      this._refreshVehicleMapForVehicle(scene, drawing);
      return;
    }

    const d = duplicate(drawing);
    const diff = {
      x: drawing.x - vehicleState.x,
      y: drawing.y - vehicleState.y,
      r: drawing.rotation - vehicleState.r,
    };
    game.multilevel._queueAsync(requestBatch =>
        this._queueVehicleMoveByDrawing(requestBatch, scene, d, diff));
    vehicleState.x = drawing.x;
    vehicleState.y = drawing.y;
    vehicleState.r = drawing.rotation;
  }

  _onRenderDrawingConfig(app, html, data) {
    if (game.multilevel._isAuthorisedRegion(data.object)) {
      this._injectDrawingConfigTab(app, html, data);
    }
  }

  _onRenderDrawingHUD(hud, html, drawing) {
    if (game.multilevel._isAuthorisedRegion(drawing) && this._isVehicle(drawing) && game.user.isGM) {
      this._injectVehicleHUD(hud, html, drawing);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
