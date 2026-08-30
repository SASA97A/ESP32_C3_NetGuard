#pragma once
#include <Arduino.h>

const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>C3 Parental Controls</title><style>
body{font:14px system-ui,sans-serif;margin:0;background:#0d1117;color:#c9d1d9}
header{background:#161b22;padding:14px 18px;border-bottom:1px solid #30363d}
h1{margin:0;font-size:18px}h1 span{color:#3fb950}.wrap{padding:16px;max-width:900px;margin:auto}
.cards{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;flex:1;min-width:240px;box-sizing:border-box}
.card h3{margin:0 0 12px;font-size:15px;color:#f0f6fc}
.form-group{margin-bottom:10px}
.form-group label{display:block;font-size:12px;color:#8b949e;margin-bottom:4px}
input,select{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;padding:6px 10px;font-size:13px;width:100%;box-sizing:border-box}
table{width:100%;border-collapse:collapse;background:#161b22;border-radius:8px;overflow:hidden;margin-bottom:18px;border:1px solid #30363d}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}
th{background:#21262d;color:#8b949e;font-weight:600}tr:hover td{background:#1c2128}
.b{color:#f85149;font-weight:600}.a{color:#3fb950;font-weight:600}.tag{background:#30363d;border-radius:4px;padding:2px 8px;font-size:11px}
button{background:#238636;color:#ffffff;border:1px solid #30363d;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer}
button:hover{background:#2ea043}
.btn-sec{background:#21262d;border:1px solid #30363d}
.btn-sec:hover{background:#30363d}
.btn-sm{padding:3px 8px;font-size:12px;border-radius:4px}
h2{font-size:16px;color:#c9d1d9;margin:24px 0 12px;border-bottom:1px solid #21262d;padding-bottom:6px}
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(13,17,23,0.95);display:flex;align-items:center;justify-content:center;z-index:9999}
.modal{background:#161b22;border:1px solid #f85149;padding:24px;border-radius:8px;max-width:360px;width:100%;box-sizing:border-box}
.add-dev-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.add-dev-row .fg{flex:1;min-width:140px}
</style></head><body>
<div id=pwdModal class=modal-overlay style="display:none">
<div class=modal>
<h2 style="color:#f85149;margin-top:0">SECURITY WARNING</h2>
<p>You are using the default password. Please choose a new admin password to continue.</p>
<div style=margin-bottom:8px><input id=np1 type=password placeholder="New password"></div>
<div style=margin-bottom:12px><input id=np2 type=password placeholder="Confirm new password"></div>
<button onclick=changeDefaultPwd() style="width:100%">Set New Password</button>
<div id=pmsg style="color:#f85149;font-size:12px;margin-top:8px"></div>
</div>
</div>
<header><h1>C3 Parental Controls <span id=host></span></h1></header>
<div class=wrap>
<h2>GENERAL SETTINGS</h2>
<div class=card style="max-width:400px;margin-bottom:16px">
<div class=form-group>
<label for=tz>Timezone (POSIX String)</label>
<input id=tz placeholder="e.g. UTC0 or EST5EDT,M3.2.0,M11.1.0">
</div>
</div>

<h2>PROFILES</h2>
<div class=cards id=profCards></div>

<div style="margin-bottom:24px;display:flex;align-items:center;gap:10px">
<button type=button class=btn-sec onclick=addGroup()>Add New Group</button>
<button type=button onclick=saveProfiles()>Save Profiles</button>
<span id=saveMsg style="color:#8b949e;font-size:13px"></span>
</div>

<h2>CLIENT TABLE</h2>
<table id=ct>
<thead><tr><th>Name</th><th>IP Address</th><th>MAC Address</th><th>Status</th><th>Profile Assignment</th></tr></thead>
<tbody></tbody>
</table>

<div class=card style="margin-bottom:24px">
<h3 style="margin-bottom:10px">Add Device Manually</h3>
<div class=add-dev-row>
<div class=fg><label style="font-size:12px;color:#8b949e;display:block;margin-bottom:4px">MAC Address</label><input id=addMac placeholder="AA:BB:CC:DD:EE:FF"></div>
<div class=fg><label style="font-size:12px;color:#8b949e;display:block;margin-bottom:4px">Friendly Name</label><input id=addName placeholder="Device Name"></div>
<div class=fg><label style="font-size:12px;color:#8b949e;display:block;margin-bottom:4px">Dropdown Group</label><select id=addGroupSelect></select></div>
<div><button type=button onclick=addDevice()>Add Device</button></div>
</div>
<div id=addDevMsg style="margin-top:8px;font-size:12px;color:#f85149"></div>
</div>
</div>

<script>
let T='';
let currentProfiles=[];
let lastClients=[];

function mut(p){return p+(p.includes('?')?'&':'?')+'token='+T}
function minToTime(m){if(m===null||m===undefined||m<0)return'';let h=Math.floor(m/60).toString().padStart(2,'0'),min=(m%60).toString().padStart(2,'0');return h+':'+min;}
function timeToMin(t){if(!t)return -1;let p=t.split(':');if(p.length!==2)return -1;return parseInt(p[0],10)*60+parseInt(p[1],10);}
function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function renderProfiles(){
  let el=document.getElementById('profCards');
  if(!el)return;
  el.innerHTML=currentProfiles.map((p,i)=>`
    <div class=card>
      <h3>Group ${i}</h3>
      <div class=form-group><label>Group Name</label><input class=p_name value="${escHtml(p.name)}"></div>
      <div class=form-group><label>Bedtime Start</label><input type=time class=p_start value="${minToTime(p.start)}"></div>
      <div class=form-group><label>Bedtime End</label><input type=time class=p_end value="${minToTime(p.end)}"></div>
      <div class=form-group><label>Upstream DNS IP</label><input class=p_dns placeholder="9.9.9.9" value="${escHtml(p.dns)}"></div>
    </div>
  `).join('');
}

function readProfilesFromDOM(){
  let cards=document.querySelectorAll('#profCards .card');
  if(cards.length===0)return;
  currentProfiles=[];
  cards.forEach(c=>{
    currentProfiles.push({
      name: c.querySelector('.p_name').value.trim(),
      start: timeToMin(c.querySelector('.p_start').value),
      end: timeToMin(c.querySelector('.p_end').value),
      dns: c.querySelector('.p_dns').value.trim()
    });
  });
}

function addGroup(){
  readProfilesFromDOM();
  currentProfiles.push({name:'New Group',start:-1,end:-1,dns:''});
  renderProfiles();
}

async function load(){
  try{
    let s=await(await fetch('/stats.json')).json();
    T=s.token||'';
    if(s.defpwd){pwdModal.style.display='flex';return;}else{pwdModal.style.display='none';}
    host.textContent='@ '+(s.ip||'');
    if(document.activeElement!==tz) tz.value=s.timezone||'UTC0';
    if(s.profiles){
      if(!profCards.contains(document.activeElement)){
        currentProfiles=s.profiles;
        renderProfiles();
      }
      if(document.activeElement!==addGroupSelect){
        let curVal=addGroupSelect.value;
        addGroupSelect.innerHTML=s.profiles.map((p,i)=>`<option value="${i}">${escHtml(p.name||('Group '+i))}</option>`).join('');
        if(curVal) addGroupSelect.value=curVal;
      }
    }
    if(s.clients){
      lastClients=s.clients;
      ct.tBodies[0].innerHTML=s.clients.map(c=>{
        let opts=(s.profiles||[]).map((p,i)=>`<option value="${i}" ${c.profile===i?'selected':''}>${escHtml(p.name||('Group '+i))}</option>`).join('');
        let displayName=c.name||'Unknown';
        return `<tr>
          <td>
            <span>${escHtml(displayName)}</span>
            <button class="btn-sec btn-sm" style="margin-left:6px" onclick="editName('${c.mac}')">✎</button>
          </td>
          <td>${c.ip||'&mdash;'}</td>
          <td><code>${c.mac}</code></td>
          <td><span class="${c.blocked?'b':'a'}">${c.blocked?'BLOCKED':'ALLOWED'}</span></td>
          <td>
            <select style="width:auto" onchange="assignClient('${c.mac}',this.value)">
              ${opts}
            </select>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" style="color:#8b949e;text-align:center">No clients connected yet</td></tr>';
    }
  }catch(e){console.error(e);}
}

async function saveProfiles(){
  saveMsg.textContent='Saving...';
  saveMsg.style.color='#8b949e';
  readProfilesFromDOM();
  let body={
    timezone: tz.value.trim(),
    profiles: currentProfiles
  };
  try{
    let r=await fetch(mut('/api/profiles'),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if(r.ok){
      saveMsg.textContent='Saved successfully!';
      saveMsg.style.color='#3fb950';
      setTimeout(()=>saveMsg.textContent='',3000);
      load();
    }else{
      saveMsg.textContent='Failed to save settings.';
      saveMsg.style.color='#f85149';
    }
  }catch(e){
    saveMsg.textContent='Error connecting to server.';
    saveMsg.style.color='#f85149';
  }
}

async function assignClient(mac, val){
  try{
    let r=await fetch(mut('/api/assign?mac='+encodeURIComponent(mac)+'&profile='+val),{method:'POST'});
    if(r.ok){ load(); }
  }catch(e){console.error(e);}
}

async function editName(mac){
  let c=lastClients.find(x=>x.mac===mac);
  let oldName=c?(c.name||''):'';
  let curProf=c?c.profile:0;
  let n=prompt("Enter name:", oldName);
  if(n!==null){
    try{
      let url='/api/assign?mac='+encodeURIComponent(mac)+'&profile='+curProf+'&name='+encodeURIComponent(n);
      let r=await fetch(mut(url),{method:'POST'});
      if(r.ok){ load(); }
    }catch(e){console.error(e);}
  }
}

async function addDevice(){
  let mac=addMac.value.trim();
  let name=addName.value.trim();
  let group=addGroupSelect.value;
  if(!mac){
    addDevMsg.textContent='MAC address is required.';
    return;
  }
  addDevMsg.textContent='';
  try{
    let url='/api/assign?mac='+encodeURIComponent(mac)+'&profile='+encodeURIComponent(group)+'&name='+encodeURIComponent(name);
    let r=await fetch(mut(url),{method:'POST'});
    if(r.ok){
      addMac.value='';
      addName.value='';
      load();
    }else{
      addDevMsg.textContent='Failed to add device.';
    }
  }catch(e){
    addDevMsg.textContent='Error adding device.';
  }
}

async function changeDefaultPwd(){
  let p1=np1.value.trim(),p2=np2.value.trim();
  if(!p1||p1.length<4){pmsg.textContent='min 4 chars required';return;}
  if(p1!==p2){pmsg.textContent='passwords do not match';return;}
  if(p1==='admin123'){pmsg.textContent='choose a password other than admin123';return;}
  let r=await fetch(mut('/setpass?p='+encodeURIComponent(p1)));
  if(r.ok){alert('Password changed! Please log in with your new password.');location.reload();}
  else{pmsg.textContent='failed to change password';}
}

load();
setInterval(load,5000);
</script></body></html>)HTML";

const char PORTAL_HTML[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>C3 AdBlock Setup</title><style>
body{font:14px system-ui,sans-serif;margin:0;background:#0d1117;color:#c9d1d9}
.wrap{padding:24px;max-width:400px;margin:auto;margin-top:20px}
input{width:100%;box-sizing:border-box;margin:4px 0 12px;padding:10px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:5px}
.pwd-wrap{position:relative;width:100%}
.pwd-wrap input{padding-right:40px}
.eye{position:absolute;right:10px;top:10px;cursor:pointer;user-select:none;font-size:16px;opacity:0.7}
.eye:hover{opacity:1}
button{width:100%;padding:12px;background:#238636;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:15px;margin-bottom:10px}
h1{font-size:20px}p{color:#8b949e}
.net-list{margin:10px 0;max-height:180px;overflow-y:auto;border:1px solid #30363d;border-radius:5px;background:#161b22}
.net-item{padding:10px;border-bottom:1px solid #21262d;cursor:pointer;display:flex;justify-space:between}
.net-item:hover{background:#21262d}
.rssi{color:#8b949e;font-size:12px}
</style></head><body><div class=wrap>
<h1>C3 AdBlock Setup</h1>
<p>Select a network or type SSID manually.</p>
<button type=button id=sbtn onclick=scan() style="background:#21262d;border:1px solid #30363d">Scan Wi-Fi Networks</button>
<div id=nets class=net-list style="display:none"></div>
<form action=/save-wifi method=post>
<input id=ssid name=ssid placeholder="WiFi name" required>
<div class=pwd-wrap>
  <input id=pass name=pass type=password placeholder="WiFi password" required>
  <span class=eye id=eye onclick=togglePass()>👁️</span>
</div>
<button>Connect</button>
</form></div>
<script>
async function scan(){
  let b=document.getElementById('sbtn'), n=document.getElementById('nets');
  b.textContent='Scanning...'; b.disabled=true;
  try{
    let r=await fetch('/scan-wifi');
    let data=await r.json();
    n.innerHTML=data.map(w=>`<div class=net-item onclick="sel('${w.ssid}')"><span>${w.ssid} ${w.sec?'🔒':''}</span><span class=rssi>${w.rssi} dBm</span></div>`).join('');
    n.style.display='block';
  }catch(e){ alert('Scan failed, try again'); }
  b.textContent='Scan Wi-Fi Networks'; b.disabled=false;
}
function sel(s){ document.getElementById('ssid').value=s; }
function togglePass(){
  let p=document.getElementById('pass');
  p.type = p.type==='password' ? 'text' : 'password';
}
</script></body></html>)HTML";
