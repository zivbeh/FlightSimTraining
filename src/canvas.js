

class Canvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  rect(x, y, w, h, color = "black", deg = 0) {
    const rad = (-deg * Math.PI) / 180;
    this.ctx.fillStyle = color;
    x -= w / 2;
    y -= h / 2;
    this.ctx.save();
    this.ctx.translate(x + w / 2, y + h / 2);
    this.ctx.rotate(rad);
    this.ctx.fillRect(-w / 2, -h / 2, w, h);
    this.ctx.restore();
    this.ctx.fillStyle = "black";
  }

  img(x, y, w, h, color = "black", deg = 0) { // color is the image source
    const rad = (-deg * Math.PI) / 180;
    if (typeof color == "string") return;

    x -= w / 2;
    y -= h / 2;
    this.ctx.save();
    this.ctx.translate(x + w / 2, y + h / 2);
    this.ctx.rotate(rad);
    this.ctx.drawImage(color, -w / 2, -h / 2, w, h);
    this.ctx.restore();
  }

  // Clips source image to canvas size if source is larger than target area
  img2(x, y, w, h, color = "black", deg = 0) { 
    const rad = (-deg * Math.PI) / 180;
    if (typeof color == "string") return;

    x -= w / 2;
    y -= h / 2;
    this.ctx.save();
    this.ctx.translate(x + w / 2, y + h / 2);
    this.ctx.rotate(rad);
    this.ctx.drawImage(color, 0, 0, w, h, -w / 2, -h / 2, w, h);
    this.ctx.restore();
  }

  oval(x, y, w, h, color = "black", deg = 0, opacity = 1) {
    const rad = (-deg * Math.PI) / 180;
    this.ctx.globalAlpha = opacity;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, w / 2, h / 2, rad, 0, 2 * Math.PI);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = "black";
  }

  line(points, color = "black", w = 2, fillColor = false) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = w;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    if (fillColor) {
      this.ctx.closePath();
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    this.ctx.stroke();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 3;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  text(content, x, y, size = 30, color = "black", bold = false, font = "Arial",
    isMeasureText = false, isStroke = "color", strokeWidth = 2) {
    
    this.ctx.fillStyle = color;
    let weight = bold ? 'bold ' : '';
    this.ctx.font = `${weight}${size}px ${font}`;

    // Center text horizontally if requested
    if (isMeasureText) {
      x -= this.ctx.measureText(content).width / 2;
    }

    this.ctx.fillText(content, x, y);

    if (isStroke !== "color") {
      this.ctx.lineWidth = strokeWidth;
      this.ctx.strokeStyle = isStroke;
      this.ctx.strokeText(content, x, y);
    }
  }
}

export default Canvas;




