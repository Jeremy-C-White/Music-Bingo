const fs = require('fs');
let file = 'src/components/Visualizer.tsx';
let content = fs.readFileSync(file, 'utf8');

// The original block
const badBlock = `<div className="relative w-full h-\\[90px\\]">\n                {\\(!previewData\\?\\.previewUrl \\|\\| remaining <= 0\\) \\? \\(\n                  <div className="flex items-end justify-center h-full w-full px-1 gap-1.5">\n                    {Array.from\\({ length: 32 }\\)\\.map\\(\\(_, i\\) => \\(\n                      <div \n                        key={i} \n                        className="flex-1 min-w-\\[3px\\] rounded-t-full bg-gradient-to-b from-\\[var\\(--scene-a\\)\\] via-\\[var\\(--scene-b\\)\\] to-\\[var\\(--scene-c\\)\\] transition-\\[height\\] duration-75 ease-out h-\\[10%\\]"\n                      ><\\/div>\n                    \\)\\)}\n                  <\\/div>\n                \\) : \\(\n                  <canvas ref={canvasRef} width="1000" height="90" className="w-full h-\\[90px\\] opacity-40"><\\/canvas>\n                \\)}\n              <\\/div>`;

// Actually I'll just use string replacement directly.
