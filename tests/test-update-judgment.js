#!/usr/bin/env node
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { SYSTEM } from '../src/lib/system-prompt.js'

const CANVAS = `Current cards on canvas:
1. key:"interstellar" type:card title:"Interstellar" sub:"2014 · Christopher Nolan" image:poster tags:["Sci-Fi","Drama"] z:60 (visible, front)
2. key:"imdb-score" type:metric value:"8.7" label:"IMDb" z:40 (visible)
3. key:"nolan-quote" type:callout text:"We used to look up at the sky..." author:"Cooper" z:-20 (visible, receding)
4. key:"box-office" type:metric value:"$677M" label:"Worldwide Gross" z:30 (visible)
5. key:"inception" type:card title:"Inception" sub:"2010 · Nolan" z:-160 (blurred, background)
6. key:"react-intro" type:card title:"React" sub:"JS library" z:-320 (very far back)`

const rules = SYSTEM.split('## Canvas Commands')[1]?.split('## Sketch')[0] || ''

const TESTS = [
  ["把星际穿越的评分改成 8.8", "update:imdb-score"],
  ["导演名字拼错了", "update:interstellar"],
  ["给星际穿越加上演员列表", "update:interstellar"],
  ["票房数据不对，应该是 $701M", "update:box-office"],
  ["引用加上 source", "update:nolan-quote"],
  ["加个 IMAX 的 tag", "update:interstellar"],
  ["IMDb 单位改成 /10", "update:imdb-score"],
  ["台词翻译成中文", "update:nolan-quote"],
  ["海报换一张清晰的", "update:interstellar"],
  ["票房改成人民币", "update:box-office"],
  ["讲讲诺兰", "new"],
  ["2001太空漫游怎么样", "new"],
  ["推荐类似的科幻片", "new"],
  ["太空旅行的科学原理", "new"],
  ["今天天气怎么样", "new"],
  ["React vs Vue", "new"],
  ["Hans Zimmer 配乐风格", "new"],
  ["黑洞的物理学", "new"],
  ["写一首关于太空的诗", "new"],
  ["帮我做个待办列表", "new"],
  ["分析星际穿越的叙事结构", "new"],
  ["星际穿越为什么在中国这么火", "new"],
  ["时间膨胀效应准确吗", "new"],
  ["星际穿越的配乐分析", "new"],
  ["星际穿越和2001对比", "new"],
  ["星际穿越对后来科幻片的影响", "new"],
  ["拍摄幕后故事", "new"],
  ["Cooper的成长弧线", "new"],
  ["视觉特效怎么做的", "new"],
  ["诺兰为什么拍星际穿越", "new"],
  ["把星际穿越放到中间", "move:interstellar"],
  ["IMDb放到右上角", "move:imdb-score"],
  ["票房和评分放一起", "move"],
  ["把Inception拿出来看看", "new"],
  ["React卡片拿回来", "new"],
  ["Inception放大看看", "new"],
  ["评分改8.8再给我看诺兰其他电影", "new+update"],
  ["标题改中文再分析剧情", "new+update"],
  ["再详细说说星际穿越", "new"],
  ["展开讲讲这部电影", "new"],
  ["星际穿越不好看", "new"],
  ["这个评分太高了吧", "new"],
  ["我不同意这个票房数据", "new"],
  ["总结一下星际穿越", "new"],
  ["用中文重新介绍星际穿越", "new"],
  ["星际穿越续集有消息吗", "new"],
  ["给星际穿越打个分", "new"],
  ["讲讲TARS机器人", "new"],
  ["这部电影获了哪些奖", "new"],
  ["放一段预告片", "new"],
]

const sysMsg = `You evaluate canvas commands. Respond with ONLY: UPDATE:<key>, MOVE:<key>, NEW, NEW+UPDATE:<key>, or NEW+MOVE:<key>

Rules:
${rules}

${CANVAS}`

let pass = 0, fail = 0
const failures = []
console.log(`Testing ${TESTS.length} cases...\n`)

for (let i = 0; i < TESTS.length; i++) {
  const [input, expected] = TESTS[i]
  
  // Write full prompt to temp file, pipe to llm via stdin
  const fullPrompt = `${sysMsg}\n\nUser says: "${input}"\n\nYour judgment (one line):`
  writeFileSync('/tmp/vt-prompt.txt', fullPrompt)
  
  try {
    const result = execSync(
      'cat /tmp/vt-prompt.txt | /usr/local/bin/llm --max-tokens 30',
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PATH: process.env.PATH } }
    ).trim()
    
    const nr = result.toUpperCase().replace(/\s+/g, '')
    const ne = expected.toUpperCase().replace(/\s+/g, '')
    const ok = nr.includes(ne) ||
      (ne === 'NEW' && (nr === 'NEW' || (nr.startsWith('NEW') && !nr.includes('UPDATE') && !nr.includes('MOVE'))))

    if (ok) { console.log(`  ✅ ${i+1}. "${input}" → ${result}`); pass++ }
    else { console.log(`  ❌ ${i+1}. "${input}" → ${result} (expected: ${expected})`); fail++; failures.push({i:i+1,input,expected,got:result}) }
  } catch(e) {
    const msg = (e.stderr||e.message||'').toString().split('\n')[0].slice(0,80)
    console.log(`  ⚠️ ${i+1}. "${input}" → ${msg}`); fail++; failures.push({i:i+1,input,expected,got:'ERR'})
  }
}

console.log(`\n${'='.repeat(50)}`)
console.log(`${pass}/${TESTS.length} passed (${(pass/TESTS.length*100).toFixed(1)}%)`)
if (failures.length) { console.log('\nFailures:'); failures.forEach(f=>console.log(`  ${f.i}. "${f.input}" expected:${f.expected} got:${f.got}`)) }
