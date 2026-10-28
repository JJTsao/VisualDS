// Run with Playwright available through NODE_PATH; no website changes are required.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  require('node:fs').mkdirSync(path.resolve(__dirname,'.preview-data'),{recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.argv[2] || pathToFileURL(path.resolve(__dirname,'../exam/examples.html')).href);
      const results=await page.evaluate(() => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg);};const log=[];
        const switchTo=i=>document.querySelector('[data-index="'+i+'"]').click();
        const set=a=>{const f=document.querySelector('form');for(const[k,v]of Object.entries(a)){f.elements[k].value=v;f.elements[k].dispatchEvent(new Event('change',{bubbles:true}));}};
        const submit=(a,b)=>{set(a);const f=document.querySelector('form');f.requestSubmit(b?f.querySelector('[value="'+b+'"]'):f.querySelector('button'));check(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');};
        for(let i=0;i<4;i++) {
          switchTo(i); const s=exampleBank[i]; const f=document.querySelector('form');
          check(f.querySelector('.key-definition strong').textContent===s.definition.title,'visible prerequisite');
          check(f.querySelector('.chain').compareDocumentPosition(f.querySelector('select'))&Node.DOCUMENT_POSITION_FOLLOWING,'input must precede choices');
          f.requestSubmit();check(document.querySelectorAll('.done').length===0,'empty submission advanced');
          if(s.id==='array') { check(f.querySelector('.key-definition strong').textContent.includes('n 表示目前有幾個有效元素'),'Array definition emphasized'); check(document.querySelector('label').innerText.includes('n 是多少'),'Array asks n'); check([...document.querySelector('select').options].slice(1).every(o=>o.text.startsWith('n = ')),'Array choices include n'); }
          const wrong=s.id==='array'?'[10,20,30,40]':s.prediction.options.find(o=>o[0]!==simulateExample(s.id,s.cases[0],s.bug))[0];
          set({choice:wrong});switchTo((i+1)%4);switchTo(i);check(document.querySelector('[name=choice]').value===wrong,'lost prediction draft');
          submit({choice:wrong});check(document.querySelector('#answer').innerText.includes('原始程式的實際結果'),'missing evidence');
          if(s.id==='array')check(document.querySelector('form .feedback').innerText.includes('n = 3；有效內容 [10,20,30]'),'Array evidence includes n and content');
          submit({choice:s.diagnosis.correct});check([...document.querySelectorAll('select')].every(x=>x.value===''),'repair prefilled');
          submit({...s.bug,hypothesis:'neither'},'test');check(document.activeElement.id==='trial-results','trial focus');check(document.querySelector('[name=hypothesis]').value==='neither','lost hypothesis');
          document.querySelector('#back-to-edit').click();check(document.activeElement.tagName==='SELECT','edit focus');
          set({...s.correct,hypothesis:'both'});switchTo((i+1)%4);switchTo(i);
          for(const[k,v]of Object.entries(s.correct))check(document.querySelector('[name="'+k+'"]').value===v,'lost repair draft');
          submit({...s.correct,hypothesis:'both'},'test');check(document.querySelectorAll('#trial-results .pass').length===2,'repair trial');check(document.querySelectorAll('.done').length===2,'trial graded');
          submit({...s.correct,hypothesis:'both'},'repair');check(!document.querySelector('#context details').open,'old question open on new task');check(document.querySelector('form .key-definition strong').textContent===s.definition.title,'new question prerequisite');
          set({choice:s.transfer.correct});switchTo((i+1)%4);switchTo(i);check(document.querySelector('[name=choice]').value===s.transfer.correct,'lost new question draft');
          submit({choice:s.transfer.correct});check(document.querySelector('.score-strip').innerText.includes('20 分'),'partial score');
          check(document.querySelector('#answer').innerText.includes('錯誤原因：'),'missing diagnosis solution');check(!document.querySelector('#answer .feedback').innerText.includes('下一步'),'completion asks next step');
          check(document.querySelectorAll('#answer .test-row').length===5,'missing final test cases');
          document.querySelector('#again').click();check(document.querySelector('[name=choice]').value==='','reset draft');check(document.querySelector('.score-strip').innerText.includes('0 分'),'reset score');
          submit({choice:simulateExample(s.id,s.cases[0],s.bug)});submit({choice:s.diagnosis.correct});submit({...s.correct,hypothesis:'both'},'repair');submit({choice:s.transfer.correct});check(document.querySelector('.score-strip').innerText.includes('25 分'),'full score');
          if(i<3){document.querySelector('#next-sample').click();check(document.querySelector('[data-index="'+(i+1)+'"]').getAttribute('aria-pressed')==='true','next example');}
          log.push(s.id);
        }
        document.querySelector('#again').click();
        return log;
      });
      if(errors.length)throw Error(errors.join('\n'));
      console.log(`PASS ${width}px: ${results.join(', ')}; wrong/correct, draft retention, retries, reset, no overflow`);
      await page.screenshot({path:path.resolve(__dirname,`.preview-data/examples-audit-${width}.png`),fullPage:true});
      await page.reload();
      if(!await page.locator('.score-strip').innerText().then(t=>t.includes('0 分')))throw Error('refresh should reset');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
