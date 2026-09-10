/* DREAMFOREN v120.33.0 · TEAM-SPLIT SAMPLE / REPOSITORY */
(function(){
  'use strict';
  const VERSION='v120.33.0',$=id=>document.getElementById(id);
  const teamOfData=data=>{const t=String(data?.selectedTeam||data?.fields?.team||'').replace(/팀$/,'').trim();return t==='1'||t==='2'?t:'unknown'};
  const teamLabel=t=>t==='1'?'1팀':t==='2'?'2팀':'팀 미지정';
  function splitTodayRecords(){
    const list=$('todayRecordList');if(!list)return;
    const items=[...list.querySelectorAll(':scope > .record-item')];if(!items.length)return;
    const store=typeof readRecordStore==='function'?readRecordStore():[];
    const groups={1:[],2:[],unknown:[]};
    items.forEach(item=>{const id=item.querySelector('[data-id]')?.dataset.id,row=store.find(x=>String(x.id)===String(id));groups[teamOfData(row?.data)].push(item)});
    list.innerHTML='';['1','2','unknown'].forEach(team=>{if(!groups[team].length)return;const section=document.createElement('section');section.className='df-sample-team-group';section.dataset.sampleTeam=team;section.innerHTML=`<h4><span>${teamLabel(team)}</span><b>${groups[team].length}건</b></h4><div></div>`;groups[team].forEach(x=>section.lastElementChild.appendChild(x));list.appendChild(section)});
  }
  function splitRepository(){
    const list=$('dfRepositoryList');if(!list)return;
    const selected=$('dfRepositoryTeam')?.value||'all';let shown=0;
    list.querySelectorAll('.df-repository-date-group').forEach(dateGroup=>{
      const folders=[...dateGroup.querySelectorAll(':scope > .df-repository-folder')];if(!folders.length)return;
      const title=dateGroup.querySelector(':scope > .df-repository-date-title');
      dateGroup.querySelectorAll(':scope > .df-repository-team-group').forEach(x=>x.remove());
      const groups={1:[],2:[],unknown:[]};
      const repositoryRows=typeof dfRepositoryRows!=='undefined'?dfRepositoryRows:[];
      folders.forEach(folder=>{const row=repositoryRows.find(x=>String(x.receipt_no)===String(folder.dataset.repoReceipt));const team=teamOfData(row?.measurement_data?.data);folder.dataset.repoTeam=team;groups[team].push(folder)});
      ['1','2','unknown'].forEach(team=>{if(!groups[team].length)return;const section=document.createElement('section');section.className='df-repository-team-group';section.dataset.repoTeamGroup=team;section.hidden=selected!=='all'&&selected!==team;section.innerHTML=`<h4><span>${teamLabel(team)}</span><b>${groups[team].length}건</b></h4><div class="df-repository-team-items"></div>`;groups[team].forEach(folder=>{const head=folder.querySelector('.df-repository-folder-head small');if(head&&!head.querySelector('.df-team-badge'))head.insertAdjacentHTML('afterbegin',`<span class="df-team-badge">${teamLabel(team)}</span> `);section.lastElementChild.appendChild(folder)});dateGroup.appendChild(section);if(!section.hidden)shown+=groups[team].length});
      dateGroup.hidden=![...dateGroup.querySelectorAll(':scope > .df-repository-team-group')].some(x=>!x.hidden);if(title)title.hidden=dateGroup.hidden;
    });
    if($('dfRepositoryCount'))$('dfRepositoryCount').textContent=shown;
  }
  function bind(){
    if(typeof window.renderTodayRecords==='function'){const base=window.renderTodayRecords;window.renderTodayRecords=function(){const out=base.apply(this,arguments);splitTodayRecords();return out};splitTodayRecords()}
    if(typeof window.dfRepositoryRender==='function'){const base=window.dfRepositoryRender;window.dfRepositoryRender=function(){const out=base.apply(this,arguments);splitRepository();return out};splitRepository()}
    $('dfRepositoryTeam')?.addEventListener('change',()=>window.dfRepositoryRender?.());
    const clear=$('dfRepositoryClear');clear?.addEventListener('click',()=>{if($('dfRepositoryTeam'))$('dfRepositoryTeam').value='all'});
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · TEAM SPLIT & 2-PAGE PRINT');$('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
