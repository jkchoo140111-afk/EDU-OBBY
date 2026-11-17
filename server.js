const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:false}});
const PORT=process.env.PORT||3000,DB=process.env.DATA_FILE||path.join(__dirname,'data','accounts.json');
fs.mkdirSync(path.dirname(DB),{recursive:true});
function readDB(){try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch{return {}}}
let db=readDB();function writeDB(){const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB)}
app.use(express.json({limit:'32kb'}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
const sessions=new Map();function session(req,res,next){let sid=req.headers.cookie?.match(/(?:^|; )edu_sid=([^;]+)/)?.[1];if(!sid||!sessions.has(sid)){sid=crypto.randomBytes(24).toString('hex');sessions.set(sid,null);res.setHeader('Set-Cookie',`edu_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`)}req.sid=sid;req.user=sessions.get(sid);next()}
app.use(session);
const defaults=()=>({coins:0,unlocked:['lucky'],skin:'lucky',level:1,solved:0,savedReturn:{x:0,y:1,z:2,yaw:0,pitch:-.08,valid:false},player:{x:0,y:1,z:2},yaw:0,pitch:-.08});
function hash(pass,salt){return crypto.scryptSync(pass,salt,64).toString('hex')}
function safeAccount(a){const {salt,passHash,...v}=a;return v}
app.post('/api/signup',(req,res)=>{const nick=String(req.body.nick||'').trim(),pass=String(req.body.password||'');if(nick.length<2||nick.length>16||!/^[\p{L}\p{N}_-]+$/u.test(nick))return res.status(400).json({error:'닉네임은 2~16자의 한글·영문·숫자·_-만 사용할 수 있어요.'});if(pass.length<6||pass.length>128)return res.status(400).json({error:'비밀번호는 6~128자로 입력해 주세요.'});if(db[nick])return res.status(409).json({error:'이미 사용 중인 닉네임이에요.'});const salt=crypto.randomBytes(16).toString('hex');db[nick]={...defaults(),salt,passHash:hash(pass,salt)};writeDB();sessions.set(req.sid,nick);res.json({account:safeAccount(db[nick])})});
app.post('/api/login',(req,res)=>{const nick=String(req.body.nick||''),pass=String(req.body.password||''),a=db[nick];if(!a||!a.salt||!a.passHash||!crypto.timingSafeEqual(Buffer.from(hash(pass,a.salt),'hex'),Buffer.from(a.passHash,'hex')))return res.status(401).json({error:'닉네임 또는 비밀번호가 맞지 않아요.'});sessions.set(req.sid,nick);res.json({account:safeAccount(a)})});
app.post('/api/logout',(req,res)=>{sessions.set(req.sid,null);res.json({ok:true})});
app.post('/api/progress',(req,res)=>{if(!req.user||!db[req.user])return res.status(401).json({error:'로그인이 필요합니다.'});const b=req.body||{},a=db[req.user];a.coins=Math.max(0,Math.min(1e9,Number(b.coins)||0));a.unlocked=Array.isArray(b.unlocked)?b.unlocked.filter(x=>['lucky','lucy','blaze','zippy','nova','roy'].includes(x)):['lucky'];if(!a.unlocked.includes('lucky'))a.unlocked.push('lucky');a.skin=a.unlocked.includes(b.skin)?b.skin:'lucky';a.level=Math.max(1,Math.min(9999,Number(b.level)||1));a.solved=Math.max(0,Math.min(6,Number(b.solved)||0));for(const k of ['savedReturn','player'])if(b[k]&&typeof b[k]==='object')a[k]=b[k];a.yaw=Number(b.yaw)||0;a.pitch=Number(b.pitch)||0;writeDB();res.json({ok:true})});
const sockets=new Map();io.on('connection',socket=>{let nick=null;socket.on('join',d=>{if(!socket.request.headers.cookie)return;const sid=socket.request.headers.cookie.match(/(?:^|; )edu_sid=([^;]+)/)?.[1];nick=sid?sessions.get(sid):null;if(!nick)return;socket.data.nick=nick;sockets.set(socket.id,{nick,x:0,y:1,z:2,yaw:0,skin:'lucky',level:1});broadcast();socket.broadcast.emit('notice',nick+'님이 접속했습니다.');});socket.on('state',p=>{if(!nick||!sockets.has(socket.id)||!p)return;const q=sockets.get(socket.id);for(const k of ['x','y','z','yaw'])if(Number.isFinite(Number(p[k])))q[k]=Math.max(-10000,Math.min(10000,Number(p[k])));q.skin=['lucky','lucy','blaze','zippy','nova','roy'].includes(p.skin)?p.skin:'lucky';q.level=Math.max(1,Math.min(9999,Number(p.level)||1));broadcast()});socket.on('disconnect',()=>{if(sockets.delete(socket.id)){broadcast();if(nick)socket.broadcast.emit('notice',nick+'님이 나갔습니다.')}})});
function broadcast(){const list={};for(const [id,p] of sockets)list[id]=p;io.emit('players',list)}
server.listen(PORT,'0.0.0.0',()=>console.log('EDU OBBY ONLINE listening on '+PORT));
