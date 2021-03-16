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
recog.selectedResultIndex = NaN;

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
  document.getElementById('results').addEventListener('click', recog.resultClick, false);
  document.getElementById('learningMode').addEventListener('change', recog.changeLearningMode, false);
  document.getElementById('recognizeButton').disabled = true;
  recog.changeLearningMode();
};
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
  var table = document.getElementById('results');
  while (table.firstChild) {
    table.removeChild(table.firstChild);
  }
  recog.selectedResultIndex = NaN;
  document.getElementById('learnButton').disabled = true;
  document.getElementById('deleteButton').disabled = true;

  for (var i = 0, network; (network = recog.networks[i]); i++) {
    var tr = document.createElement('tr');
    var td1 = document.createElement('td');
    td1.textContent = network.name;
    tr.appendChild(td1);
    var td2 = document.createElement('td');
    td2.className = 'percent';
    if (!isNaN(network.score)) {
      td2.textContent = Math.round(network.score * 100) + '%';
      var size = (network.score > 0) ? (1 + network.score) : 1 / (1 - network.score);
      td1.style.fontSize = Math.round(size * 100) + '%';
    }
    tr.appendChild(td2);
    tr.id = 'result-' + i;
    table.appendChild(tr);
  }
};

recog.resultClick = function(e) {
  var index = NaN;
  var node = e.target;
  while (node) {
    index = parseInt(node.id.substring(7))
    if (!isNaN(index)) {
      break;
    }
    node = node.parentNode;
  }
  recog.resultHighlight(index);
};

recog.resultHighlight = function(index) {
  if (!isNaN(recog.selectedResultIndex)) {
    var oldTr = document.getElementById('result-' + recog.selectedResultIndex);
    oldTr.className = '';
  }
  if (!recog.networks[index]) return;
  document.getElementById('result-' + index).className = 'selected';
  recog.selectedResultIndex = index;
  document.getElementById('learnButton').disabled = false;
  document.getElementById('deleteButton').disabled = false;
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
    if (recog.getPixel(x, top, 1, bottom - top)) {
      cropLeft = Math.max(x - 1, left);
      break scanLeft;
    }
  }
  scanRight:
  for (var x = right; x > cropLeft; x--) {
  if (recog.getPixel(x, top, 1, bottom - top)) {
      cropRight = Math.min(x + 1, right);
      break scanRight;
    }
  }
  scanTop:
  for (var y = top; y < bottom; y++) {
    if (recog.getPixel(cropLeft, y, cropRight - cropLeft, 1)) {
      cropTop = Math.max(y - 1, top);
      break scanTop;
    }
  }
  scanBottom:
  for (var y = bottom; y > cropTop; y--) {
    if (recog.getPixel(cropLeft, y, cropRight - cropLeft, 1)) {
      cropBottom = Math.min(y + 1, bottom);
      break scanBottom;
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
      if (recog.getPixel(x, y, 1, 1)) {
        var cellY = Math.floor((y - cropTop) / (cropBottom - cropTop) * recog.cellsY);
        recog.cellData[cellX][cellY] = true;
      }
    }
  }

  recog.initCells();
  document.getElementById('recognizeButton').disabled = false;
};

recog.getPixel = function(x, y, h, w) {
  var pixel = recog.handwritingContext.getImageData(x, y, h, w);
  for (var i = 2; i < pixel.data.length; i += 4) {
    if (pixel.data[i] > 127) {
      return true;
    }
  }
  return false;
};

recog.recognizeButtonClick = function() {
  document.getElementById('recognizeButton').disabled = true;
  for (var i = 0, network; (network = recog.networks[i]); i++) {
    network.calculateScore();
  }
  recog.networks.sort(function(a, b) {
    if (isNaN(a.score) && isNaN(b.score)) {
      return 0;
    }
    if (isNaN(a.score)) {
      return 1;
    }
    if (isNaN(b.score)) {
      return -1;
    }
    return b.score - a.score;
  });
  recog.initResults();
};

recog.learnButtonClick = function() {
  if (isNaN(recog.selectedResultIndex)) return;
  recog.networks[recog.selectedResultIndex].learn();
  recog.recognizeButtonClick();
};

recog.addButtonClick = function() {
  var name = prompt('Name of character');
  if (!name) return;
  recog.networks.unshift(new recog.Network(name));
  recog.initResults();
  recog.resultHighlight(0);
};

recog.deleteButtonClick = function() {
  if (isNaN(recog.selectedResultIndex)) return;
  recog.networks.splice(recog.selectedResultIndex, 1);
  recog.initResults();
};

recog.changeLearningMode = function() {
  var modeIndex = document.getElementById('learningMode').selectedIndex;
  document.getElementById('supervisedDiv').style.display = (modeIndex === 1) ? 'block' : 'none';
  document.getElementById('unsupervisedDiv').style.display = (modeIndex === 2) ? 'block' : 'none';
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
