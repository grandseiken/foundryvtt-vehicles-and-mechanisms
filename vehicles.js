
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
    Hooks.on("updateDrawing", this._onUpdateDrawing.bind(this));
    Hooks.on("renderDrawingConfig", this._onRenderDrawingConfig.bind(this));
    Hooks.on("ready", this._refreshState.bind(this));
    Hooks.on("createScene", this._refreshState.bind(this));
    Hooks.on("updateScene", this._refreshState.bind(this));
    Hooks.on("deleteScene", this._refreshState.bind(this));
    this._controllerMap = {};
  }

  _refreshState() {
    this._refreshControllerMap();
  }

  _refreshControllerMap() {
    this._controllerMap = {};
    for (const scene of game.scenes) {
      for (const token of scene.data.tokens) {
        this._refreshControllerMapForToken(scene, token);
      }
    }
  }

  _refreshControllerMapForToken(scene, token) {
    const id = scene._id + ":" + token._id;
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
    this._refreshControllerMapForToken(scene, token);
  }

  _onDeleteToken(scene, token, options, userId) {
    delete this._controllerMap[scene._id + ":" + token._id];
  }

  _onUpdateToken(scene, token, update, options, userId) {
    if ("name" in update) {
      this._refreshControllerMapForToken(scene, token);
    }
    if (!game.multilevel._isProperToken(token) || MLT.REPLICATED_UPDATE in options ||
        !("x" in update || "y" in update || "rotation" in update)) {
      return;
    }

    // TODO: better way to identify controller tokens.
    // TODO: auto-capture vs. capture current.
    // TODO: recursive search to find all things that should be moved, including other controlled tokens and their vehicles at once.
    // TODO: rotate drawing to rotate controls; flip X / Y as well? Does that work? Optional?
    const controller = this._controllerMap[scene._id + ":" + token._id];
    if (!controller) {
      return;
    }
    const t = duplicate(token);
    game.multilevel._queueAsync(requestBatch => {
      const handled = {};
      const queue = [];

      for (const v of controller.vehicles) {
        queue.push({
          vehicle: v,
          x: t.x - controller.x,
          y: t.y - controller.y,
          r: 0, // t.rotation - controller.r,
        });
        handled["d:" + v[0]._id + ":" + v[1]._id] = true;
      }
      controller.x = t.x;
      controller.y = t.y;
      controller.r = t.rotation;
      handled["t:" + scene._id + ":" + t._id] = true;

      for (let i = 0; i < queue.length; ++i) {
        const diff = queue[i];
        const [vehicleScene, vehicle] = diff.vehicle;
        requestBatch.updateDrawing(vehicleScene, {_id: vehicle._id, x: vehicle.x + diff.x, y: vehicle.y + diff.y});

        if (vehicle.flags[VEHICLES.SCOPE].captureTokens) {
          for (const vt of vehicleScene.data.tokens) {
            const centre = game.multilevel._getTokenCentre(vehicleScene, vt);
            const vtId = "t:" + vehicleScene._id + ":" + vt._id;
            if (handled[vtId] || !game.multilevel._isPointInRegion(centre, vehicle)) {
              continue;
            }

            requestBatch.updateToken(vehicleScene, {_id: vt._id, x: vt.x + diff.x, y: vt.y + diff.y});
            const controller = this._controllerMap[scene._id + ":" + vt._id];
            if (controller) {
              for (const v of controller.vehicles) {
                const vdId = "d:" + v[0]._id + ":" + v[1]._id;
                if (handled[vdId]) {
                  continue;
                }
                queue.push({
                  vehicle: v,
                  x: diff.x,
                  y: diff.y,
                  r: 0, // TODO
                });
                handled["d:" + v[0]._id + ":" + v[1]._id] = true;
              }
              controller.x = vt.x + diff.x;
              controller.y = vt.y + diff.y;
              controller.r = vt.rotation + diff.r;
            }
            handled[vtId] = true;
          }
        }
      }
    });
  }

  _onPreUpdateDrawing(scene, drawing, update, options, userId) {
    this._convertDrawingConfigUpdateData(drawing, update);
    return true;
  }

  _onUpdateDrawing(scene, drawing, update, options, userId) {
    if (drawing.flags && drawing.flags[VEHICLES.SCOPE] && drawing.flags[VEHICLES.SCOPE].controllerToken) {
      this._refreshControllerMap();
    }
  }

  _onRenderDrawingConfig(app, html, data) {
    if (game.multilevel._isAuthorisedRegion(data.object)) {
      this._injectDrawingConfigTab(app, html, data);
    }
  }
}

console.log(VEHICLES.LOG_PREFIX, "Loaded");
Hooks.on('init', () => game.vehicles = new Vehicles());
