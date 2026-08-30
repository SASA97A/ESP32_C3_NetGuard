#pragma once
#include <Arduino.h>

const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>C3 AdBlock</title><style>
body{font:14px system-ui,sans-serif;margin:0;background:#0d1117;color:#c9d1d9}
header{background:#161b22;padding:14px 18px;border-bottom:1px solid #30363d}
h1{margin:0;font-size:18px}h1 span{color:#3fb950}.wrap{padding:16px;max-width:1000px;margin:auto}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 16px;flex:1;min-width:120px}
.card .v{font-size:22px;font-weight:600}.card .l{color:#8b949e;font-size:12px}
table{width:100%;border-collapse:collapse;background:#161b22;border-radius:8px;overflow:hidden;margin-bottom:18px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}
th{background:#21262d;color:#8b949e}tr:hover td{background:#1c2128}
.b{color:#f85149}.a{color:#3fb950}.tag{background:#30363d;border-radius:4px;padding:1px 6px;font-size:11px}
button{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:5px;padding:4px 9px;cursor:pointer}
button:hover{background:#30363d}.ban{color:#f85149}input{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;padding:6px}
h2{font-size:14px;color:#8b949e;margin:18px 0 8px}
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(13,17,23,0.95);display:flex;align-items:center;justify-content:center;z-index:9999}
.modal{background:#161b22;border:1px solid #f85149;padding:24px;border-radius:8px;max-width:360px;width:100%;box-sizing:border-box}
</style></head><body>
<div id=pwdModal class=modal-overlay style="display:none">
<div class=modal>
<h2 style="color:#f85149;margin-top:0">SECURITY WARNING</h2>
<p>You are using the default password. Please choose a new admin password to continue.</p>
<div style=margin-bottom:8px><input id=np1 type=password placeholder="New password" style=width:100%;box-sizing:border-box></div>
<div style=margin-bottom:12px><input id=np2 type=password placeholder="Confirm new password" style=width:100%;box-sizing:border-box></div>
<button onclick=changeDefaultPwd() style="width:100%;background:#238636;padding:8px">Set New Password</button>
<div id=pmsg style="color:#f85149;font-size:12px;margin-top:8px"></div>
</div>
</div>
<header><h1>C3 AdBlock <span id=host></span></h1></header><div class=wrap>
<div class=cards id=sys></div>
<h2>CLIENTS</h2><table id=ct><thead><tr><th>Client</th><th>MAC</th><th>Blocked</th><th>Allowed</th><th></th></tr></thead><tbody></tbody></table>
<h2>CUSTOM BLOCKED DOMAINS</h2>
<div style=margin-bottom:8px><input id=dom placeholder="ads.example.com" size=30><button onclick=addDom()>Block domain</button></div>
<table id=cl><tbody></tbody></table>
<h2>BLOCKLIST &mdash; UPLOAD</h2>
<form id=upf style=margin-bottom:6px><input type=file id=blf accept=.bin><button>Upload blocklist</button> <span id=upmsg style=color:#8b949e></span></form>
<div style="color:#8b949e;font-size:12px;margin-bottom:18px">build <code>blocklist.bin</code> with <code>tools/build_blocklist.py</code>, then upload here &mdash; no USB</div>
<h2>BLOCKLIST &mdash; REMOTE AUTO-UPDATE</h2>
<div style=margin-bottom:6px><input id=uurl placeholder="https://host/blocklist.bin" size=40> every <input id=uiv size=2 value=24>h
<button onclick=saveUpd()>Save</button> <button onclick=fetchNow()>Fetch now</button></div>
<div style="color:#8b949e;font-size:12px;margin-bottom:18px">device pulls a prebuilt <code>blocklist.bin</code> on a schedule. last: <span id=ustat>&mdash;</span></div>
<h2>DHCP SERVER <span id=dhcpst class=tag></span></h2>
<div style=margin-bottom:18px><button onclick=toggleDhcp()>Enable / Disable DHCP</button>
<span style="color:#8b949e;font-size:12px;margin-left:8px">disables router DHCP for you &mdash; C3 hands out its own IP as DNS</span></div>
<h2>WIFI NETWORK</h2>
<div style=margin-bottom:6px>Current: <span id=wifi style=color:#3fb950></span></div>
<div style=margin-bottom:18px><input id=wssid placeholder="New SSID" size=20> <input id=wpass type=password placeholder="New password" size=20>
<button onclick=saveWifi()>Change WiFi</button> <span id=wmsg style=color:#8b949e></span></div>
<h2>CHANGE ADMIN PASSWORD</h2>
<div style=margin-bottom:18px><input id=dpass type=password placeholder="New admin password" size=20>
<button onclick=changeDashPwd()>Update Password</button> <span id=dpmsg style=color:#8b949e></span></div>
<h2>FIRMWARE &mdash; OTA UPDATE</h2>
<form id=fwf style=margin-bottom:6px><input type=file id=fwb accept=.bin><button>Flash firmware</button> <span id=fwmsg style=color:#8b949e></span></form>
<div style="color:#8b949e;font-size:12px;margin-bottom:18px">upload <code>.pio/build/c3/firmware.bin</code> &mdash; device verifies it and reboots into it</div>
</div><script>
let T='';
function fmt(n){return n.toLocaleString()}
function mut(p){return p+(p.includes('?')?'&':'?')+'token='+T}
async function load(){let s=await(await fetch('/stats.json')).json();
T=s.token||'';
if(s.defpwd){pwdModal.style.display='flex';return;}else{pwdModal.style.display='none';}
host.textContent='@ '+s.ip;
sys.innerHTML=[['Total blocked',fmt(s.blocked),'b'],['Total allowed',fmt(s.allowed),'a'],['Blocklist',fmt(s.domains)+' domains',''],
['Bloom',s.bloom||'off',''],['Pending',s.pending||0,''],['Clients',s.clients.length,''],
['WiFi',s.rssi+' dBm',''],['Temp',s.temp+' C',''],['Free RAM',Math.round(s.heap/1024)+' KB',''],['Uptime',s.uptime,'']]
.map(c=>`<div class=card><div class="v ${c[2]}">${c[1]}</div><div class=l>${c[0]}</div></div>`).join('');
ct.tBodies[0].innerHTML=s.clients.sort((a,b)=>(b.blocked+b.allowed)-(a.blocked+a.allowed)).map(c=>
`<tr><td>${c.ip}${c.banned?' <span class=tag style=color:#f85149>BANNED</span>':''}</td><td>${c.mac}</td>
<td class=b>${fmt(c.blocked)}</td><td class=a>${fmt(c.allowed)}</td>
<td><button class=ban onclick="fetch(mut('/ban?ip=${c.ip}')).then(load)">${c.banned?'Unban':'Ban'}</button></td></tr>`).join('');
cl.tBodies[0].innerHTML=s.custom.map(d=>`<tr><td>${d}</td><td style=text-align:right><button onclick="fetch(mut('/unblock?d='+encodeURIComponent('${d}')).then(load)">remove</button></td></tr>`).join('')||'<tr><td style=color:#8b949e>none yet</td></tr>';
if(document.activeElement!=uurl)uurl.value=s.upurl||'';
if(document.activeElement!=uiv)uiv.value=s.upiv||24;
ustat.textContent=s.upstat||'—';
dhcpst.textContent=s.dhcp?'ON':'OFF';
dhcpst.style.color=s.dhcp?'#3fb950':'#8b949e';
wifi.textContent=s.wifi||'—';}
async function changeDefaultPwd(){
let p1=np1.value.trim(),p2=np2.value.trim();
if(!p1||p1.length<4){pmsg.textContent='min 4 chars required';return;}
if(p1!==p2){pmsg.textContent='passwords do not match';return;}
if(p1==='admin123'){pmsg.textContent='choose a password other than admin123';return;}
let r=await fetch(mut('/setpass?p='+encodeURIComponent(p1)));
if(r.ok){alert('Password changed! Please log in with your new password.');location.reload();}
else{pmsg.textContent='failed to change password';}
}
async function changeDashPwd(){
let p=dpass.value.trim();if(!p||p.length<4){dpmsg.textContent='min 4 chars required';return;}
dpmsg.textContent='saving...';
let r=await fetch(mut('/setpass?p='+encodeURIComponent(p)));
if(r.ok){dpmsg.textContent='saved! Please log in with new password';setTimeout(()=>location.reload(),1000);}
else{dpmsg.textContent='failed';}
}
function addDom(){let d=dom.value.trim();if(d){fetch(mut('/addblock?d='+encodeURIComponent(d))).then(()=>{dom.value='';load()})}}
function saveUpd(){fetch(mut('/setupdate?u='+encodeURIComponent(uurl.value.trim())+'&h='+(parseInt(uiv.value)||24))).then(load)}
function fetchNow(){ustat.textContent='fetching...';fetch(mut('/fetchnow')).then(r=>r.text()).then(t=>{ustat.textContent=t;load()})}
function toggleDhcp(){fetch(mut('/dhcp')).then(r=>r.text()).then(t=>{alert(t);load()})}
function saveWifi(){let s=wssid.value.trim(),p=wpass.value.trim();if(!s){wmsg.textContent='enter SSID';return}
wmsg.textContent='saving...';fetch(mut('/setwifi?ssid='+encodeURIComponent(s)+'&pass='+encodeURIComponent(p))).then(r=>r.text()).then(t=>{wmsg.textContent=t;})}
fwf.onsubmit=async e=>{e.preventDefault();let f=fwb.files[0];if(!f)return;fwmsg.textContent='flashing '+(f.size/1048576).toFixed(2)+' MB...';
let fd=new FormData();fd.append('f',f);
try{let r=await fetch(mut('/update'),{method:'POST',body:fd});fwmsg.textContent=r.ok?'rebooting, reconnect in ~15s':'failed: '+await r.text();}
catch(_){fwmsg.textContent='rebooting, reconnect in ~15s';}};
upf.onsubmit=async e=>{e.preventDefault();let f=blf.files[0];if(!f)return;
upmsg.textContent='uploading '+(f.size/1048576).toFixed(2)+' MB...';
let fd=new FormData();fd.append('f',f);
try{let r=await fetch(mut('/upload'),{method:'POST',body:fd});upmsg.textContent=r.ok?'updated':'failed: '+await r.text();}
catch(_){upmsg.textContent='upload failed';}
blf.value='';setTimeout(load,600);};
load();setInterval(load,3000);
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