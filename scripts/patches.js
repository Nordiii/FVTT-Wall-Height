import { MODULE_SCOPE, TOP_KEY, BOTTOM_KEY } from "./const.js";
import { getWallBounds } from "./utils.js";

export function Patch_Token_onUpdate() {
    const oldOnUpdate = Token.prototype._onUpdate;
    Token.prototype._onUpdate = function (data, options) {
        oldOnUpdate.apply(this, arguments);

        const changed = new Set(Object.keys(data));

        // existing conditions that have already been checked to perform a sight layer update
        const visibilityChange = changed.has("hidden");
        const positionChange = ["x", "y"].some((c) => changed.has(c));
        const perspectiveChange = changed.has("rotation") && this.hasLimitedVisionAngle;
        const visionChange = [
            "brightLight",
            "brightSight",
            "dimLight",
            "dimSight",
            "lightAlpha",
            "lightAngle",
            "lightColor",
            "sightAngle",
            "vision",
        ].some((k) => changed.has(k));

        const alreadyUpdated =
            (visibilityChange || positionChange || perspectiveChange || visionChange) &&
            (this.data.vision || changed.has("vision") || this.emitsLight);

        // if the original _onUpdate didn't perform a sight layer update,
        // but elevation has changed, do the update now
        if (changed.has("elevation") && !alreadyUpdated) {
            canvas.sight.updateToken(this, {defer: true});
            canvas.addPendingOperation("SightLayer.update", canvas.sight.update, canvas.sight);
            canvas.addPendingOperation("LightingLayer.update", canvas.lighting.update, canvas.lighting);
            canvas.addPendingOperation(`SoundLayer.update`, canvas.sounds.update, canvas.sounds);
        }
    };
}

export function Patch_WallCollisions() {
    // store the token elevation in a common scope, so that it can be used by the following functions without needing to pass it explicitly
    let currentTokenElevation = null;

    const oldTokenUpdateSource = Token.prototype.updateSource;
    Token.prototype.updateSource = function () {
        currentTokenElevation = this.data.elevation;
        oldTokenUpdateSource.apply(this, arguments);
        currentTokenElevation = null;
    };

    const oldOnUpdate = Token.prototype._onUpdate;
    Token.prototype._onUpdate = function (data, options) {
        currentTokenElevation = null;
        oldOnUpdate.apply(this, arguments);
    };

    const onDragLeftDrop = Token.prototype._onDragLeftDrop;
    Token.prototype._onDragLeftDrop = function (event) {
        const clones = event.data.clones || [];
        if (clones.length !== 1) return onDragLeftDrop.apply(this, arguments);
        currentTokenElevation = clones[0].data.elevation;
        return onDragLeftDrop.apply(this, arguments);
    };

    const oldGetShiftedPosition = Token.prototype._getShiftedPosition;
    Token.prototype._getShiftedPosition = function (dx, dy) {
        currentTokenElevation = this.data.elevation;
       return oldGetShiftedPosition.apply(this, arguments);
    };

    const oldMoveToken = Ruler.prototype.moveToken;
    Ruler.prototype.moveToken = function () {
        currentTokenElevation = this._getMovementToken().data.elevation;
        return oldMoveToken.apply(this, arguments);
    };

    const oldWallsLayerTestWall = WallsLayer.testWall;
    WallsLayer.testWall = function (ray, wall) {
        const { wallHeightTop, wallHeightBottom } = getWallBounds(wall);
        if (
            currentTokenElevation == null ||
            (currentTokenElevation >= wallHeightBottom && currentTokenElevation < wallHeightTop)
        ) {
            return oldWallsLayerTestWall.apply(this, arguments);
        } else {
            return null;
        }
    };
}
