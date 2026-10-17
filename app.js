
const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

let objects = [];
let selected = null;
let image = null;
let imageScale = 1;
let bg = "#1b1b20";
let brightness = 100, saturation = 100;
let snapping = true, guides = [], drag = null;
let history = [], future = [];

const uid = () => Math.random().toString(36).slice(2, 10);
const active = () => objects.find(o => o.id === selected);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.style.display = "none", 1800);
}

function saveHistory() {
  history.push(JSON.stringify({
    objects, selected, bg, imageScale, brightness, saturation,
    width: canvas.width, height: canvas.height
  }));
  if (history.length > 50) history.shift();
  future = [];
}

function restore(state) {
  const s = JSON.parse(state);
  objects = s.objects;
  selected = s.selected;
  bg = s.bg;
  imageScale = s.imageScale;
  brightness = s.brightness;
  saturation = s.saturation;
  canvas.width = s.width;
  canvas.height = s.height;
  sync();
  draw();
}

function undo() {
  if (!history.length) return toast("Nothing to undo");
  future.push(JSON.stringify({
    objects, selected, bg, imageScale, brightness, saturation,
    width: canvas.width, height: canvas.height
  }));
  restore(history.pop());
}

function redo() {
  if (!future.length) return toast("Nothing to redo");
  history.push(JSON.stringify({
    objects, selected, bg, imageScale, brightness, saturation,
    width: canvas.width, height: canvas.height
  }));
  restore(future.pop());
}

function addObject(type, value) {
  saveHistory();
  const o = {
    id: uid(), type, value,
    x: canvas.width / 2, y: canvas.height / 2,
    size: type === "emoji" ? 100 : 64,
    color: "#ffffff", stroke: "#000000",
    outline: type === "text" ? 6 : 0,
    font: "Impact", rotation: 0, opacity: 1
  };
  objects.push(o);
  selected = o.id;
  sync();
  draw();
}

function measure(o) {
  ctx.save();
  ctx.font = `${o.size}px "${o.font}"`;
  const lines = String(o.value).split("\n");
  const width = Math.max(...lines.map(line =>
    ctx.measureText(line || " ").width
  ));
  ctx.restore();
  return { w: Math.max(width, 24), h: o.size * 1.2 * lines.length };
}

function bounds(o) {
  if (o.type === "emoji") return { w: o.size, h: o.size };
  return measure(o);
}

function draw() {
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (image) {
    ctx.save();
    ctx.filter = `brightness(${brightness}%) saturate(${saturation}%)`;
    const scale = Math.max(W / image.width, H / image.height) * imageScale;
    ctx.drawImage(
      image,
      (W - image.width * scale) / 2,
      (H - image.height * scale) / 2,
      image.width * scale,
      image.height * scale
    );
    ctx.restore();
    $("empty").classList.add("hidden");
  } else {
    $("empty").classList.toggle("hidden", objects.length > 0);
  }

  for (const o of objects) {
    ctx.save();
    ctx.globalAlpha = o.opacity;
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rotation * Math.PI / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (o.type === "text") {
      ctx.font = `${o.size}px "${o.font}"`;
      ctx.lineJoin = "round";

      const lines = String(o.value).split("\n");
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * o.size * 1.2;
        if (o.outline > 0) {
          ctx.lineWidth = o.outline;
          ctx.strokeStyle = o.stroke;
          ctx.strokeText(line, 0, y);
        }
        ctx.fillStyle = o.color;
        ctx.fillText(line, 0, y);
      });
    } else if (o.type === "emoji") {
      ctx.font = `${o.size}px system-ui`;
      ctx.fillText(o.value, 0, 0);
    }

    ctx.restore();

    if (o.id === selected) {
      const b = bounds(o);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rotation * Math.PI / 180);
      ctx.strokeStyle = "#d7ff64";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(-b.w / 2 - 8, -b.h / 2 - 8, b.w + 16, b.h + 16);
      ctx.restore();
    }
  }

  if (snapping) {
    ctx.save();
    ctx.strokeStyle = "#d7ff64";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);

    for (const g of guides) {
      ctx.beginPath();
      if (g.axis === "x") {
        ctx.moveTo(g.pos, 0);
        ctx.lineTo(g.pos, H);
      } else {
        ctx.moveTo(0, g.pos);
        ctx.lineTo(W, g.pos);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function sync() {
  const o = active();
  $("textValue").value = o?.type === "text" ? o.value : "";
  $("emojiValue").value = o?.type === "emoji" ? o.value : "😂";
  $("font").value = o?.font || "Impact";
  $("size").value = o?.size || 64;
  $("sizeOut").value = o?.size || 64;
  $("color").value = o?.color || "#ffffff";
  $("outline").value = o?.outline || 0;
  $("outlineOut").value = o?.outline || 0;
  $("rotation").value = o?.rotation || 0;
  $("rotationOut").value = (o?.rotation || 0) + "°";
  $("posX").value = Math.round(o?.x || 0);
  $("posY").value = Math.round(o?.y || 0);
  $("opacity").value = Math.round((o?.opacity ?? 1) * 100);
  $("opacityOut").value = $("opacity").value + "%";
}

function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * canvas.width / r.width,
    y: (e.clientY - r.top) * canvas.height / r.height
  };
}

function hitTest(p) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i], b = bounds(o);
    if (
      Math.abs(p.x - o.x) <= b.w / 2 + 12 &&
      Math.abs(p.y - o.y) <= b.h / 2 + 12
    ) return o;
  }
  return null;
}

function applySnap(o) {
  guides = [];
  if (!snapping) return;

  const threshold = 12;
  const W = canvas.width, H = canvas.height;
  const b = bounds(o);

  // Vertical guide: object aligns with the canvas center or another object.
  const xs = [W / 2];
  objects.forEach(other => {
    if (other.id !== o.id) xs.push(other.x);
  });

  for (const x of xs) {
    if (Math.abs(o.x - x) < threshold) {
      o.x = x;
      guides.push({ axis: "x", pos: x });
      break;
    }
  }

  // Horizontal guide.
  const ys = [H / 2];
  objects.forEach(other => {
    if (other.id !== o.id) ys.push(other.y);
  });

  for (const y of ys) {
    if (Math.abs(o.y - y) < threshold) {
      o.y = y;
      guides.push({ axis: "y", pos: y });
      break;
    }
  }

  // Soft edge alignment. Objects can still be dragged outside the canvas.
  if (Math.abs(o.x - b.w / 2) < threshold) {
    o.x = b.w / 2;
    guides.push({ axis: "x", pos: 0 });
  }
  if (Math.abs(o.x - (W - b.w / 2)) < threshold) {
    o.x = W - b.w / 2;
    guides.push({ axis: "x", pos: W });
  }
  if (Math.abs(o.y - b.h / 2) < threshold) {
    o.y = b.h / 2;
    guides.push({ axis: "y", pos: 0 });
  }
  if (Math.abs(o.y - (H - b.h / 2)) < threshold) {
    o.y = H - b.h / 2;
    guides.push({ axis: "y", pos: H });
  }
}


let activePointers = new Map();
let pinch = null;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", e => {
  e.preventDefault();

  const p = point(e);
  activePointers.set(e.pointerId, p);
  canvas.setPointerCapture(e.pointerId);

  if (activePointers.size === 1) {
    const o = hitTest(p);
    selected = o?.id || null;
    drag = o ? { id: o.id, dx: p.x - o.x, dy: p.y - o.y } : null;
    pinch = null;
    sync();
    draw();
    return;
  }

  if (activePointers.size === 2) {
    // Dua jari: resize objek yang sedang dipilih.
    const o = active();
    if (!o) return;

    const pts = [...activePointers.values()];
    pinch = {
      id: o.id,
      startDistance: Math.max(distance(pts[0], pts[1]), 1),
      startSize: o.size
    };
    drag = null;
    saveHistory();
  }
});

canvas.addEventListener("pointermove", e => {
  if (!activePointers.has(e.pointerId)) return;

  activePointers.set(e.pointerId, point(e));

  if (activePointers.size >= 2 && pinch) {
    const o = objects.find(item => item.id === pinch.id);
    if (!o) return;

    const pts = [...activePointers.values()];
    const currentDistance = distance(pts[0], pts[1]);
    const ratio = currentDistance / pinch.startDistance;

    o.size = Math.max(
      18,
      Math.min(300, pinch.startSize * ratio)
    );

    sync();
    draw();
    return;
  }

  if (activePointers.size === 1 && drag) {
    const p = activePointers.get(e.pointerId);
    const o = objects.find(item => item.id === drag.id);
    if (!o) return;

    o.x = p.x - drag.dx;
    o.y = p.y - drag.dy;

    applySnap(o);
    sync();
    draw();
  }
});

function endPointer(e) {
  activePointers.delete(e.pointerId);

  if (activePointers.size < 2) pinch = null;

  if (activePointers.size === 1) {
    // Setelah mencubit, jangan langsung memindahkan objek
    // akibat sisa gerakan jari.
    drag = null;
  } else {
    drag = null;
  }

  guides = [];
  draw();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", endPointer);


$("addText").onclick = () => addObject("text", "YOUR TEXT");
$("addEmoji").onclick = () => addObject("emoji", $("emojiValue").value || "😂");

document.querySelectorAll("[data-emoji]").forEach(b => {
  b.onclick = () => addObject("emoji", b.dataset.emoji);
});

$("textValue").oninput = () => {
  const o = active();
  if (o?.type === "text") {
    o.value = $("textValue").value;
    draw();
  }
};

$("emojiValue").onchange = () => {
  const o = active();
  if (o?.type === "emoji") {
    o.value = $("emojiValue").value;
    draw();
  }
};

function bind(id, prop, parse = v => v) {
  $(id).addEventListener("input", () => {
    const o = active();
    if (!o) return;
    o[prop] = parse($(id).value);
    sync();
    draw();
  });
}

bind("font", "font");
bind("size", "size", Number);
bind("color", "color");
bind("outline", "outline", Number);
bind("rotation", "rotation", Number);
bind("posX", "x", Number);
bind("posY", "y", Number);
bind("opacity", "opacity", v => Number(v) / 100);

$("size").oninput = () => {
  $("sizeOut").value = $("size").value;
  const o = active();
  if (o) { o.size = Number($("size").value); draw(); }
};
$("outline").oninput = () => {
  $("outlineOut").value = $("outline").value;
  const o = active();
  if (o) { o.outline = Number($("outline").value); draw(); }
};
$("rotation").oninput = () => {
  $("rotationOut").value = $("rotation").value + "°";
  const o = active();
  if (o) { o.rotation = Number($("rotation").value); draw(); }
};
$("opacity").oninput = () => {
  $("opacityOut").value = $("opacity").value + "%";
  const o = active();
  if (o) { o.opacity = Number($("opacity").value) / 100; draw(); }
};

$("centerX").onclick = () => {
  const o = active();
  if (o) { saveHistory(); o.x = canvas.width / 2; sync(); draw(); }
};
$("centerY").onclick = () => {
  const o = active();
  if (o) { saveHistory(); o.y = canvas.height / 2; sync(); draw(); }
};

$("delete").onclick = () => {
  if (!active()) return;
  saveHistory();
  objects = objects.filter(o => o.id !== selected);
  selected = null;
  sync();
  draw();
};

$("front").onclick = () => {
  const i = objects.findIndex(o => o.id === selected);
  if (i < 0 || i === objects.length - 1) return;
  saveHistory();
  [objects[i], objects[i + 1]] = [objects[i + 1], objects[i]];
  draw();
};
$("back").onclick = () => {
  const i = objects.findIndex(o => o.id === selected);
  if (i <= 0) return;
  saveHistory();
  [objects[i], objects[i - 1]] = [objects[i - 1], objects[i]];
  draw();
};

$("undo").onclick = undo;
$("redo").onclick = redo;
$("snap").onclick = () => {
  snapping = !snapping;
  $("snap").classList.toggle("on", snapping);
  guides = [];
  draw();
  toast(snapping ? "Smart snap on" : "Smart snap off");
};

$("background").oninput = () => { bg = $("background").value; draw(); };
$("zoom").oninput = () => {
  imageScale = Number($("zoom").value) / 100;
  $("zoomOut").value = $("zoom").value + "%";
  draw();
};
$("brightness").oninput = () => {
  brightness = Number($("brightness").value);
  $("brightnessOut").value = brightness + "%";
  draw();
};
$("saturation").oninput = () => {
  saturation = Number($("saturation").value);
  $("saturationOut").value = saturation + "%";
  draw();
};

$("file").onchange = e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    image = img;
    draw();
    toast("Media loaded");
  };
  img.onerror = () => toast("Could not load image");
  img.src = url;
};

document.querySelectorAll("[data-ratio]").forEach(b => {
  b.onclick = () => {
    saveHistory();
    const ratio = b.dataset.ratio;
    canvas.width = ratio === "square" ? 1000 : 1200;
    canvas.height = ratio === "square" ? 1000 :
      ratio === "story" ? 1600 : ratio === "wide" ? 675 : 900;
    $("dimensions").textContent =
      ratio === "square" ? "1:1 · 1000 × 1000" :
      ratio === "story" ? "9:16 · 1200 × 1600" :
      ratio === "wide" ? "16:9 · 1200 × 675" : "4:3 · 1200 × 900";
    document.querySelectorAll("[data-ratio]").forEach(x =>
      x.classList.toggle("on", x === b)
    );
    draw();
  };
});

document.querySelectorAll("[data-template]").forEach(b => {
  b.onclick = () => {
    saveHistory();
    const t = b.dataset.template;
    objects = objects.filter(o => o.type !== "text");

    function text(value, y, size = 70, color = "#ffffff") {
      objects.push({
        id: uid(), type: "text", value,
        x: canvas.width / 2, y: canvas.height * y,
        size, color, stroke: "#000000", outline: 6,
        font: "Impact", rotation: 0, opacity: 1
      });
    }

    if (t === "classic") {
      text("WHEN YOU FINALLY", .12);
      text("GET THE JOKE", .88);
    }
    if (t === "news") {
      text("BREAKING NEWS", .14, 76, "#d7ff64");
      text("LOCAL LEGEND DOES IT AGAIN", .84, 48);
    }
    if (t === "chaos") {
      text("NO THOUGHTS", .18, 80, "#ff83d4");
      text("JUST VIBES", .82, 80);
    }
    if (t === "404") {
      text("ERROR 404", .30, 90, "#c8f2ff");
      text("MOTIVATION NOT FOUND", .72, 48);
    }

    selected = objects.at(-1)?.id || null;
    sync();
    draw();
  };
});

$("reset").onclick = () => {
  saveHistory();
  objects = [];
  selected = null;
  image = null;
  imageScale = 1;
  brightness = saturation = 100;
  bg = "#1b1b20";
  sync();
  draw();
  toast("Workspace reset");
};

function exportPNG() {
  const old = selected;
  selected = null;
  draw();

  const a = document.createElement("a");
  a.download = "meme-studio.png";
  a.href = canvas.toDataURL("image/png");
  a.click();

  selected = old;
  draw();
  toast("PNG exported");
}
$("export").onclick = $("download").onclick = exportPNG;

window.addEventListener("keydown", e => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

  const o = active();
  if (e.key === "Delete" || e.key === "Backspace") {
    $("delete").click();
    return;
  }

  if (o && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    saveHistory();
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp") o.y -= step;
    if (e.key === "ArrowDown") o.y += step;
    if (e.key === "ArrowLeft") o.x -= step;
    if (e.key === "ArrowRight") o.x += step;
    applySnap(o);
    sync();
    draw();
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
});

sync();
draw();
    
