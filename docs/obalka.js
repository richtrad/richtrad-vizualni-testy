// A separate procedural illustration keeps the research clips unseen before the test.
const canvas = document.getElementById("cover");
const ctx = canvas.getContext("2d");
const w = canvas.width, h = canvas.height;
const bitmap = ctx.createImageData(w,h);
for (let y=0; y<h; y++) {
  for (let x=0; x<w; x++) {
    const u=x/w, v=y/h;
    const a=5.1*u+1.9*Math.sin(4.7*v+2.7*u)+.42*Math.sin(8*u-9*v);
    const phase=34*a+7*Math.sin(4*v-2*u)+.8*Math.sin(22*v+2*u);
    const ridge=(Math.sin(phase)+1)*.5;
    const gleam=Math.pow(ridge,2.8) * (.55+.42*Math.sin(3.2*u+2.7*v)**2);
    const grain=(Math.sin((x*12.9898+y*78.233)%10000)*43758.5453)%1;
    const i=(y*w+x)*4, intensity=.10+.67*gleam+.12*ridge+.038*grain;
    bitmap.data[i]=21+199*intensity; bitmap.data[i+1]=37+173*intensity;
    bitmap.data[i+2]=32+137*intensity; bitmap.data[i+3]=255;
  }
}
ctx.putImageData(bitmap,0,0);
