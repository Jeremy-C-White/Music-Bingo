const fs = require('fs');
let file = 'src/components/Visualizer.tsx';
let content = fs.readFileSync(file, 'utf8');

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

content = content.replace(
  /<div className="relative w-full h-\[90px\]">[\s\S]*?<\/canvas>\n\s*?<\/div>\n\s*?<\/div>\n\s*?<\/div>/,
  replacement + '\n            </div>\n                      </div>'
);

// Wait, the regex might be tricky. Let me replace the exact string from `sed -n '424,435p'`
