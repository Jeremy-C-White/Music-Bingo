const fs = require('fs');
let content = fs.readFileSync('src/components/Visualizer.tsx', 'utf8');

const target = `<div className="relative w-full h-[90px]">
                {(!previewData?.previewUrl || remaining <= 0) ? (
                  <div className="flex items-end justify-center h-full w-full px-1 gap-1.5">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="flex-1 min-w-[3px] rounded-t-full bg-gradient-to-b from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-[height] duration-75 ease-out h-[10%]"
                      ></div>
                    ))}
                  </div>
                ) : (
                  <canvas ref={canvasRef} width="1000" height="90" className="w-full h-[90px] opacity-40"></canvas>
                )}
              </div>`;

const replacement = `<div className="relative w-full h-[90px]">
                <div className={\`absolute inset-0 flex items-end justify-center w-full px-1 gap-1.5 transition-opacity \${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-100' : 'opacity-0'}\`}>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div 
                      key={i} 
                      ref={el => barsRef.current[i] = el}
                      className="flex-1 min-w-[3px] rounded-t-full bg-gradient-to-b from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-[height] duration-75 ease-out h-[10%]"
                    ></div>
                  ))}
                </div>
                <canvas 
                  ref={canvasRef} 
                  width="1000" 
                  height="90" 
                  className={\`absolute inset-0 w-full h-[90px] transition-opacity \${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-0' : 'opacity-40'}\`}
                ></canvas>
              </div>`;

if(content.includes(target)) {
  fs.writeFileSync('src/components/Visualizer.tsx', content.replace(target, replacement));
  console.log('Success');
} else {
  console.log('Failed to find target');
}
