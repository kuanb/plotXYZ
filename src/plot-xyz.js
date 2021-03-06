'use strict'

class PlotXYZ {

  constructor(settings) {
    this._settings = settings;

    this.values = settings.values.map((ea) => {
      return PlotXYZ._getSinglePoint(ea);
    });
  }

  static _getSinglePoint(point) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    const val = Number(point.val);
    return {lat: lat, lng: lng, val: val};
  }

  getValues() {
    return this.values;
  }

  getGeoJSON() {
    let layer = L.geoJSON();
    this.values.forEach((ea) => {
      let feature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [ea.lng, ea.lat]
        }
      };
      layer.addData(feature);
    });
    return layer;
  }

  getMatrix(resolution=100, buffer=0) {
    const bounds = this.getBoundingBox(buffer);

    // lets get the grid system length, height parameters
    bounds.height = Math.abs(bounds.northwest.lat - bounds.southwest.lat);
    bounds.width = Math.abs(bounds.northwest.lng - bounds.northeast.lng);

    let largestDirection = bounds.height >= bounds.width ? 'height' : 'width';
    let smallestDirection = bounds.height < bounds.width ? 'height' : 'width';
    let blockSideLength = bounds[largestDirection]/resolution;

    let widthCount = Math.ceil(largestDirection == 'width' ? bounds[largestDirection]/blockSideLength : bounds[smallestDirection]/blockSideLength);
    let heightCount = Math.ceil(largestDirection == 'height' ? bounds[largestDirection]/blockSideLength : bounds[smallestDirection]/blockSideLength);

    // now lets create a matrix of GeoJSONs according to that grid
    let resultingMatrix = [];
    for (var iH = 0; iH < heightCount; iH++) {
      let oneRow = [];

      for (var iW = 0; iW < widthCount; iW++) {
        let n = bounds.northwest.lat - (iH * blockSideLength);
        let e = bounds.northwest.lng + ((iW + 1) * blockSideLength);
        let w = bounds.northwest.lng + (iW * blockSideLength);
        let s = bounds.northwest.lat - ((iH + 1) * blockSideLength);
        let feature = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[ [w, n], [e, n], [e, s], [w, s], [w, n], ]]
          }
        };
        oneRow.push(feature);
      }

      resultingMatrix.push(oneRow);
    }

    // get the shortest distance from the sides of the row
    // this will be used to determine "decay" of value from point
    let tempRow = L.geoJSON(resultingMatrix[0]);
    let tempRowBounds = tempRow.getBounds().pad(resolution/100);
    const decayDistance = haversine(tempRowBounds._northEast, tempRowBounds._southWest)/2;

    // remove all variables just created for temp
    tempRow = null;
    tempRowBounds = null;

    // now let's determine the value for each of these GeoJSONs
    resultingMatrix = resultingMatrix.map((row) => {
      let rowBounds = L.geoJSON(row).getBounds().pad(resolution/100);
      let onesInRow = this.values.filter((value) => {
        let point = L.latLng(value);
        return rowBounds.contains(point);
      });

      row = row.map((cell) => {
        let geoJsonCell = L.geoJSON(cell).getBounds();
        let bounds = geoJsonCell.pad(resolution/100);

        // check which of the points are in each
        let onesInside = onesInRow.filter((value) => {
          let point = L.latLng(value);
          return bounds.contains(point);
        });

        let average = 0;
        let middleOfCell = geoJsonCell.getCenter();
        let divideByThisValue = 0;
        if (onesInside.length) {
          onesInside.forEach((ea) => {
            if (!isNaN(ea.val)) {
              let distanceFromCellCenter = haversine(middleOfCell, ea);
              let ratio = 1;
              if (decayDistance > distanceFromCellCenter) {
                ratio = Math.abs(decayDistance - distanceFromCellCenter)/decayDistance;
              }
              average += Number(ea.val) * ratio;
              divideByThisValue += ratio;
            }
          });
          average = average/divideByThisValue;
        }
        if (!cell.properties) cell.properties = {};
        cell.properties.val = average;
        return cell;
      });

      return row;
    })

    return resultingMatrix;
  }

  getBoundingBox(buffer=0) {
    // pads bounding box shape by set percentage
    buffer = Number(buffer);
    if (isNaN(buffer)) buffer = 0;

    let bounds = this.getGeoJSON().getBounds().pad(buffer);
    let corners = {
      northwest: bounds.getNorthWest(),
      northeast: bounds.getNorthEast(),
      southeast: bounds.getSouthEast(),
      southwest: bounds.getSouthWest(),
    }
    return corners;
  }

}