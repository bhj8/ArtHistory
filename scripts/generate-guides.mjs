import { writeFile } from 'node:fs/promises';
const out = new URL('../assets/artworks/', import.meta.url);
const text = (x,y,s,size=22,fill='#233b31',extra='') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`;
const rect = (x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const line = (x,y,w,fill='#abb6ad',h=7)=>rect(x,y,w,h,fill);
const panel = (x,title) => rect(x,180,510,460,'#fffdf7','rx="12"')+text(x+28,222,title,23);
const arrow = (x,y)=>`<path d="M${x} ${y}h38m-12-12 12 12-12 12" fill="none" stroke="#687c6c" stroke-width="3"/>`;
const wrap=(title,sub,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><title>${title}：本站学习图解，非历史作品</title><desc>${sub}</desc><rect width="1200" height="760" fill="#eeeede"/><g font-family="'Microsoft YaHei','Noto Sans CJK SC',sans-serif">${text(60,64,'ART HISTORY ATLAS  /  学习图解',17,'#687c6c')}${text(60,116,title,36)}${text(60,151,sub,20,'#687c6c')}${body}${text(60,704,'本站绘制 · 概念示意，非历史作品或艺术家原作',18,'#687c6c')}</g></svg>`;
let body=panel(60,'01  对称组织')+panel(630,'02  非对称层级');
body+=text(315,307,'EXHIBITION',33,'#233b31','text-anchor="middle"')+text(315,350,'视觉与秩序',24,'#687c6c','text-anchor="middle"');
for(let n=0;n<6;n++)body+=line(160,395+n*21,310-(n%2)*40);
body+=text(315,593,'重心围绕中轴',20,'#687c6c','text-anchor="middle"');
body+=rect(660,260,10,300,'#b14c32')+text(693,310,'视觉',52)+text(693,371,'与秩序',52)+text(955,293,'01',35,'#b14c32');
for(let n=0;n<5;n++)body+=line(693,410+n*21,260-(n%2)*55);
body+=line(693,535,350,'#233b31',2)+text(693,580,'字号 → 对齐 → 留白',22);
await writeFile(new URL('guide-newtype.svg',out),wrap('排版怎样安排阅读顺序？','同一组信息，改变字级、对齐与留白；右图是方法演示，不是历史海报。',body));
body=panel(60,'01  稳定的阅读节奏')+panel(630,'02  打断与重新组合');
body+=text(94,308,'READ THE CITY',35)+text(94,360,'城市 / 声音 / 日常',23);
for(let n=0;n<8;n++)body+=line(94,399+n*20,400-(n%3)*45);
body+=text(94,602,'连续、对齐、易于扫描',20,'#687c6c');
body+=`<g transform="rotate(-8 870 330)">${rect(672,268,400,84,'#243b32')}${text(690,331,'READ',66,'#f8f6e8')}${rect(853,348,220,68,'#c85839')}${text(865,397,'THE',48,'#fffdf7')}</g>`;
body+=text(690,463,'CITY',94)+text(957,454,'CITY',25,'#b14c32','transform="rotate(90 957 454)"');
for(let n=0;n<16;n++)body+=line(678+(n*67)%350,488+(n*19)%68,80+(n%3)*40,'#a7b0a4',n%3+1);
body+=text(662,602,'叠印、断裂、阅读阻力',20,'#687c6c');
await writeFile(new URL('guide-grunge.svg',out),wrap('文字何时开始像图像？','用同一句话比较阅读路径：表达性增强时，辨识成本也可能上升。',body));
body='';
for(const [n,title,color,fg,label] of [[0,'01  默认','#37634e','#fff','保存'],[1,'02  悬停 / 聚焦','#234a38','#fff','保存'],[2,'03  禁用','#d4d9d1','#737d74','暂不可用']]){
 const x=60+n*370;body+=rect(x,205,340,375,'#fffdf7','rx="12"')+text(x+27,252,title,24);
 if(n===1)body+=rect(x+22,312,296,88,'none','rx="12" stroke="#a5b896" stroke-width="4"');
 body+=rect(x+30,320,280,72,color,'rx="8"')+text(x+170,365,label,26,fg,'text-anchor="middle"');
 body+=text(x+27,455,['清楚说明可执行动作','颜色与边框提供反馈','文字说明不能操作'][n],21)+text(x+27,500,['形状不必模仿实物','键盘焦点同样可见','不要只靠颜色区别'][n],19,'#687c6c');
}
body+=text(60,630,'扁平化减少装饰，但仍需要层级、对比和清楚的状态反馈。',24);
await writeFile(new URL('guide-flat.svg',out),wrap('同一个按钮，三种状态','这是静态界面示意，用于比较状态；图中的按钮不能点击。',body));
body='';
const colors=['#233b31','#c26b45','#98ad86','#c5c9b5'];
for(let n=0;n<4;n++){
 const x=60+n*285;body+=rect(x,218,235,352,'#fffdf7','rx="12"')+text(x+20,259,['01  条件','02  逐步生成','03  多个候选','04  人工判断'][n],22);
 if(n===0){body+=text(x+20,337,'“山间小屋”',25)+text(x+20,386,'主题 · 构图 · 约束',17,'#687c6c');}
 if(n===1){for(let i=0;i<72;i++)body+=rect(x+20+(i%9)*21,290+Math.floor(i/9)*21,18,18,colors[Math.floor((Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 4)]);body+=text(x+20,490,'由噪声趋向结构',18);}
 if(n===2){for(let i=0;i<3;i++){let y=295+i*59;body+=rect(x+20,y,194,48,['#dde4d5','#e2d4b8','#cbdce1'][i])+`<path d="M${x+33} ${y+39}l45-30 42 30 42-24 40 24" fill="${colors[i]}"/>`;}}
 if(n===3){body+=rect(x+20,298,194,126,'#e2d4b8')+`<path d="M${x+30} 414l55-65 60 65 40-35 20 35" fill="#728b68"/>`+rect(x+98,383,35,31,'#fffdf7')+text(x+20,477,'选择 · 修改 · 标注',18);}
 body+=text(x+20,540,['输入由人决定','以扩散方法为例','并非唯一的答案','追踪作者的决策'][n],17,'#687c6c');if(n<3)body+=arrow(x+242,387);
}
body+=text(60,620,'流程示意：小图为手绘示意，并非模型实际输出；不同系统的流程会有差异。',21);
await writeFile(new URL('guide-ai.svg',out),wrap('从生成到作品：谁作了决定？','把技术生成与人的选择分开看，追踪每一步改变了什么。',body));
console.log('Generated 4 clearly labelled learning diagrams.');
