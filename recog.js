/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

/**
 * Code for Character Recognition.
 * @author fraser@google.com (Neil Fraser)
 */

var recog = {};
recog.mouseButton = false;
recog.prevXY = null;
recog.handwritingCanvas = null;
recog.handwritingContext = null;
recog.cellsCanvas = null;
recog.cellsContext = null;
recog.cellData = null;

recog.cellsX = 6;
recog.cellsY = 8;

recog.cropped = false;

recog.networks = [];

recog.init = function() {
  recog.clearButtonClick();
  recog.initCellData();
  recog.initCells();
  recog.initResults();

  window.addEventListener('mouseup', recog.mouseUp, false);
  recog.handwritingCanvas.addEventListener('mousedown', recog.mouseDown, false);
  recog.handwritingCanvas.addEventListener('mousemove', recog.mouseMove, false);
  recog.handwritingCanvas.addEventListener('mouseout', recog.mouseOut, false);

  document.getElementById('clearButton').addEventListener('click', recog.clearButtonClick, false);
  document.getElementById('digitizeButton').addEventListener('click', recog.digitizeButtonClick, false);
  document.getElementById('recognizeButton').addEventListener('click', recog.recognizeButtonClick, false);
  document.getElementById('learnButton').addEventListener('click', recog.learnButtonClick, false);
  document.getElementById('addButton').addEventListener('click', recog.addButtonClick, false);
  document.getElementById('deleteButton').addEventListener('click', recog.deleteButtonClick, false);
}
window.addEventListener('load', recog.init);

recog.clearButtonClick = function() {
  var canvas = document.getElementById('handwriting');
  recog.handwritingCanvas = canvas;
  canvas.height = canvas.offsetHeight;
  canvas.width = canvas.offsetWidth;
  var ctx = canvas.getContext('2d');
  recog.handwritingContext = ctx;
  // Border.
  ctx.strokeStyle = '#000';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.0)';
  ctx.rect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  ctx.stroke();
  ctx.fill();
  recog.cropped = false;
  document.getElementById('clearButton').disabled = true;
  document.getElementById('digitizeButton').disabled = true;
};

recog.initCellData = function() {
  // Initialize the 2D cell data grid.
  var cellData = [];
  for (var cellX = 0; cellX < recog.cellsX; cellX++) {
    cellData[cellX] = [];
    for (var cellY = 0; cellY < recog.cellsY; cellY++) {
      cellData[cellX][cellY] = false;
    }
  }
  recog.cellData = cellData;
};

recog.initCells = function() {
  var canvas = document.getElementById('cells');
  recog.cellsCanvas = canvas;
  canvas.height = canvas.offsetHeight;
  canvas.width = canvas.offsetWidth;
  var ctx = canvas.getContext('2d');
  recog.cellsContext = ctx;

  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#444';
  ctx.lineWidth = 1;
  var cellWidth = (canvas.width - 1) / recog.cellsX;
  var cellHeight = (canvas.height - 1) / recog.cellsY;
  for (var cellX = 0; cellX <= recog.cellsX; cellX++) {
    for (var cellY = 0; cellY <= recog.cellsY; cellY++) {
      ctx.beginPath();
      // Top
      ctx.moveTo(cellWidth * cellX + 1, cellHeight * cellY + 0.5);
      ctx.lineTo(cellWidth * (cellX + 1), cellHeight * cellY + 0.5);
      // Left
      ctx.moveTo(cellWidth * cellX + 0.5, cellHeight * cellY + 1);
      ctx.lineTo(cellWidth * cellX + 0.5, cellHeight * (cellY + 1));
      ctx.stroke();
      // Fill
      if (recog.cellData[cellX] && recog.cellData[cellX][cellY]) {
        ctx.fillRect(cellWidth * cellX + 1, cellHeight * cellY + 1, cellWidth - 1, cellHeight - 1);
      }
    }
  }
};

recog.initResults = function() {
  var select = document.getElementById('results');
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
  for (var i = 0, network; (network = recog.networks[i]); i++) {
    var option = document.createElement('option');
    var score = '';
    if (!isNaN(network.score)) {
      score = ' ' + Math.round(network.score * 100) + '%';
    }
    option.textContent = network.name + score;
    option.value = i;
    select.appendChild(option);
  }
};

recog.handwritingCanvasTopLeft = function() {
  var left = 0;
  var top = 0;
  var o = recog.handwritingCanvas;
  while (o) {
    left += o.offsetLeft;
    top += o.offsetTop;
    o = o.offsetParent;
  }
  try {
    left -= document.scrollingElement.scrollLeft;
    top -= document.scrollingElement.scrollTop;
  } catch (e) { /* MSIE? */}
  return {left: left, top: top};
};

recog.mouseUp = function(e) {
  recog.isDrawing = false;
};

recog.mouseOut = function(e) {
  recog.prevXY = null;
};

recog.mouseDown = function(e) {
  if (recog.cropped) {
    recog.clearButtonClick();
  }
  document.getElementById('clearButton').disabled = false;
  document.getElementById('digitizeButton').disabled = false;
  var ctx = recog.handwritingContext;
  ctx.strokeStyle = '#44c';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  recog.isDrawing = true;
  recog.prevXY = null;
  recog.mouseMove(e);
};

recog.mouseMove = function(e) {
  if (!recog.isDrawing) return;
  var newX = e.clientX - recog.handwritingCanvasTopLeft().left;
  var newY = e.clientY - recog.handwritingCanvasTopLeft().top;
  var oldX = recog.prevXY ? recog.prevXY.x : newX;
  var oldY = recog.prevXY ? recog.prevXY.y : newY;
  var ctx = recog.handwritingContext;
  ctx.beginPath();
  ctx.moveTo(oldX, oldY);
  ctx.lineTo(newX, newY);
  ctx.stroke();
  ctx.closePath();

  recog.prevXY = {x: newX, y: newY};
};

recog.digitizeButtonClick = function() {
  document.getElementById('digitizeButton').disabled = true;
  // Find the extent of the ink.
  var top = 0;
  var bottom = recog.handwritingCanvas.offsetHeight;
  var left = 0;
  var right = recog.handwritingCanvas.offsetWidth;
  var cropTop = top;
  var cropBottom = bottom;
  var cropLeft = left;
  var cropRight = right;
  scanLeft:
  for (var x = left; x < right; x++) {
    for (var y = top; y < bottom; y++) {
      if (recog.getPixel(x, y)) {
        cropLeft = Math.max(x - 1, left);
        break scanLeft;
      }
    }
  }
  scanRight:
  for (var x = right; x > cropLeft; x--) {
    for (var y = top; y < bottom; y++) {
      if (recog.getPixel(x, y)) {
        cropRight = Math.min(x + 1, right);
        break scanRight;
      }
    }
  }
  scanTop:
  for (var y = top; y < bottom; y++) {
    for (var x = cropLeft; x < cropRight; x++) {
      if (recog.getPixel(x, y)) {
        cropTop = Math.max(y - 1, top);
        break scanTop;
      }
    }
  }
  scanBottom:
  for (var y = bottom; y > cropTop; y--) {
    for (var x = cropLeft; x < cropRight; x++) {
      if (recog.getPixel(x, y)) {
        cropBottom = Math.min(y + 1, bottom);
        break scanBottom;
      }
    }
  }

  // Don't collapse too much.
  var MIN_WIDTH = 40;
  var underWidth = Math.floor(MIN_WIDTH - (cropRight - cropLeft) / 2);
  if (underWidth > 0) {
    cropLeft -= underWidth;
    cropRight += underWidth;
  }
  var MIN_HEIGHT = 40;
  var underHeight = Math.floor(MIN_HEIGHT - (cropBottom - cropTop) / 2);
  if (underHeight > 0) {
    cropTop -= underHeight;
    cropBottom += underHeight;
  }

  // Draw the crop lines.
  var ctx = recog.handwritingContext;
  ctx.strokeStyle = '#c44';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  // Left.
  ctx.beginPath();
  ctx.moveTo(cropLeft - 0.5, top);
  ctx.lineTo(cropLeft - 0.5, bottom);
  ctx.stroke();
  ctx.closePath();
  // Right.
  ctx.beginPath();
  ctx.moveTo(cropRight + 0.5, top);
  ctx.lineTo(cropRight + 0.5, bottom);
  ctx.stroke();
  ctx.closePath();
  // Top
  ctx.beginPath();
  ctx.moveTo(left, cropTop - 0.5);
  ctx.lineTo(right, cropTop - 0.5);
  ctx.stroke();
  ctx.closePath();
  // Bottom.
  ctx.beginPath();
  ctx.moveTo(left, cropBottom + 0.5);
  ctx.lineTo(right, cropBottom + 0.5);
  ctx.stroke();
  ctx.closePath();
  recog.cropped = true;

  recog.initCellData();

  // Scan the ink into the data grid.
  for (var x = cropLeft; x < cropRight; x++) {
    var cellX = Math.floor((x - cropLeft) / (cropRight - cropLeft) * recog.cellsX);
    for (var y = cropTop; y < cropBottom; y++) {
      if (recog.getPixel(x, y)) {
        var cellY = Math.floor((y - cropTop) / (cropBottom - cropTop) * recog.cellsY);
        recog.cellData[cellX][cellY] = true;
      }
    }
  }

  recog.initCells();
  document.getElementById('recognizeButton').disabled = false;
};

recog.getPixel = function(x, y) {
  var pixel = recog.handwritingContext.getImageData(x, y, 1, 1);
  return pixel.data[2] > 127;
};

recog.recognizeButtonClick = function() {
  document.getElementById('recognizeButton').disabled = true;
  for (var i = 0, network; (network = recog.networks[i]); i++) {
    network.calculateScore();
  }
  recog.networks.sort(function(a, b) {return b.score - a.score});
  recog.initResults();
};

recog.learnButtonClick = function() {
  var i = document.getElementById('results').selectedIndex;
  if (i === -1) return;
  recog.networks[i].learn();
  recog.recognizeButtonClick();
};

recog.addButtonClick = function() {
  var name = prompt('Name of character');
  if (!name) return;
  recog.networks.push(new recog.Network(name));
  recog.initResults();
};

recog.deleteButtonClick = function() {
  var i = document.getElementById('results').selectedIndex;
  if (i === -1) return;
  recog.networks.splice(i, 1);
  recog.initResults();
};

recog.Network = function(name) {
  this.name = name;
  this.data = [];
  for (var cellX = 0; cellX < recog.cellsX; cellX++) {
    this.data[cellX] = [];
    for (var cellY = 0; cellY < recog.cellsY; cellY++) {
      this.data[cellX][cellY] = 0;
    }
  }
  this.score = NaN;
};

recog.Network.prototype.learn = function() {
  var LEARN_LIMIT = 3;
  for (var cellX = 0; cellX < recog.cellsX; cellX++) {
    for (var cellY = 0; cellY < recog.cellsY; cellY++) {
      var datum = this.data[cellX][cellY];
      datum += recog.cellData[cellX][cellY] ? 1 : -1;
      datum = Math.min(LEARN_LIMIT, Math.max(-LEARN_LIMIT, datum));
      this.data[cellX][cellY] = datum;
    }
  }
};

recog.Network.prototype.calculateScore = function() {
  var maxWeight = 0;
  var rawScore = 0;
  for (var cellX = 0; cellX < recog.cellsX; cellX++) {
    for (var cellY = 0; cellY < recog.cellsY; cellY++) {
      var datum = this.data[cellX][cellY];
      var input = recog.cellData[cellX][cellY] ? 1 : -1;
      var match = Math.sign(datum) === input;
      rawScore += Math.abs(datum) * (match ? 1 : -1);
      maxWeight = Math.max(maxWeight, Math.abs(datum));
    }
  }
  this.score = rawScore / (maxWeight * recog.cellsX * recog.cellsY);
};
