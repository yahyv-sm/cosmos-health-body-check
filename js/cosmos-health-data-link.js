(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeUrl = value => { try { const u = new URL(value, location.href); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const list = value => Array.isArray(value) ? value : [];
  const pct = n => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

  let DATA, panels = [], inputs = [], hazards = [], scores = {}, topIds = [];
  let selectedPanel = 'brain', selectedSide = null, selectedHazard = null;
  let selectedEnvironment = 'station'; // Default environment
  let lastBannerHTML = '';
  const included = Object.create(null);
  const symptomDrafts = Object.create(null);
  const symptomEntries = Object.create(null);
  const symptomNotices = Object.create(null);
  const bodyNodes=[
    {id:'brain',n:'Brain'},{id:'eyes',n:'Eyes'},{id:'horm',n:'Hormones'},
    {id:'lungs',n:'Lungs'},{id:'heart',n:'Heart'},{id:'skin',n:'Skin'},
    {id:'meta',n:'Metabolism'},{id:'immune',n:'Immune system'},{id:'gut',n:'Gut'},
    {id:'kidney',n:'Kidneys'},{id:'veins',n:'Blood vessels'},{id:'bones',n:'Bones and muscle'}
  ];
  const coords={
    F:[['brain',50,4.5],['eyes',50,10],['horm',50,15.5],['lungs',41,24],['heart',55,24],['skin',30,21],['meta',44,31],['immune',59,33],['gut',46,41],['kidney',56,41],['veins',57,57],['bones',46.5,72]],
    B:[['brain',46,9],['eyes',54,13],['horm',50,17.5],['lungs',44,27],['heart',56,27],['skin',72,24],['meta',44,36],['immune',58,34],['gut',45,46],['kidney',53,41],['veins',55,60],['bones',46,72],['bones',50,31]]
  };

  function source(id) { return list(DATA?.sources).find(x => x?.id === id && safeUrl(x.url)) || null; }
  function sources(ids) {
    const unique = [...new Set(list(ids))];
    return unique.map(id => { const s=source(id); return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : ''; }).filter(Boolean).join('; ');
  }
  function audit(id) { return list(DATA?.sourced?.indicatorSupportAudit).find(x => x?.prototypeId === id) || null; }
  function inputOf(id) { return inputs.find(x => x?.id === id) || null; }
  function panelOf(id) { return panels.find(x => x?.id === id) || null; }
  function hazardOf(id) { return hazards.find(x => x?.id === id) || null; }
  function riskOf(id) {
    const risk=list(DATA?.sourced?.risks).find(x => x?.id === id);
    return risk && source(risk.source) ? risk : null;
  }
  function riskLinks(panel, hazardId) {
    return list(panel?.riskRefs).map(ref => riskOf(ref?.risk)).filter(r => r && list(r.hazardLinks).some(x => x?.hazard === hazardId));
  }
  function hazardsForPanel(panel) {
    const ids = new Set();
    for (const ref of list(panel?.riskRefs)) {
      const risk=riskOf(ref?.risk);
      for (const link of list(risk?.hazardLinks)) if (hazardOf(link?.hazard)) ids.add(link.hazard);
    }
    return hazards.filter(h => ids.has(h.id));
  }
  function linksForInput(id) {
    const ids = new Set();
    for (const p of panels.filter(p => list(p.indicators).includes(id))) {
      for (const h of hazardsForPanel(p)) ids.add(h.id);
    }
    for (const m of list(DATA?.projectAuthored?.simulationModel?.directMappings)) {
      if (m?.indicator !== id || !sources(m.sources)) continue;
      for (const hid of list(m.hazards)) if (hazardOf(hid)) ids.add(hid);
    }
    return [...ids];
  }
  function numberValue(i) {
    const el=$(`i_${i.id}`), n=Number(el?.value);
    return Number.isFinite(n) ? n : Number(i.default);
  }
  function rangePosition(i, value) {
    const lo=Number(i.min), hi=Number(i.max);
    return hi>lo ? pct((Number(value)-lo)/(hi-lo)*100) : 0;
  }

  function inputDeviation(i, value=numberValue(i)) {
    const lo=Number(i.min), hi=Number(i.max), base=Number(i.default);
    const span=Math.max(base-lo,hi-base);
    return Number.isFinite(span)&&span>0 ? pct(Math.abs(Number(value)-base)/span*100) : 0;
  }
  function blendColor(a,b,t) {
    const rgb=h=>h.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16));
    const x=rgb(a),y=rgb(b),v=x.map((n,i)=>Math.round(n+(y[i]-n)*t));
    return `#${v.map(n=>n.toString(16).padStart(2,'0')).join('')}`;
  }
  function deviationColor(value) {
    const n=pct(value)/100;
    return n<=.5 ? blendColor('#3f6b5d','#b5651d',n*2) : blendColor('#b5651d','#a8281c',(n-.5)*2);
  }
  function panelDeviation(panel) {
    // Base deviation from indicator inputs
    const values=list(panel?.indicators).map(inputOf).filter(Boolean).map(i=>inputDeviation(i));
    let baseDeviation = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

    // Add symptom log influence (0-30% boost based on symptom severity)
    const regionId = panel?.id;
    const symptomHistory = list(symptomEntries[regionId]);
    let symptomBoost = 0;

    if (symptomHistory.length > 0) {
      // Get the most recent entry
      const latest = symptomHistory[symptomHistory.length - 1];
      const avgSeverity = (latest.values.intensity + latest.values.activity + latest.values.frequency + latest.values.change) / 4;
      // Convert 0-10 scale to 0-30 deviation boost
      symptomBoost = (avgSeverity / 10) * 30;
    }

    return Math.min(100, baseDeviation + symptomBoost);
  }
  function bodyNodesWithData() {
    return bodyNodes.filter(node=>{
      const panel=panelOf(node.id);
      const hasInput=panel&&list(panel.indicators).some(id=>inputOf(id));
      const hasCitation=panel&&(sources(panel.whySource)||list(panel.riskRefs).some(ref=>riskOf(ref?.risk)));
      return Boolean(hasInput&&hasCitation);
    });
  }

  function calculate() {
    const acc=Object.fromEntries(hazards.map(h => [h.id,{sum:0,count:0,signals:[]} ]));
    let changed=false;
    for (const i of inputs) {
      if (!i?.id || included[i.id] === false) continue;
      const value=numberValue(i), base=Number(i.default), span=Number(i.max)-Number(i.min);
      if (!Number.isFinite(value) || !Number.isFinite(base) || !Number.isFinite(span) || span<=0) continue;
      const deviation=Math.min(1,Math.abs(value-base)/span)*100;
      if (deviation<=0.001) continue;
      changed=true;
      for (const hid of linksForInput(i.id)) {
        if (!acc[hid]) continue;
        acc[hid].sum+=deviation;
        acc[hid].count++;
        acc[hid].signals.push(i.id);
      }
    }
    for (const a of Object.values(acc)) a.value=a.count?Math.round(a.sum/a.count*10)/10:0;
    const ranking=hazards.map(h => ({h,value:acc[h.id]?.value||0})).filter(x => x.value>0).sort((a,b) => b.value-a.value);
    const max=ranking[0]?.value||0;
    scores=acc;
    topIds=max?ranking.filter(x => x.value===max).map(x => x.h.id):[];
    return {changed,ranking};
  }

  function modelStep(ids) {
    const m=DATA?.projectAuthored?.simulationModel;
    if (!ids.length) return m?.defaultNextStep || 'Change a synthetic input or open a cited hazard description.';
    if (ids.length>1) return 'Simulation step: open each highlighted source description and inspect the labels, units, and contexts of its linked synthetic inputs. This is not a real medical or mission action.';
    return m?.nextStepByHazard?.[ids[0]] || m?.defaultNextStep || 'Inspect the synthetic input and cited source context.';
  }

  function renderInputs() {
    for (const i of inputs) {
      const wrap=$(`w_${i.id}`), range=$(`i_${i.id}`), out=$(`o_${i.id}`);
      if (!wrap || !range || !out) continue;
      const label=wrap.querySelector(`label[for="i_${CSS.escape(i.id)}"]`);
      if (label) label.textContent=i.question;
      range.min=String(i.min); range.max=String(i.max); range.step=String(i.step);
      range.setAttribute('aria-label',`${i.question}, ${i.unit}, synthetic demo input`);
      if (range.value !== String(i.default)) range.value=String(i.default);
      wrap.className='sl data-linked';
      wrap.style.setProperty('--c',deviationColor(inputDeviation(i,numberValue(i))));
      wrap.querySelectorAll('.data-entry-row,.data-entry-error,.data-optional,.data-field-details,.data-range-info,.data-input-help').forEach(el=>el.remove());
      wrap.querySelectorAll('small').forEach(el=>el.remove());
      range.disabled=false;
      included[i.id]=true;
      out.textContent=`${numberValue(i)} ${i.unit}`;
      range.oninput=()=>{out.textContent=`${numberValue(i)} ${i.unit}`;wrap.style.setProperty('--c',deviationColor(inputDeviation(i)));renderAll();};
    }
  }

  function renderBanner(state) {
    const target=$('banner'); if (!target) return;
    const model=DATA.projectAuthored.simulationModel;
    const entries=topIds.map(id => hazardOf(id)?.name).filter(Boolean);
    let title, note;
    if (!state.changed) {
      title='Synthetic inputs are at their defaults';
      note=model.zeroState;
    } else if (!entries.length) {
      title='No linked simulation match';
      note=model.noLinksState;
    } else {
      const best=scores[topIds[0]]?.value||0;
      title=`Top simulated match${entries.length>1?'es':''}: ${entries.join(', ')} · ${best}/100`;
      note=model.uncertainty;
    }
    target.innerHTML=`<div><b>${esc(title)}</b><span>${esc(note)}</span><small>Project-authored simulation only. Scores are normalized input deviations, not probabilities, causes, clinical thresholds, NASA ratings, or personal risk.</small><small>Simulation next step: ${esc(modelStep(topIds))}</small></div><span class="chip">SYNTHETIC DEMO</span>`;
    lastBannerHTML=target.innerHTML;
    target.setAttribute('role','status'); target.setAttribute('aria-live','polite');
  }

  function renderRadar() {
    const svg=$('radar'), listEl=$('hzl'); if (!svg||!listEl) return;
    const cx=150,cy=150,R=100,pt=(i,r)=>[cx+Math.cos(-Math.PI/2+i*2*Math.PI/hazards.length)*r,cy+Math.sin(-Math.PI/2+i*2*Math.PI/hazards.length)*r];
    let markup='';
    [25,50,75,100].forEach(n=>markup+=`<polygon points="${hazards.map((_,i)=>pt(i,R*n/100).join(',')).join(' ')}" fill="none" stroke="rgba(200,175,163,.18)" ${n<100?'stroke-dasharray="2 5"':''}/>`);
    hazards.forEach((_,i)=>{const [x,y]=pt(i,R);markup+=`<line x1="150" y1="150" x2="${x}" y2="${y}" stroke="rgba(200,175,163,.12)"/>`;});
    const point=(h,i)=>pt(i,Math.max(5,R*(scores[h.id]?.value||0)/100));
    markup+=`<polygon points="${hazards.map((h,i)=>point(h,i).join(',')).join(' ')}" fill="rgba(185,120,107,.25)" stroke="#C8AFA3" stroke-width="1.5" stroke-linejoin="round"/>`;
    hazards.forEach((h,i)=>{
      const value=scores[h.id]?.value||0,[x,y]=point(h,i),[lx,ly]=pt(i,R+26),anchor=lx<145?'end':lx>155?'start':'middle';
      const isTop=topIds.includes(h.id),selected=selectedHazard===h.id;
      markup+=`<g class="data-hazard-node${isTop?' top':''}${selected?' selected':''}" style="cursor:pointer;--c:var(--nude)" data-h="${esc(h.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(h.name)}, simulated association index ${value} out of 100; not a probability or evidence of cause"><circle cx="${x}" cy="${y}" r="${isTop?9:6}" fill="var(--nude)" stroke="#140806" stroke-width="2"/><text x="${lx}" y="${ly}" text-anchor="${anchor}" class="lbl">${esc(h.name)}</text><text x="${lx}" y="${ly+15}" text-anchor="${anchor}" class="lbl2" fill="var(--nude)">${value}/100</text></g>`;
    });
    svg.innerHTML=markup;
    svg.setAttribute('aria-label','Five NASA HRP hazard topics. The polygon shows a fictional project-authored simulation index out of 100, not a probability, risk, or cause. Nodes are keyboard operable.');
    listEl.innerHTML=hazards.map(h=>`<button type="button" class="hz" data-h="${esc(h.id)}" aria-pressed="${selectedHazard===h.id}">${esc(h.name)} · ${scores[h.id]?.value||0}/100${topIds.includes(h.id)?' · top simulated match':''}</button>`).join('');
    svg.querySelectorAll('[data-h]').forEach(el=>{
      const select=()=>{selectedHazard=selectedHazard===el.dataset.h?null:el.dataset.h;renderAll(el.dataset.h);};
      el.addEventListener('click',select); el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select();}});
    });
    listEl.querySelectorAll('[data-h]').forEach(el=>el.addEventListener('click',()=>{selectedHazard=selectedHazard===el.dataset.h?null:el.dataset.h;renderAll(el.dataset.h);}));
  }

  function hazardDetailMarkup(h) {
    const hs=scores[h.id]||{value:0,signals:[]}, src=source(h.source);
    const panelLinks=panels.flatMap(p=>riskLinks(p,h.id).map(r=>({p,r}))).filter((x,i,a)=>a.findIndex(y=>y.p.id===x.p.id&&y.r.id===x.r.id)===i);
    const direct=list(DATA.projectAuthored.simulationModel.directMappings).filter(m=>list(m.hazards).includes(h.id)&&sources(m.sources));
    const riskHtml=panelLinks.map(({p,r})=>`<li>${esc(p.n)} — ${esc(r.name)}. Source: ${sources([r.source])}</li>`).join('');
    const directHtml=direct.map(m=>`<li>${esc(m.basis)} Source: ${sources(m.sources)}</li>`).join('');
    const next=topIds.includes(h.id)?modelStep([h.id]):'Simulation step: inspect this hazard’s cited description and linked inputs; no real-world action is generated.';
    const contributorRows=[...new Set(hs.signals||[])].map(id=>{const i=inputOf(id);return i?`<li>${esc(i.question)}: ${esc(numberValue(i))} ${esc(i.unit)}</li>`:'';}).filter(Boolean).join('');
    return `<div><div class="dh"><h3>${esc(h.name)}</h3><span class="tag">HAZARD CONTEXT</span></div><p class="sy">${esc(h.summary)}</p><p>Source: ${src?`<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a>`:'unavailable'}${safeUrl(h.nasaUrl)?` · <a href="${esc(h.nasaUrl)}" target="_blank" rel="noopener">NASA topic page</a>`:''}</p><h4>Simulated match in the diagram</h4><p>${hs.value||0}/100. This is a project-authored pattern display, not a cause, probability, or personal risk estimate.</p><h4>Inputs contributing to this match</h4>${contributorRows?`<ul>${contributorRows}</ul>`:'<p>No changed input currently maps to this hazard in the project data.</p>'}${riskHtml?`<h4>Body-topic links in cited risk records</h4><ul>${riskHtml}</ul>`:''}${directHtml?`<h4>Project-authored simulation mappings</h4><ul>${directHtml}</ul>`:''}<h4>Feedback for this demonstration</h4><p>${esc(next)}</p></div>`;
  }

  function renderBodyMaps() {
    const supported=bodyNodesWithData(), supportedIds=new Set(supported.map(node=>node.id));
    for (const [side,id] of [['F','ovF'],['B','ovB']]) {
      const root=$(id); if (!root) continue;
      root.innerHTML=coords[side].filter(([id])=>supportedIds.has(id)).map(([id,x,y])=>{
        const node=bodyNodes.find(n=>n.id===id), p=panelOf(id); if (!node) return '';
        const linked=selectedHazard&&p&&hazardsForPanel(p).some(h=>h.id===selectedHazard);
        const active=id===selectedPanel&&(!selectedSide||selectedSide===side);
        const deviation=panelDeviation(p), color=deviationColor(deviation??0), rounded=Math.round(deviation??0);
        const description=`${node.n}, synthetic input deviation ${rounded} out of 100; color shows distance from the JSON demo default, not health status${linked?'; linked in cited NASA risk context to selected hazard':''}`;
        return `<button type="button" class="hs data-supported${active?' on':''}${linked?' lit':''}" style="left:${x}%;top:${y}%;--c:${color};filter:drop-shadow(0 0 7px ${color})" data-o="${esc(id)}" data-v="${side}" title="${esc(description)}" aria-label="${esc(description)}" aria-pressed="${active}"></button>`;
      }).join('');
      root.querySelectorAll('[data-o]').forEach(btn=>btn.addEventListener('click',()=>{selectedPanel=btn.dataset.o;selectedSide=side;selectedHazard=null;renderAll(null,null,{side,id:selectedPanel});}));
    }
    const nodes=$('onodes'); if (!nodes) return;
    nodes.innerHTML=supported.map(node=>{
      const deviation=panelDeviation(panelOf(node.id)), color=deviationColor(deviation??0), rounded=Math.round(deviation??0);
      const description=`${node.n}, synthetic input deviation ${rounded} out of 100; not a health status`;
      return `<button type="button" class="tg data-supported${node.id===selectedPanel?' on':''}" style="--c:${color};box-shadow:0 0 10px ${color}" data-id="${esc(node.id)}" title="${esc(description)}" aria-label="${esc(description)}" aria-pressed="${node.id===selectedPanel}"><i aria-hidden="true"></i>${esc(node.n)}</button>`;
    }).join('');
    nodes.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>{selectedPanel=btn.dataset.id;selectedSide=null;selectedHazard=null;renderAll(null,selectedPanel);}));
  }

  function renderSymptomLog(panel) {
    const cfg=DATA?.projectAuthored?.symptomLog, questions=list(cfg?.questions), region=panel.id;
    if (!cfg||questions.length!==4) return '';
    const draft=symptomDrafts[region]||(symptomDrafts[region]={values:Object.create(null),touched:Object.create(null)});
    const history=list(symptomEntries[region]);
    const hasDraft=questions.some(q=>draft.touched[q.id]);

    // Calculate symptom impact on body region health
    let symptomImpact = null;
    if (history.length > 0) {
      const latest = history[history.length - 1];
      const avgSeverity = (latest.values.intensity + latest.values.activity + latest.values.frequency + latest.values.change) / 4;
      const impactLevel = avgSeverity < 3 ? 'low' : avgSeverity < 6 ? 'moderate' : 'high';
      const impactColor = avgSeverity < 3 ? '#3f6b5d' : avgSeverity < 6 ? '#b5651d' : '#a8281c';
      const impactText = avgSeverity < 3 ? 'Minimal impact on this body region' : avgSeverity < 6 ? 'Moderate impact on this body region' : 'Significant impact on this body region';
      symptomImpact = { avgSeverity, impactLevel, impactColor, impactText };
    }
    const prompts=questions.map(q=>{
      const value=draft.values[q.id]===undefined?5:Number(draft.values[q.id]);
      const rated=Boolean(draft.touched[q.id]), inputId=`symptom-${region}-${q.id}`;
      const position=pct((value-Number(q.min))/(Number(q.max)-Number(q.min))*100);
      const middle=q.id==='change'?q.middleLabel:String((Number(q.min)+Number(q.max))/2);
      return `<div class="cosmos-symptom-question"><div class="cosmos-symptom-question-head"><label for="${esc(inputId)}">${esc(q.question)}</label><output data-symptom-output="${esc(q.id)}" aria-live="polite">${rated?`${esc(value)}/10`:'Not rated'}</output></div><input id="${esc(inputId)}" type="range" min="${esc(q.min)}" max="${esc(q.max)}" step="${esc(q.step)}" value="${esc(value)}" style="--p:${position}%" data-symptom-slider="${esc(q.id)}" aria-label="${esc(q.question)}" aria-valuetext="${rated?`${esc(value)} out of 10, self-reported`:'Not rated yet; move the slider to answer'}" aria-describedby="${esc(inputId)}-scale"><div id="${esc(inputId)}-scale" class="cosmos-symptom-scale"><span>${esc(q.min)} · ${esc(q.lowLabel)}</span><span>${esc(middle)}</span><span>${esc(q.max)} · ${esc(q.highLabel)}</span></div></div>`;
    }).join('');
    const historyHtml=history.length?history.map(entry=>{
      const entryAvg=(entry.values.intensity+entry.values.activity+entry.values.frequency+entry.values.change)/4;
      const entryColor=entryAvg<3?'#3f6b5d':entryAvg<6?'#b5651d':'#a8281c';
      return `<article class="cosmos-symptom-entry" style="border-left:3px solid ${entryColor}"><time datetime="${esc(entry.iso)}">${esc(entry.displayTime)}</time><div class="cosmos-symptom-summary" style="color:${entryColor};font-weight:600;font-size:12px;margin-top:4px">Average severity: ${entryAvg.toFixed(1)}/10</div><ul>${questions.map(q=>`<li><span>${esc(q.question)}</span><b>${esc(entry.values[q.id])}/10</b></li>`).join('')}</ul></article>`;
    }).join(''):`<p class="cosmos-symptom-empty">${esc(cfg.emptyHistory)}</p>`;
    const canClear=history.length>0||hasDraft;

    // Build impact indicator HTML
    const impactHtml = symptomImpact ? `
      <div class="cosmos-symptom-impact" style="margin:12px 0;padding:12px;background:rgba(200,175,163,0.08);border-left:3px solid ${symptomImpact.impactColor};border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:12px;height:12px;border-radius:50%;background:${symptomImpact.impactColor};display:inline-block"></span>
          <strong style="color:#f1d8c9">${esc(symptomImpact.impactText)}</strong>
        </div>
        <p style="margin:0;font-size:12px;color:#a58f84">This symptom report is influencing the health status color of this body region. Higher severity increases the deviation shown on the body map.</p>
      </div>
    ` : '';

    return `<section id="cosmosSymptomLog" class="cosmos-symptom-log" aria-labelledby="cosmosSymptomHeading"><h4 id="cosmosSymptomHeading">${esc(cfg.heading)} · ${esc(panel.n)}</h4><p class="cosmos-symptom-intro">${esc(cfg.intro)}</p><p class="cosmos-symptom-privacy">${esc(cfg.privacyNote)}</p>${impactHtml}<div class="cosmos-symptom-prompts">${prompts}</div><div class="cosmos-symptom-actions"><button type="button" class="cosmos-symptom-btn" data-symptom-action="add">${esc(cfg.addLabel)}</button><button type="button" class="cosmos-symptom-btn secondary" data-symptom-action="clear"${canClear?'':' disabled'}>${esc(cfg.clearLabel)}</button></div><p class="cosmos-symptom-status" data-symptom-status role="status" aria-live="polite">${esc(symptomNotices[region]||'')}</p><h5 class="cosmos-symptom-history-heading">${esc(cfg.historyHeading||'Session entries')}</h5>${historyHtml}</section>`;
  }

  function refreshSymptomLog(panel, focusAction) {
    const current=$('cosmosSymptomLog'); if (!current) return;
    current.outerHTML=renderSymptomLog(panel);
    bindSymptomLog(panel);
    const root=$('cosmosSymptomLog');
    const focusTarget=focusAction==='clear'?root?.querySelector('[data-symptom-slider]'):root?.querySelector(`[data-symptom-action="${CSS.escape(focusAction)}"]`);
    focusTarget?.focus({preventScroll:true});
  }

  function bindSymptomLog(panel) {
    const root=$('cosmosSymptomLog'), cfg=DATA?.projectAuthored?.symptomLog, questions=list(cfg?.questions);
    if (!root||!cfg) return;
    const region=panel.id, draft=symptomDrafts[region]||(symptomDrafts[region]={values:Object.create(null),touched:Object.create(null)});
    const markRated=input=>{
      const question=questions.find(q=>q.id===input.dataset.symptomSlider); if (!question) return;
      const value=Number(input.value), position=pct((value-Number(question.min))/(Number(question.max)-Number(question.min))*100);
      draft.values[question.id]=value; draft.touched[question.id]=true;
      const output=root.querySelector(`[data-symptom-output="${CSS.escape(question.id)}"]`);
      if (output) output.textContent=`${value}/10`;
      input.setAttribute('aria-valuetext',`${value} out of 10, self-reported`);
      input.style.setProperty('--p',`${position}%`);
      const clear=root.querySelector('[data-symptom-action="clear"]'); if (clear) clear.disabled=false;
    };
    root.querySelectorAll('[data-symptom-slider]').forEach(input=>{
      input.addEventListener('input',()=>markRated(input));
      input.addEventListener('pointerdown',()=>markRated(input));
      input.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) markRated(input);});
    });
    root.querySelector('[data-symptom-action="add"]')?.addEventListener('click',()=>{
      const missing=questions.find(q=>!draft.touched[q.id]);
      if (missing) {
        const status=root.querySelector('[data-symptom-status]'); if (status) status.textContent=cfg.completionMessage;
        root.querySelector(`[data-symptom-slider="${CSS.escape(missing.id)}"]`)?.focus();
        return;
      }
      const now=new Date();
      (symptomEntries[region]||(symptomEntries[region]=[])).push({iso:now.toISOString(),displayTime:now.toLocaleString(),values:Object.fromEntries(questions.map(q=>[q.id,draft.values[q.id]]))});
      symptomDrafts[region]={values:Object.create(null),touched:Object.create(null)};
      symptomNotices[region]=cfg.savedMessage;
      refreshSymptomLog(panel,'add');
    });
    root.querySelector('[data-symptom-action="clear"]')?.addEventListener('click',()=>{
      symptomEntries[region]=[];
      symptomDrafts[region]={values:Object.create(null),touched:Object.create(null)};
      symptomNotices[region]=cfg.clearedMessage;
      refreshSymptomLog(panel,'clear');
    });
  }

  function renderSymptomSection() {
    let section=$('cosmosSymptomSection');
    if (!section) {
      const cfg=DATA?.projectAuthored?.symptomLog;
      section=document.createElement('section'); section.id='cosmosSymptomSection'; section.className='s cosmos-symptom-section';
      section.innerHTML=`<div class="in"><div class="sh"><span class="eb">OPTIONAL · SESSION-ONLY DEMO</span><h2 id="cosmosSymptomSectionTitle">${esc(cfg?.sectionTitle||'Symptom check-in')}</h2><p>${esc(cfg?.sectionIntro||'Select a supported body region in the map above.')}</p></div><div id="cosmosSymptomLogHost"></div></div>`;
      const bodySection=$('body'), hazardSection=$('read');
      if (bodySection?.parentNode) bodySection.insertAdjacentElement('afterend',section);
      else if (hazardSection?.parentNode) hazardSection.parentNode.insertBefore(section,hazardSection);
    }
    const host=$('cosmosSymptomLogHost'), panel=panelOf(selectedPanel);
    if (!host) return;
    host.innerHTML=panel?renderSymptomLog(panel):'<p class="note">Select a supported body region above to start a symptom check-in.</p>';
    if (panel) bindSymptomLog(panel);
  }

  function renderPanel() {
    const target=$('pDetail'); if (!target) return;
    if (selectedHazard&&hazardOf(selectedHazard)) { target.innerHTML=hazardDetailMarkup(hazardOf(selectedHazard)); return; }
    const p=panelOf(selectedPanel), node=bodyNodes.find(x=>x.id===selectedPanel);
    if (!p) { target.innerHTML=`<div><div class="dh"><h3>${esc(node?.n||'Body region')}</h3><span class="tag">NO JSON MAPPING</span></div><p>This region remains on the original body map, but the current JSON has no sourced indicator or hazard mapping for it. No calculation is shown for this region.</p></div>`; return; }

    const panelCites=sources(p.whySource);
    const currentEnv = currentEnvironment();

    // Calculate overall body region health status
    const deviation = panelDeviation(p);
    const healthStatus = deviation < 20 ? 'good' : deviation < 50 ? 'moderate' : 'concern';
    const healthColor = deviation < 20 ? '#3f6b5d' : deviation < 50 ? '#b5651d' : '#a8281c';
    const healthLabel = deviation < 20 ? 'Stable' : deviation < 50 ? 'Monitor' : 'Attention';

    // Get symptom data for this region
    const symptomHistory = list(symptomEntries[p.id]);
    const hasSymptoms = symptomHistory.length > 0;
    const latestSymptom = hasSymptoms ? symptomHistory[symptomHistory.length - 1] : null;
    const symptomAvg = latestSymptom ? (latestSymptom.values.intensity + latestSymptom.values.activity + latestSymptom.values.frequency + latestSymptom.values.change) / 4 : 0;

    // Build input rows with deviation indicators
    const inputRows=list(p.indicators).map(id=>{
      const i=inputOf(id); if (!i) return '';
      const value=numberValue(i), pos=rangePosition(i,value);
      const dev = inputDeviation(i);
      const devColor = deviationColor(dev);
      const statusIcon = dev < 15 ? '✓' : dev < 40 ? '⚠' : '⚠';
      const statusColor = dev < 15 ? '#3f6b5d' : dev < 40 ? '#b5651d' : '#a8281c';
      return `<div class="row" style="--c:${devColor}"><div><span><i class="dot" aria-hidden="true"></i>${esc(i.question)}</span><b>${esc(value)} ${esc(i.unit)}</b></div><div class="bar" role="img" aria-label="${esc(i.question)} slider position ${Math.round(pos)} out of 100"><i style="width:${Math.max(3,pos)}%"></i></div><div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="color:${statusColor};font-size:12px">${statusIcon}</span><span style="font-size:11px;color:${statusColor}">${dev < 15 ? 'Near baseline' : dev < 40 ? 'Moderate deviation' : 'High deviation'}</span></div></div>`;
    }).filter(Boolean).join('');

    // Build dynamic hazard analysis
    const topicHazards=hazardsForPanel(p);
    const hazardAnalysis = topicHazards.map(h=>{
      const score = scores[h.id]?.value || 0;
      const rs=riskLinks(p,h.id);
      const riskName = rs.length > 0 ? rs[0].name : 'General spaceflight risk';
      let hazardStatus, hazardColor, hazardAdvice;
      if (score < 15) {
        hazardStatus = 'Low concern';
        hazardColor = '#3f6b5d';
        hazardAdvice = 'Current indicators show minimal deviation. Continue standard monitoring protocols.';
      } else if (score < 40) {
        hazardStatus = 'Moderate influence';
        hazardColor = '#b5651d';
        hazardAdvice = 'Some indicators deviate from baseline. Review your daily routine and ensure countermeasures are being followed.';
      } else {
        hazardStatus = 'Significant influence';
        hazardColor = '#a8281c';
        hazardAdvice = 'Multiple indicators show notable deviation. Consider discussing this pattern with your crew medical officer.';
      }
      return `<li style="margin-bottom:12px;padding:10px;background:rgba(200,175,163,0.05);border-left:3px solid ${hazardColor};border-radius:4px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <button type="button" class="hz" data-panel-h="${esc(h.id)}" style="font-weight:600">${esc(h.name)}</button>
          <span style="color:${hazardColor};font-size:12px;font-weight:600">${hazardStatus} · ${score}/100</span>
        </div>
        <div style="font-size:12px;color:#a58f84;margin-bottom:4px">Associated risk: ${esc(riskName)}</div>
        <div style="font-size:12px;color:#c8afa3">${esc(hazardAdvice)}</div>
      </li>`;
    }).join('');

    // Build environment-specific context
    const envContext = currentEnv?.environmentNotes ? 
      Object.entries(currentEnv.environmentNotes)
        .filter(([inputId]) => p.indicators.includes(inputId))
        .map(([inputId, note]) => {
          const input = inputOf(inputId);
          return input ? `<div style="margin-bottom:8px;padding:8px;background:rgba(200,175,163,0.08);border-radius:4px"><strong style="color:#f1d8c9;font-size:12px">${esc(input.question)}:</strong><p style="margin:4px 0 0;font-size:12px;color:#a58f84">${esc(note)}</p></div>` : '';
        }).join('') : '';

    // Build dynamic recommendations based on actual state
    const recommendations = [];
    if (deviation < 20) {
      recommendations.push('Continue your current health maintenance routine');
      recommendations.push('Log measurements consistently to track trends');
      if (currentEnv) recommendations.push(`Follow standard ${currentEnv.name} protocols`);
    } else if (deviation < 50) {
      recommendations.push('Review recent changes in sleep, exercise, or stress levels');
      recommendations.push('Ensure you are following countermeasure protocols');
      recommendations.push('Monitor this body region more frequently');
      if (hasSymptoms && symptomAvg > 5) recommendations.push('Consider reporting symptoms to crew medical officer');
    } else {
      recommendations.push('Prioritize rest and recovery');
      recommendations.push('Discuss these readings with your crew medical officer');
      recommendations.push('Review environment-specific risks in the hazard panel');
      if (hasSymptoms) recommendations.push('Document symptom progression in the log below');
    }

    // Add symptom-based recommendations
    if (hasSymptoms && symptomAvg > 6) {
      recommendations.push('High symptom severity detected - consider immediate crew consultation');
    }

    const recommendationsHtml = recommendations.map((rec, i) => 
      `<li style="margin-bottom:6px"><span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background:${healthColor};color:#140806;border-radius:50%;font-size:11px;font-weight:700;margin-right:8px">${i+1}</span>${esc(rec)}</li>`
    ).join('');

    // Build symptom summary if exists
    const symptomSummaryHtml = hasSymptoms ? `
      <h4>Recent Symptom Report</h4>
      <div style="padding:10px;background:rgba(200,175,163,0.08);border-radius:6px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="width:12px;height:12px;border-radius:50%;background:${symptomAvg < 3 ? '#3f6b5d' : symptomAvg < 6 ? '#b5651d' : '#a8281c'};display:inline-block"></span>
          <strong style="color:#f1d8c9">Average severity: ${symptomAvg.toFixed(1)}/10</strong>
        </div>
        <p style="margin:0;font-size:12px;color:#a58f84">Last reported: ${esc(latestSymptom.displayTime)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#a58f84">This report is factored into the body region health status.</p>
      </div>
    ` : '';

    const context=p.why&&panelCites?`<h4>Why this topic appears in the body view</h4><p>${esc(p.why)}</p><p class="note">Source: ${panelCites}</p>`:'<p class="note">No source-linked explanation is available for this body topic.</p>';
    const projectSummary=p.fn?`<p class="note"><b>Function:</b> ${esc(p.fn)}</p>`:'';

    target.innerHTML=`<div>
      <div class="dh">
        <h3>${esc(p.n)}</h3>
        <span class="tag" style="background:${healthColor};color:#140806;font-weight:600">${healthLabel}</span>
      </div>
      <p class="sy">${esc(p.loc||'Body-map topic')}</p>
      ${projectSummary}

      <div style="margin:12px 0;padding:12px;background:rgba(200,175,163,0.08);border-radius:8px;border-left:3px solid ${healthColor}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:14px;height:14px;border-radius:50%;background:${healthColor};display:inline-block"></span>
          <strong style="color:#f1d8c9">Overall Status: ${healthLabel}</strong>
          <span style="margin-left:auto;color:#a58f84;font-size:12px">Deviation: ${Math.round(deviation)}/100</span>
        </div>
        <p style="margin:0;font-size:12px;color:#a58f84">${deviation < 20 ? 'Indicators are near baseline values.' : deviation < 50 ? 'Some indicators show moderate deviation from baseline.' : 'Multiple indicators show significant deviation from baseline.'}</p>
      </div>

      <h4>Inputs in this body area</h4>
      ${inputRows||'<p>No indicators are listed for this body area.</p>'}

      ${symptomSummaryHtml}

      <h4>Hazard Analysis</h4>
      ${hazardAnalysis ? `<ul style="list-style:none;padding:0;margin:0">${hazardAnalysis}</ul>` : '<p>No source-linked hazard match is available for this body area.</p>'}

      ${envContext ? `<h4>Environment-Specific Notes (${esc(currentEnv?.name || 'Current Environment')})</h4>${envContext}` : ''}

      <h4>Recommended Actions</h4>
      <ul style="list-style:none;padding:0;margin:0">${recommendationsHtml}</ul>

      <h4>Spaceflight Context</h4>
      ${context}

      <p class="note" style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(200,175,163,0.15);font-size:11px;color:#a58f84">This analysis is based on deviation from demo defaults and self-reported symptoms. It is not a medical diagnosis. Always consult with your crew medical officer for health concerns.</p>
    </div>`;

    target.querySelectorAll('[data-panel-h]').forEach(btn=>btn.addEventListener('click',()=>{selectedHazard=btn.dataset.panelH;renderAll(btn.dataset.panelH);}));
  }

  
  function environments() {
    return list(DATA?.projectAuthored?.environments?.items);
  }

  function environmentOf(id) {
    return environments().find(e => e?.id === id) || null;
  }

  function currentEnvironment() {
    return environmentOf(selectedEnvironment) || environments()[0] || null;
  }

  function renderEnvironment() {
    const envs = environments();
    if (!envs.length) return;

    // Create or update the environment selector in the hero section
    let selector = $('envSelector');
    if (!selector) {
      // Find the hero section
      const hero = $('hero');
      if (!hero) return;

      // Create the environment selector container
      selector = document.createElement('div');
      selector.id = 'envSelector';
      selector.className = 'env-selector';
      selector.setAttribute('role', 'group');
      selector.setAttribute('aria-label', 'Mission environment selector');

      // Insert after the title area
      const ttl = hero.querySelector('.ttl');
      if (ttl) {
        ttl.insertAdjacentElement('afterend', selector);
      } else {
        hero.insertAdjacentElement('afterbegin', selector);
      }
    }

    // Render environment buttons
    const current = currentEnvironment();
    selector.innerHTML = `
      <div class="env-label">
        <span class="eb">MISSION ENVIRONMENT</span>
      </div>
      <div class="env-buttons">
        ${envs.map(env => `
          <button type="button" class="env-btn${env.id === selectedEnvironment ? ' active' : ''}" 
                  data-env="${esc(env.id)}" 
                  aria-pressed="${env.id === selectedEnvironment}"
                  title="${esc(env.name)} — ${esc(env.tagline)}">
            <span class="env-icon" aria-hidden="true">${esc(env.icon)}</span>
            <span class="env-name">${esc(env.name)}</span>
          </button>
        `).join('')}
      </div>
    `;

    // Add click handlers
    selector.querySelectorAll('[data-env]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedEnvironment = btn.dataset.env;
        renderAll();
      });
    });

    // Create or update the environment info panel
    let infoPanel = $('envInfo');
    if (!infoPanel) {
      // Find the body section to insert the environment panel
      const bodySection = $('body');
      if (!bodySection) return;

      infoPanel = document.createElement('div');
      infoPanel.id = 'envInfo';
      infoPanel.className = 'env-info-panel';

      // Insert before the body section's inner content
      const bodyIn = bodySection.querySelector('.in');
      if (bodyIn) {
        bodyIn.insertAdjacentElement('afterbegin', infoPanel);
      }
    }

    // Render environment details
    if (current) {
      const emphasis = current.indicatorEmphasis || {};
      const primary = list(emphasis.primary);
      const secondary = list(emphasis.secondary);
      const contextual = list(emphasis.contextual);

      infoPanel.innerHTML = `
        <div class="env-header">
          <span class="env-icon-large" aria-hidden="true">${esc(current.icon)}</span>
          <div>
            <h3 class="env-title">${esc(current.name)}</h3>
            <p class="env-tagline">${esc(current.tagline)}</p>
          </div>
        </div>
        <p class="env-description">${esc(current.description)}</p>

        <div class="env-section">
          <h4>Key Features</h4>
          <ul class="env-features">
            ${list(current.keyFeatures).map(f => `<li>${esc(f)}</li>`).join('')}
          </ul>
        </div>

        <div class="env-section">
          <h4>Indicator Emphasis</h4>
          <div class="env-emphasis">
            ${primary.length ? `
              <div class="emphasis-group primary">
                <span class="emphasis-label">Primary focus:</span>
                ${primary.map(id => {
                  const input = inputOf(id);
                  return input ? `<span class="emphasis-tag primary" title="${esc(input.question)}">${esc(input.question)}</span>` : '';
                }).join('')}
              </div>
            ` : ''}
            ${secondary.length ? `
              <div class="emphasis-group secondary">
                <span class="emphasis-label">Secondary:</span>
                ${secondary.map(id => {
                  const input = inputOf(id);
                  return input ? `<span class="emphasis-tag secondary" title="${esc(input.question)}">${esc(input.question)}</span>` : '';
                }).join('')}
              </div>
            ` : ''}
            ${contextual.length ? `
              <div class="emphasis-group contextual">
                <span class="emphasis-label">Contextual:</span>
                ${contextual.map(id => {
                  const input = inputOf(id);
                  return input ? `<span class="emphasis-tag contextual" title="${esc(input.question)}">${esc(input.question)}</span>` : '';
                }).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        ${current.environmentNotes ? `
          <div class="env-section">
            <h4>Environment-Specific Notes</h4>
            <div class="env-notes">
              ${Object.entries(current.environmentNotes).map(([inputId, note]) => {
                const input = inputOf(inputId);
                return input ? `
                  <div class="env-note">
                    <strong>${esc(input.question)}</strong>
                    <p>${esc(note)}</p>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${current.hazardContext ? `
          <div class="env-section">
            <h4>Hazard Context</h4>
            <div class="env-hazards">
              ${Object.entries(current.hazardContext).map(([hazardId, context]) => {
                const hazard = hazardOf(hazardId);
                return hazard ? `
                  <div class="env-hazard">
                    <strong>${esc(hazard.name)}</strong>
                    <p>${esc(context)}</p>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        ` : ''}

        <p class="env-disclaimer">${esc(DATA?.projectAuthored?.environments?.note || 'Environment selection is contextual only and does not affect the simulation calculation.')}</p>
      `;
    }
  }

function renderAll(focusHazard, focusPanel, focusHotspot) {
    const state=calculate();
    for (const i of inputs) {
      const el=$(`i_${i.id}`), out=$(`o_${i.id}`), wrap=$(`w_${i.id}`);
      if (!el||!out) continue;
      const value=numberValue(i);
      out.textContent=`${value} ${i.unit}`;
      el.style.setProperty('--p',`${rangePosition(i,value)}%`);
      if (wrap) { wrap.className='sl data-linked'; wrap.style.setProperty('--c',deviationColor(inputDeviation(i,value))); }
    }
    renderBanner(state); renderRadar(); renderBodyMaps(); renderPanel(); renderSymptomSection(); renderEnvironment();
    if (focusHazard) document.querySelector(`#hzl [data-h="${CSS.escape(focusHazard)}"]`)?.focus({preventScroll:true});
    if (focusPanel) document.querySelector(`#onodes [data-id="${CSS.escape(focusPanel)}"]`)?.focus({preventScroll:true});
    if (focusHotspot) document.querySelector(`#ov${CSS.escape(focusHotspot.side)} [data-o="${CSS.escape(focusHotspot.id)}"]`)?.focus({preventScroll:true});
  }

  function unavailable(message) {
    const banner=$('banner'); if (banner) banner.innerHTML=`<div><b>Project JSON unavailable</b><span>${esc(message)}</span><small>No hazard calculation is available until the project data loads.</small></div>`;
    if (banner) lastBannerHTML=banner.innerHTML;
    for (const id of ['radar','hzl','onodes','pDetail','cosmosHazardDetail']) { const el=$(id); if (el) el.innerHTML='<p class="note">This data-backed section is unavailable because the project JSON could not be loaded or validated.</p>'; }
    for (const id of ['ovF','ovB']) if ($(id)) $(id).replaceChildren();
    for (const el of document.querySelectorAll('#sliders input[type="range"]')) el.disabled=true;
    if ($('sliders')) $('sliders').innerHTML='<p class="note">Synthetic input controls are unavailable until valid project JSON loads.</p>';
    for (const el of document.querySelectorAll('.pre,#go')) el.disabled=true;
    console.error('Cosmos Health JSON integration:',message);
  }

  function installStyles() {
    if ($('cosmosDataLinkStyles')) return;

    // Environment selector styles
    const envStyle = document.createElement('style');
    envStyle.id = 'cosmosEnvironmentStyles';
    envStyle.textContent = `
      .env-selector {
        position: absolute;
        top: 20px;
        right: 20px;
        z-index: 100;
        background: rgba(20, 8, 6, 0.9);
        border: 1px solid rgba(200, 175, 163, 0.3);
        border-radius: 12px;
        padding: 12px;
        backdrop-filter: blur(10px);
      }
      .env-label {
        margin-bottom: 8px;
      }
      .env-label .eb {
        font-size: 11px;
        letter-spacing: 0.1em;
      }
      .env-buttons {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .env-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: 1px solid rgba(200, 175, 163, 0.3);
        border-radius: 8px;
        background: rgba(200, 175, 163, 0.1);
        color: #ecdcd0;
        font: inherit;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .env-btn:hover {
        background: rgba(200, 175, 163, 0.2);
        border-color: rgba(200, 175, 163, 0.5);
      }
      .env-btn.active {
        background: #c8afa3;
        color: #140806;
        border-color: #c8afa3;
      }
      .env-btn:focus-visible {
        outline: 2px solid #c8afa3;
        outline-offset: 2px;
      }
      .env-icon {
        font-size: 16px;
      }
      .env-name {
        font-weight: 600;
      }

      .env-info-panel {
        background: rgba(200, 175, 163, 0.05);
        border: 1px solid rgba(200, 175, 163, 0.2);
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 20px;
      }
      .env-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
      }
      .env-icon-large {
        font-size: 36px;
      }
      .env-title {
        margin: 0;
        color: #f1d8c9;
        font-size: 22px;
      }
      .env-tagline {
        margin: 4px 0 0;
        color: #a58f84;
        font-size: 13px;
      }
      .env-description {
        color: #ecdcd0;
        line-height: 1.6;
        margin: 0 0 16px;
      }
      .env-section {
        margin-top: 16px;
      }
      .env-section h4 {
        color: #c8afa3;
        font-size: 13px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin: 0 0 10px;
      }
      .env-features {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 8px;
      }
      .env-features li {
        padding: 8px 12px;
        background: rgba(200, 175, 163, 0.08);
        border-radius: 8px;
        font-size: 13px;
        color: #ecdcd0;
      }
      .env-features li::before {
        content: "✓ ";
        color: #c8afa3;
      }
      .env-emphasis {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .emphasis-group {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .emphasis-label {
        font-size: 12px;
        color: #a58f84;
        min-width: 90px;
      }
      .emphasis-tag {
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .emphasis-tag.primary {
        background: rgba(185, 120, 107, 0.3);
        color: #f1d8c9;
        border: 1px solid rgba(185, 120, 107, 0.5);
      }
      .emphasis-tag.secondary {
        background: rgba(200, 175, 163, 0.15);
        color: #c8afa3;
        border: 1px solid rgba(200, 175, 163, 0.3);
      }
      .emphasis-tag.contextual {
        background: rgba(165, 143, 132, 0.1);
        color: #a58f84;
        border: 1px solid rgba(165, 143, 132, 0.2);
      }
      .env-notes, .env-hazards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 10px;
      }
      .env-note, .env-hazard {
        padding: 10px 12px;
        background: rgba(20, 8, 6, 0.3);
        border-left: 3px solid #b5651d;
        border-radius: 6px;
      }
      .env-note strong, .env-hazard strong {
        display: block;
        color: #f1d8c9;
        font-size: 13px;
        margin-bottom: 4px;
      }
      .env-note p, .env-hazard p {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: #a58f84;
      }
      .env-disclaimer {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid rgba(200, 175, 163, 0.15);
        font-size: 11px;
        color: #a58f84;
        font-style: italic;
      }

      @media (max-width: 720px) {
        .env-selector {
          position: static;
          margin: 10px;
        }
        .env-buttons {
          flex-direction: column;
        }
        .env-features, .env-notes, .env-hazards {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(envStyle);
    
    const style=document.createElement('style'); style.id='cosmosDataLinkStyles';
    style.textContent=`.data-linked{--c:#3f6b5d}.data-linked .q label::before{display:none!important;content:none!important}.data-linked .q output{display:block!important;min-width:72px;text-align:right;color:#1a0b08!important;font-size:18px;font-weight:600}.data-linked input[type=range]{height:24px;background-size:100% 3px;background-position:center;background-repeat:no-repeat;touch-action:pan-y}.data-linked input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:19px;height:19px;border-radius:50%;background:var(--c);border:3px solid #f1d8c9;cursor:pointer}.data-linked input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--c);border:3px solid #f1d8c9;cursor:pointer}.data-supported{transition:filter .2s ease,box-shadow .2s ease}.data-supported:focus-visible{outline:3px solid #1a0b08;outline-offset:3px}.cosmos-signal-key{margin:0 0 18px;padding:10px 14px;border-left:3px solid #b5651d;background:rgba(26,11,8,.05);line-height:1.5}.data-hazard-node.top circle{stroke:var(--hot2)!important;stroke-width:3!important}.data-hazard-node.selected circle{stroke:#fff!important;stroke-width:3!important}.data-hazard-node:focus{outline:none}.data-hazard-node:focus circle{stroke:#fff!important;stroke-width:4!important}.banner small{display:block;margin-top:8px;line-height:1.4;color:var(--mute)}.data-linked input[type=range]:focus-visible{outline:3px solid #1a0b08;outline-offset:2px}`;
    document.head.appendChild(style);
    const symptomStyle=document.createElement('style'); symptomStyle.id='cosmosSymptomLogStyles';
    symptomStyle.textContent=`.cosmos-symptom-log{margin:24px 0 12px;padding:16px;border:1px solid rgba(200,175,163,.3);border-radius:14px;background:rgba(200,175,163,.045)}.cosmos-symptom-log>h4{margin:0 0 8px!important;color:#f1d8c9!important;font-size:18px!important}.cosmos-symptom-intro,.cosmos-symptom-privacy,.cosmos-symptom-note,.cosmos-symptom-empty,.cosmos-symptom-status{font-size:13px;line-height:1.55}.cosmos-symptom-privacy{margin:8px 0 14px!important;padding:9px 11px;border-left:2px solid #c8afa3;background:rgba(200,175,163,.06)}.cosmos-symptom-question{margin:12px 0;padding:12px;border:1px solid rgba(200,175,163,.22);border-radius:11px;background:rgba(20,8,6,.22)}.cosmos-symptom-question-head{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}.cosmos-symptom-question label{font-size:14px;font-weight:600;line-height:1.45;color:#f1d8c9}.cosmos-symptom-question output{min-width:68px;text-align:right;font-size:13px;color:#f1d8c9}.cosmos-symptom-question input[type=range]{--c:#c8afa3;width:100%;height:24px;margin:8px 0 0;background:linear-gradient(90deg,var(--c) var(--p,50%),rgba(236,220,208,.22) var(--p,50%));background-size:100% 3px;background-position:center;background-repeat:no-repeat;touch-action:pan-y}.cosmos-symptom-question input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#c8afa3;border:3px solid #140806;cursor:pointer}.cosmos-symptom-question input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#c8afa3;border:3px solid #140806;cursor:pointer}.cosmos-symptom-scale{display:flex;justify-content:space-between;gap:8px;color:#c8afa3;font-size:11px;line-height:1.4}.cosmos-symptom-scale span{max-width:46%;text-align:center}.cosmos-symptom-question input:focus-visible,.cosmos-symptom-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}.cosmos-symptom-actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 8px}.cosmos-symptom-btn{padding:10px 14px;border:1px solid #c8afa3;border-radius:999px;background:#c8afa3;color:#140806;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.cosmos-symptom-btn.secondary{background:transparent;color:#f1d8c9}.cosmos-symptom-btn:disabled{opacity:.45;cursor:not-allowed}.cosmos-symptom-status{min-height:1em;color:#f1d8c9!important}.cosmos-symptom-note{margin:8px 0!important}.cosmos-symptom-history-heading{margin:18px 0 8px;color:#f1d8c9;font-size:14px}.cosmos-symptom-entry{margin:10px 0;padding:11px;border:1px solid rgba(200,175,163,.2);border-radius:10px}.cosmos-symptom-entry time{font-size:12px;color:#c8afa3}.cosmos-symptom-entry ul{margin:8px 0 0!important;padding-left:18px}.cosmos-symptom-entry li{display:flex;justify-content:space-between;gap:12px;margin:4px 0;font-size:12px;line-height:1.4}.cosmos-symptom-entry li b{white-space:nowrap;color:#f1d8c9}@media(max-width:520px){.cosmos-symptom-log{padding:12px}.cosmos-symptom-actions{display:grid;grid-template-columns:1fr}.cosmos-symptom-btn{width:100%}}@media(prefers-reduced-motion:reduce){.cosmos-symptom-log{animation:none!important}}`;
    symptomStyle.textContent+=`.cosmos-symptom-scale{display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center}.cosmos-symptom-scale span:first-child{text-align:left}.cosmos-symptom-scale span:last-child{text-align:right}`;
    symptomStyle.textContent+=`.cosmos-symptom-section .cosmos-symptom-log{margin:0;padding:0;border:0;border-radius:0;background:transparent}.cosmos-symptom-prompts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px}.cosmos-symptom-section .cosmos-symptom-question{margin:0;padding:14px 6px;border:0;border-bottom:1px solid rgba(200,175,163,.22);border-radius:0;background:transparent}.cosmos-symptom-section .cosmos-symptom-scale{font-size:12px}.cosmos-symptom-section .cosmos-symptom-actions{margin-top:18px}@media(max-width:720px){.cosmos-symptom-prompts{grid-template-columns:1fr;column-gap:0}}`;
    document.head.appendChild(symptomStyle);
  }

  async function init() {
    const banner=$('banner'); if (banner) banner.innerHTML='<div><b>Loading project data</b><span>Connecting the supplied interface to its JSON-backed simulation.</span></div>';
    for (const el of document.querySelectorAll('#sliders input[type="range"],.pre,#go')) el.disabled=true;
    for (const id of ['radar','hzl','onodes','pDetail']) if ($(id)) $(id).innerHTML='<p class="note">Loading project JSON…</p>';
    for (const id of ['ovF','ovB']) if ($(id)) $(id).replaceChildren();
    document.querySelectorAll('#sliders .sl small').forEach(el=>{el.textContent='Loading indicator definition from project JSON…';});
    if (banner) {
      lastBannerHTML=banner.innerHTML;
      new MutationObserver(()=>{
        if (banner.innerHTML!==lastBannerHTML) {
          lastBannerHTML=banner.innerHTML;
          setTimeout(()=>{if(DATA)renderAll();},0);
        }
      }).observe(banner,{childList:true,subtree:true,characterData:true});
    }
    try {
      const response=await fetch('./data/cosmos-health-data.json',{cache:'no-store'});
      if (!response.ok) throw new Error(`JSON request failed (${response.status})`);
      DATA=await response.json();
      inputs=list(DATA?.projectAuthored?.inputs);
      panels=list(DATA?.projectAuthored?.bodyPanels);
      hazards=list(DATA?.sourced?.hazards).filter(h=>h?.id&&h?.name&&source(h.source));
      if (!inputs.length||!panels.length||!hazards.length||!DATA?.projectAuthored?.simulationModel||list(DATA?.projectAuthored?.symptomLog?.questions).length!==4) throw new Error('Required indicator, body-topic, hazard, simulation-model, or symptom-log data is missing.');
      const missing=inputs.filter(i=>!$(`i_${i.id}`)||!$(`w_${i.id}`));
      if (missing.length) throw new Error(`The supplied HTML lacks controls for: ${missing.map(x=>x.id).join(', ')}.`);
      installStyles();
      document.querySelectorAll('#body h2, #read p, #daily *').forEach(el=>{
        const text=el.textContent.trim();
        if (text==='Where is it coming from?') el.textContent='Body map · linked topics';
        else if (text==='Tap a hazard to light up the organs it affects.') el.textContent='Select a hazard to view its source and linked body topics. Links are educational context, not individual effects or causes.';
        else if (text==='See what your body says') el.textContent='Move sliders to update feedback and the diagram. Green is near the JSON demo default; amber is between; red is farther away. Colors do not indicate health.';
      });
      if (!document.getElementById('cosmosBodySignalKey')) {
        const key=document.createElement('p'); key.id='cosmosBodySignalKey'; key.className='note cosmos-signal-key';
        key.innerHTML='<b>Color key:</b> Green = near the JSON demo default; amber = between; red = farther away within the slider range. Each body-region glow averages its listed inputs. This is synthetic input deviation only—not health, risk, or a medical limit.';
        const regionList=$('onodes');
        if (regionList) regionList.insertAdjacentElement('beforebegin',key);
      }
      for (const i of inputs) {
        const range=$(`i_${i.id}`);
        range.removeAttribute('min'); range.removeAttribute('max');
      }
      renderInputs();
      // Keep the original controls and their listeners; normalize their current values to the JSON defaults.
      for (const i of inputs) {
        const range=$(`i_${i.id}`), n=Number(i.default);
        range.disabled=false;
        if (Number(range.value)!==n) { range.value=String(n); range.dispatchEvent(new Event('input',{bubbles:true})); }
        range.addEventListener('input',()=>renderAll());
      }
      for (const btn of document.querySelectorAll('.pre[data-n]')) btn.addEventListener('click',()=>setTimeout(()=>renderAll(),0));
      $('go')?.addEventListener('click',()=>setTimeout(()=>renderAll(),100));
      for (const btn of document.querySelectorAll('.pre,#go')) btn.disabled=false;
      document.querySelectorAll('.ov img').forEach(img=>img.setAttribute('alt','Body-map illustration; hotspots are educational navigation regions, not clinical anatomy markers.'));
      renderAll();
    } catch (error) { unavailable(error?.message||'Could not read the runtime JSON. Start this folder through a local HTTP server and check the data path.'); }
  }

  init();
})();
