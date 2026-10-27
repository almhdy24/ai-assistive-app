const maxW = 960;

const canvas = document.createElement("canvas");
canvas.width = w;
canvas.height = h;

const ctx = canvas.getContext("2d");
if (!ctx) return null;

ctx.drawImage(el, 0, 0, w, h);
return canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
